/**
 * shoppingListSync.ts — server pull/merge and pending-sync logic for the
 * shopping-list feature. Mirrors expenseSync.ts's shape: pure exported merge
 * helper (unit-tested) + a pull-and-merge orchestrator that takes Zustand's
 * `set` so it shares store state without a circular import.
 *
 * Architecture note (see task-4 brief): the local SQLite row `id` for both
 * lists and items IS the `clientId`, permanently — the server resolves
 * lists/items by `OR:[{id},{clientId}]`, so this file never adopts/rewrites
 * a server-generated id onto a local row. `markShoppingListSynced`/
 * `markShoppingListItemSynced` are always called WITHOUT a serverId.
 */
import { withTransaction } from '@/db/client';
import {
  getAllShoppingLists,
  upsertShoppingList,
  deleteShoppingList,
  getPendingShoppingLists,
  markShoppingListSynced,
  getShoppingListCreatedAtMap,
} from '@/db/shoppingListRepository';
import {
  getItemsForList,
  upsertShoppingListItem,
  softDeleteShoppingListItem,
  getPendingShoppingListItems,
  markShoppingListItemSynced,
  getShoppingListItemCreatedAtMap,
} from '@/db/shoppingListItemRepository';
import type { ShoppingList, ShoppingListItem } from '@budget/shared-types';
import { api } from '@/services/api';
import { useAccountStore } from './accountStore';

// Minimal store-state shape the sync functions need from useShoppingListStore
interface SyncableState {
  lists: ShoppingList[];
  isLoading: boolean;
  error: string | null;
}

type StoreSet = (
  updater:
    | Partial<SyncableState>
    | ((state: SyncableState) => Partial<SyncableState>),
) => void;

// ─── mergeServerLists (pure, tested) ────────────────────────────────────────

/**
 * Reconciles a local (SQLite) collection against the server's authoritative
 * collection, keyed by `clientId`.
 *
 * - `toUpsert` = every server row EXCEPT one whose local counterpart is still
 *   `syncStatus === 'pending'` (an unpushed local rename/archive/edit this
 *   cycle) — upserting the server's stale value there would overwrite the
 *   pending edit and falsely mark it synced, silently dropping it. A server
 *   row with no local counterpart (new elsewhere) is always upserted.
 * - `toTombstone` = local rows whose `syncStatus === 'synced'` AND whose
 *   `clientId` is absent from the server set — i.e. the server no longer has
 *   them (deleted elsewhere), so the local copy should be soft-deleted too.
 * - A local row with `syncStatus === 'pending'` is left untouched either way
 *   (it hasn't been pushed yet, so its absence from `server` proves nothing).
 *
 * Reused for both shopping lists and (per-list) shopping-list items — the
 * shape is identical, only the entity differs.
 */
export function mergeServerLists<
  TLocal extends { clientId: string; syncStatus?: string },
  TServer extends { clientId: string },
>(local: TLocal[], server: TServer[]): { toUpsert: TServer[]; toTombstone: string[] } {
  const serverClientIds = new Set(server.map((s) => s.clientId));
  const toTombstone = local
    .filter((l) => l.syncStatus === 'synced' && !serverClientIds.has(l.clientId))
    .map((l) => l.clientId);
  const localByClientId = new Map(local.map((l) => [l.clientId, l]));
  const toUpsert = server.filter((s) => {
    const loc = localByClientId.get(s.clientId);
    return !loc || loc.syncStatus !== 'pending';
  });
  return { toUpsert, toTombstone };
}

// ─── local helpers ───────────────────────────────────────────────────────────

async function loadLocalListsWithItems(
  accountId: string,
  includeArchived = false,
): Promise<ShoppingList[]> {
  const lists = await getAllShoppingLists(accountId, includeArchived);
  const withItems: ShoppingList[] = [];
  // Sequential (not Promise.all) — avoids contending on the single SQLite
  // connection, same convention as hydrateTransactions.ts.
  for (const list of lists) {
    const items = await getItemsForList(list.id);
    withItems.push({ ...list, items });
  }
  return withItems;
}

async function pushPendingLists(accountId: string): Promise<void> {
  const pending = await getPendingShoppingLists(accountId);
  for (const list of pending) {
    try {
      if (list.isDeleted) {
        await api.deleteList(list.clientId);
      } else {
        // createList is idempotent on (accountId, clientId) — for a list the
        // server already has, it returns the EXISTING row UNCHANGED. So an
        // offline rename/archive (which only bumps sync_status to 'pending'
        // on an already-synced row) would otherwise never reach the server.
        // Always follow up with updateList so field edits propagate too.
        await api.createList({ clientId: list.clientId, name: list.name });
        await api.updateList(list.clientId, {
          name: list.name,
          isArchived: list.isArchived,
        });
      }
      await markShoppingListSynced(list.id);
    } catch (e) {
      // Offline (or server error) — row stays 'pending' and retries next hydrate().
      console.warn('Shopping list push deferred (offline?):', e);
    }
  }
}

async function pushPendingItems(accountId: string): Promise<void> {
  const pending = await getPendingShoppingListItems(accountId);
  for (const item of pending) {
    try {
      if (item.isDeleted) {
        await api.deleteItem(item.clientId);
      } else {
        // addItem's create DTO has no `isChecked` — if a pending-created item
        // was checked before it ever synced, follow up with an update so that
        // state isn't silently lost.
        await api.addItem(item.shoppingListId, {
          clientId: item.clientId,
          canonicalName: item.canonicalName,
          rawLabel: item.rawLabel,
          quantity: item.quantity,
          note: item.note ?? undefined,
        });
        if (item.isChecked) {
          await api.updateItem(item.clientId, {
            isChecked: true,
            quantity: item.quantity,
          });
        }
      }
      await markShoppingListItemSynced(item.id);
    } catch (e) {
      console.warn('Shopping list item push deferred (offline?):', e);
    }
  }
}

// ─── pullAndMergeShoppingLists ───────────────────────────────────────────────

let _shoppingListSyncInflight: Promise<void> | null = null;

export function pullAndMergeShoppingLists(
  accountId: string,
  set: StoreSet,
): Promise<void> {
  // Re-entry guard: coalesce concurrent callers (hydrate() from a
  // useEffect + a useFocusEffect can both fire on the same tick).
  if (_shoppingListSyncInflight) return _shoppingListSyncInflight;

  _shoppingListSyncInflight = _doPullAndMerge(accountId, set);
  _shoppingListSyncInflight.finally(() => {
    _shoppingListSyncInflight = null;
  });
  return _shoppingListSyncInflight;
}

async function _doPullAndMerge(accountId: string, set: StoreSet): Promise<void> {
  set({ isLoading: true, error: null });
  try {
    // 1. Show local data immediately. Load the FULL local set (archived
    // included) for the merge context below, but only DISPLAY the
    // non-archived subset — the merge needs archived rows so a pending
    // local archive is protected from a stale server un-archive.
    const localLists = await loadLocalListsWithItems(accountId, true);
    if (useAccountStore.getState().currentAccountId !== accountId) return;
    set({ lists: localLists.filter((l) => !l.isArchived), isLoading: false });

    // 2. Push pending local → server (lists first — items need their parent
    // list to exist server-side before addItem can resolve it).
    await pushPendingLists(accountId);
    await pushPendingItems(accountId);

    // 3. Pull from server → local
    let serverLists: ShoppingList[];
    try {
      serverLists = await api.getLists();
    } catch (e) {
      // Offline — local data (already set above) stays displayed.
      console.warn('Shopping list server pull skipped (offline?):', e);
      return;
    }
    if (useAccountStore.getState().currentAccountId !== accountId) return;

    // Re-query pending sets *after* the push so the merge below reflects the
    // real, current SQLite state (rows that just synced are no longer pending).
    const [stillPendingLists, stillPendingItems] = await Promise.all([
      getPendingShoppingLists(accountId),
      getPendingShoppingListItems(accountId),
    ]);
    const pendingListClientIds = new Set(stillPendingLists.map((l) => l.clientId));
    const pendingItemClientIds = new Set(stillPendingItems.map((i) => i.clientId));

    const localListsForMerge = localLists.map((l) => ({
      clientId: l.clientId,
      syncStatus: pendingListClientIds.has(l.clientId) ? 'pending' : 'synced',
    }));
    const listMerge = mergeServerLists(localListsForMerge, serverLists);

    // Local items indexed by parent list clientId (captured pre-push — item
    // *content* doesn't change during push, only sync_status).
    const localItemsByList = new Map<string, ShoppingListItem[]>();
    for (const l of localLists) localItemsByList.set(l.clientId, l.items);

    // clientId -> original local createdAt (ms), so the upserts below don't
    // re-stamp createdAt on every merge for a row we've already seen.
    const [listCreatedAtMap, itemCreatedAtMap] = await Promise.all([
      getShoppingListCreatedAtMap(accountId),
      getShoppingListItemCreatedAtMap(accountId),
    ]);

    // 4. Merge inside a single transaction
    await withTransaction(async () => {
      for (const sl of listMerge.toUpsert) {
        const now = new Date();
        const existingListCreatedAt = listCreatedAtMap.get(sl.clientId);
        await upsertShoppingList({
          id: sl.clientId,
          accountId,
          clientId: sl.clientId,
          name: sl.name,
          isDefault: sl.isDefault,
          isArchived: sl.isArchived,
          sortOrder: sl.sortOrder,
          createdByUserId: sl.createdByUserId,
          items: [],
          isDeleted: false,
          syncStatus: 'synced',
          syncVersion: 0,
          createdAt:
            existingListCreatedAt !== undefined ? new Date(existingListCreatedAt) : now,
          updatedAt: now,
        });

        const localItemsForMerge = (localItemsByList.get(sl.clientId) ?? []).map((it) => ({
          clientId: it.clientId,
          syncStatus: pendingItemClientIds.has(it.clientId) ? 'pending' : 'synced',
        }));
        // sl.items are the nested items GET /shopping-list returns for this list.
        const itemMerge = mergeServerLists(localItemsForMerge, sl.items);

        for (const si of itemMerge.toUpsert) {
          const inow = new Date();
          const existingItemCreatedAt = itemCreatedAtMap.get(si.clientId);
          await upsertShoppingListItem({
            id: si.clientId,
            accountId,
            // IGNORE si.shoppingListId (the item payload's own value) — use
            // the PARENT list's clientId from this iteration's context so the
            // local FK stays clientId-consistent.
            shoppingListId: sl.clientId,
            clientId: si.clientId,
            canonicalName: si.canonicalName,
            rawLabel: si.rawLabel,
            quantity: si.quantity,
            note: si.note,
            isChecked: si.isChecked,
            addedByUserId: si.addedByUserId,
            sortOrder: si.sortOrder,
            isDeleted: false,
            syncStatus: 'synced',
            syncVersion: 0,
            createdAt:
              existingItemCreatedAt !== undefined ? new Date(existingItemCreatedAt) : inow,
            updatedAt: inow,
          });
        }
        for (const tombId of itemMerge.toTombstone) {
          await softDeleteShoppingListItem(tombId);
        }
      }

      // Lists the server no longer has (synced locally, absent from server)
      // → tombstone, cascading their local items too (mirrors the server's
      // own deleteList transaction, which soft-deletes child items).
      for (const tombId of listMerge.toTombstone) {
        const orphanItems = localItemsByList.get(tombId) ?? [];
        for (const oi of orphanItems) {
          await softDeleteShoppingListItem(oi.clientId);
        }
        await deleteShoppingList(tombId);
      }
    });

    // 5. Reload from SQLite after merge
    const merged = await loadLocalListsWithItems(accountId);
    if (useAccountStore.getState().currentAccountId !== accountId) return;

    // Web (no real SQLite): fall back to the freshly-pulled server rows, but
    // filter out archived ones — native's `merged` path already excludes them
    // (getAllShoppingLists filters is_archived=0), so the raw server fallback
    // must match that behavior or archived lists leak into the live web UI.
    set({ lists: merged.length > 0 ? merged : serverLists.filter((l) => !l.isArchived) });
  } catch (e) {
    console.error('Failed to load shopping lists from SQLite:', e);
    set({ error: 'Failed to load shopping lists', isLoading: false });
  }
}
