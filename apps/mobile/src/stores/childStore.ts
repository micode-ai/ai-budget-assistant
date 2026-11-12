import { create } from 'zustand';
import { Platform } from 'react-native';
import { randomUUID } from 'expo-crypto';
import type { Child, ExpenseChildLink } from '@budget/shared-types';
import * as childRepo from '@/db/childRepository';
import { clearExpenseItemChildren, setExpenseItemChild } from '@/db/expenseItemRepository';
import { withTransaction } from '@/db/client';
import { api } from '@/services/api';
import type { ChildDto } from '@/services/children.api';
import { maybeDecrypt } from '@/services/encryptionHelper';
import { useAccountStore } from './accountStore';
import {
  buildChildSyncChange,
  drainChildQueue,
  readEncryptionTier,
  resetChildSyncState,
} from './childSync';

/**
 * Children (child costs) and their attribution.
 *
 * Native is offline-first: every write lands in SQLite and the sync queue in
 * one transaction, then `drainChildQueue` replays the queue (see childSync.ts
 * for ordering and encryption). The local child `id` is the server's
 * `clientId` and never changes. Web has no SQLite and calls the REST routes
 * directly, updating state only on success.
 *
 * Whole-expense links and line attribution are mutually exclusive per expense
 * on the device as on the server: `setExpenseChildren` with children clears
 * the lines, `setItemChild` with a child removes the links.
 *
 * `children` holds archived children too (`archivedAt` set): they keep their
 * attributions and their statements. Screens filter for pickers.
 *
 * Child names are personal data of minors: nothing here logs a name.
 */

export const CHILD_NAME_MAX = 40;
const SHARE_SCALE = 10_000; // matches the server's Decimal(5, 4)
const SHARE_TOLERANCE = 0.001;
/** A pull triggered only to resolve unknown child ids runs at most this often. */
const MISSING_ID_PULL_INTERVAL_MS = 60_000;

interface ChildState {
  children: Child[];
  /** Server PK or local id -> local id. */
  childIdMap: Record<string, string>;
  isLoading: boolean;
  /** True once a load succeeded for the current account. A failed load leaves it false. */
  isLoaded: boolean;
  error: string | null;

  loadChildren: (accountId: string) => Promise<void>;
  createChild: (name: string, color?: string) => Promise<Child>;
  renameChild: (id: string, name: string) => Promise<void>;
  setChildColor: (id: string, color: string) => Promise<void>;
  setArchived: (id: string, archived: boolean) => Promise<void>;
  syncFromServer: () => Promise<void>;
  setExpenseChildren: (expenseId: string, childIds: string[], shares?: number[]) => Promise<void>;
  setItemChild: (expenseId: string, itemId: string, childId: string | null) => Promise<void>;
  /** Map server child PKs (from a pulled expense/income) to local ids; unknown ids are absent. */
  resolveServerChildIds: (ids: string[]) => Promise<Map<string, string>>;
  reset: () => void;
}

const initialState = {
  children: [] as Child[],
  childIdMap: {} as Record<string, string>,
  isLoading: false,
  isLoaded: false,
  error: null as string | null,
};

let lastMissingIdPullAt = 0;

function validateName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Child name is required');
  if (trimmed.length > CHILD_NAME_MAX) throw new Error(`Child name must be at most ${CHILD_NAME_MAX} characters`);
  return trimmed;
}

/** Equal shares at 4-decimal precision summing to exactly 1, remainder on the first (server rule). */
export function equalChildShares(n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(SHARE_SCALE / n);
  const units = Array.from({ length: n }, () => base);
  units[0] += SHARE_SCALE - base * n;
  return units.map((u) => u / SHARE_SCALE);
}

function resolveShares(n: number, shares: number[] | undefined): number[] {
  if (shares === undefined) return equalChildShares(n);
  if (shares.length !== n) throw new Error('shares must have one entry per child');
  if (shares.some((s) => !Number.isFinite(s) || s <= 0 || s > 1)) {
    throw new Error('shares must each be greater than 0 and at most 1');
  }
  const sum = shares.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > SHARE_TOLERANCE) throw new Error('shares must sum to 1');
  return shares;
}

const currentAccountId = () => useAccountStore.getState().currentAccountId;

/**
 * Reflect an expense's whole-expense links on the in-memory expense list.
 * `expenseStore` is required lazily: it imports `expenseSync`, which imports
 * this store, and a static import here pulled the whole expense graph into
 * every store that touches `accountStore` (which resets this one).
 */
function patchExpenseLinks(
  expenseId: string,
  links: { childId: string; share: number }[],
  hasLineChildren?: boolean,
) {
  const expenseChildren: ExpenseChildLink[] = links.map((l) => ({ expenseId, childId: l.childId, share: l.share }));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useExpenseStore } = require('./expenseStore') as typeof import('./expenseStore');
  useExpenseStore.setState((s) => ({
    expenses: s.expenses.map((e) =>
      e.id === expenseId
        ? { ...e, expenseChildren, ...(hasLineChildren !== undefined ? { hasLineChildren } : {}) }
        : e,
    ),
  }));
}

/** Web: set only the expense's `hasLineChildren` flag, leaving its links alone. */
function patchLineFlag(expenseId: string, hasLineChildren: boolean) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useExpenseStore } = require('./expenseStore') as typeof import('./expenseStore');
  useExpenseStore.setState((s) => ({
    expenses: s.expenses.map((e) => (e.id === expenseId ? { ...e, hasLineChildren } : e)),
  }));
}

/**
 * Reflect line attribution on the in-memory receipt lines (`expenseStore.expenseItems`),
 * which screens render from. `itemId` null means every line of the expense
 * (whole-expense attribution cleared them). Returns whether any live line of
 * the expense still carries a child, or undefined when its lines are not in memory.
 */
function patchItemChildren(expenseId: string, itemId: string | null, childId: string | null): boolean | undefined {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useExpenseStore } = require('./expenseStore') as typeof import('./expenseStore');
  const lines = useExpenseStore.getState().expenseItems[expenseId];
  if (!lines) return undefined;
  const next = lines.map((it) => (itemId === null || it.id === itemId ? { ...it, childId } : it));
  useExpenseStore.setState((s) => ({ expenseItems: { ...s.expenseItems, [expenseId]: next } }));
  return next.some((it) => !it.isDeleted && !!it.childId);
}

/** A server child -> local Child; an undecryptable encrypted name falls back to the local one. */
function toLocalChild(
  s: ChildDto,
  decrypted: Record<string, unknown>,
  accountId: string,
  fallbackName?: string,
  knownLocalId?: string,
): Child {
  const localId = knownLocalId ?? s.clientId ?? s.id;
  const decryptedName = typeof decrypted.name === 'string' ? decrypted.name : '';
  const undecrypted = !!s.encryptedPayload && decryptedName === s.name && decryptedName.startsWith('enc:');
  return {
    id: localId,
    accountId,
    clientId: localId,
    name: undecrypted ? (fallbackName ?? '') : decryptedName,
    color: s.color ?? undefined,
    archivedAt: s.archivedAt ?? null,
  };
}

/**
 * Web write of a child create/update. Plaintext REST on an unencrypted account;
 * `/sync/push` with a ciphertext on an encrypted one (`POST /children` takes a
 * plaintext name only). Fail closed: an unreadable tier or a locked key throws.
 */
async function writeChildOnWeb(
  accountId: string,
  operation: 'create' | 'update',
  child: Child,
  rest: { name?: string; color?: string; archived?: boolean },
): Promise<Child> {
  const tier = await readEncryptionTier(accountId);
  if (tier === 0) {
    if (operation === 'create') {
      const dto = await api.createChild({ name: child.name, color: child.color, clientId: child.id });
      return toLocalChild(dto, dto as unknown as Record<string, unknown>, accountId, child.name);
    }
    await api.updateChild(child.id, rest);
    return child;
  }
  const change = await buildChildSyncChange(accountId, tier, child.id, operation, {
    name: child.name,
    color: child.color,
    archivedAt: child.archivedAt ?? null,
  });
  if (!change) throw new Error('Encryption key is not available');
  const response = await api.pushChanges([change]);
  const result = response?.results?.[0];
  if (result?.status !== 'success') throw new Error(result?.error ?? 'Child change was not applied');
  return child;
}

/**
 * The child reference a REST write should carry for a local child id (e.g. an
 * income's 800+ mark). Native: the server PK once known — a child the server
 * adopted by name carries another device's clientId, so this device's local id
 * would not resolve there. Otherwise (web, not yet synced, null) the id as is;
 * the server resolves `OR:[{id},{clientId}]`.
 */
export async function serverChildRef(accountId: string, childId: string | null): Promise<string | null> {
  if (!childId || Platform.OS === 'web') return childId;
  try {
    return (await childRepo.getChildServerIds(accountId)).get(childId) ?? childId;
  } catch (e) {
    console.warn('[childStore] child server id lookup failed:', e instanceof Error ? e.message : String(e));
    return childId;
  }
}

export const useChildStore = create<ChildState>((set, get) => {
  /** GET /children (archived included) and merge into SQLite / state. */
  async function pullChildren(accountId: string): Promise<void> {
    if (Platform.OS === 'web' && get().children.length === 0) set({ isLoading: true });
    let server: ChildDto[];
    try {
      server = (await api.getChildren(true)) ?? [];
    } catch (e) {
      console.warn('[childStore] children pull failed:', e instanceof Error ? e.message : String(e));
      if (currentAccountId() === accountId) set({ isLoading: false, error: 'load_failed' });
      return;
    }
    if (currentAccountId() !== accountId) return;

    const decrypted = await Promise.all(
      server.map((s) => maybeDecrypt('child', s as unknown as Record<string, unknown>, accountId)),
    );
    // Native: a row this device already knows by its server PK keeps its local id, even when
    // the server row carries another device's clientId (the server adopted it by name). Keying
    // by `clientId` there would create a second local row and orphan this device's links.
    const records = Platform.OS === 'web' ? [] : await childRepo.getChildRecords(accountId);
    if (currentAccountId() !== accountId) return;
    const localIdByServerId = new Map<string, string>();
    for (const r of records) if (r.serverId) localIdByServerId.set(r.serverId, r.id);
    const localNames = new Map(get().children.map((c) => [c.id, c.name]));
    const built = server.map((s, i) => {
      const known = localIdByServerId.get(s.id);
      return toLocalChild(s, decrypted[i], accountId, localNames.get(known ?? s.clientId ?? s.id), known);
    });

    const idMap: Record<string, string> = {};
    server.forEach((s, i) => {
      idMap[s.id] = built[i].id;
      idMap[built[i].id] = built[i].id;
    });

    if (Platform.OS === 'web') {
      set({ children: built, childIdMap: idMap, isLoading: false, isLoaded: true, error: null });
      return;
    }

    const queue = await childRepo.getQueuedChildChanges(accountId);
    const queuedChildIds = new Set(queue.filter((q) => q.entityType === 'child').map((q) => q.entityId));
    const recordById = new Map(records.map((r) => [r.id, r]));
    const serverLocalIds = new Set(built.map((c) => c.id));
    const now = Date.now();

    await withTransaction(async () => {
      for (let i = 0; i < server.length; i++) {
        const c = built[i];
        // A local change not yet pushed is newer than the server's copy.
        if (queuedChildIds.has(c.id)) continue;
        await childRepo.upsertChild({
          id: c.id,
          serverId: server[i].id,
          accountId,
          // Never write an empty (undecryptable) name over a known one.
          name: c.name || recordById.get(c.id)?.name || '',
          color: c.color,
          archivedAt: c.archivedAt ?? null,
          isDeleted: false,
          syncStatus: 'synced',
          updatedAt: now,
        });
      }
      for (const r of records) {
        if (r.syncStatus === 'synced' && !serverLocalIds.has(r.id) && !queuedChildIds.has(r.id)) {
          await childRepo.softDeleteChildLocally(r.id);
        }
      }
    });

    const [children, repoMap] = await Promise.all([
      childRepo.getChildren(accountId, true),
      childRepo.getChildServerIdMap(accountId),
    ]);
    if (currentAccountId() !== accountId) return;
    set({
      children,
      childIdMap: { ...Object.fromEntries(repoMap), ...idMap },
      isLoading: false,
      isLoaded: true,
      error: null,
    });
  }

  /** Native: write a child row + its queue entry in one transaction, then drain. */
  async function writeChildLocally(
    accountId: string,
    child: Child,
    operation: 'create' | 'update',
  ): Promise<void> {
    await withTransaction(async () => {
      await childRepo.upsertChild({
        id: child.id,
        serverId: null,
        accountId,
        name: child.name,
        color: child.color,
        archivedAt: child.archivedAt ?? null,
        isDeleted: false,
        syncStatus: 'pending',
        updatedAt: Date.now(),
      });
      await childRepo.enqueueChildChange({
        entityType: 'child',
        entityId: child.id,
        operation,
        // A full snapshot: the drain coalesces a child's changes into one push.
        payload: {
          name: child.name,
          color: child.color,
          ...(operation === 'create' ? { clientId: child.id } : {}),
          archivedAt: child.archivedAt ?? null,
        },
        accountId,
      });
    });
  }

  async function updateChild(
    id: string,
    next: (c: Child) => Child,
    rest: { name?: string; color?: string; archived?: boolean },
  ): Promise<void> {
    const accountId = currentAccountId();
    if (!accountId) throw new Error('No account');
    const existing = get().children.find((c) => c.id === id);
    if (!existing) throw new Error('Child not found');
    const updated = next(existing);
    if (Platform.OS === 'web') {
      await writeChildOnWeb(accountId, 'update', updated, rest);
    } else {
      await writeChildLocally(accountId, updated, 'update');
      void drainChildQueue(accountId);
    }
    if (currentAccountId() !== accountId) return;
    set({ children: get().children.map((c) => (c.id === id ? updated : c)) });
  }

  return {
    ...initialState,

    loadChildren: async (accountId: string) => {
      if (!accountId) return;
      if (Platform.OS === 'web') {
        await pullChildren(accountId);
        return;
      }
      set({ isLoading: true, error: null });
      try {
        const [children, repoMap] = await Promise.all([
          childRepo.getChildren(accountId, true),
          childRepo.getChildServerIdMap(accountId),
        ]);
        if (currentAccountId() !== accountId) return;
        set({ children, childIdMap: Object.fromEntries(repoMap), isLoading: false, isLoaded: true });
      } catch (e) {
        console.warn('[childStore] failed to read children from SQLite:', e instanceof Error ? e.message : String(e));
        set({ isLoading: false, error: 'load_failed' });
        return;
      }
      void get().syncFromServer();
    },

    createChild: async (name: string, color?: string) => {
      const accountId = currentAccountId();
      if (!accountId) throw new Error('No account');
      const trimmed = validateName(name);
      const id = randomUUID();
      let child: Child = { id, accountId, clientId: id, name: trimmed, color, archivedAt: null };

      if (Platform.OS === 'web') {
        child = await writeChildOnWeb(accountId, 'create', child, {});
      } else {
        await writeChildLocally(accountId, child, 'create');
        void drainChildQueue(accountId);
      }
      if (currentAccountId() === accountId) {
        const others = get().children.filter((c) => c.id !== child.id);
        set({ children: [...others, child], childIdMap: { ...get().childIdMap, [child.id]: child.id } });
      }
      return child;
    },

    renameChild: async (id: string, name: string) => {
      const trimmed = validateName(name);
      await updateChild(id, (c) => ({ ...c, name: trimmed }), { name: trimmed });
    },

    setChildColor: async (id: string, color: string) => {
      await updateChild(id, (c) => ({ ...c, color }), { color });
    },

    setArchived: async (id: string, archived: boolean) => {
      await updateChild(
        id,
        (c) => ({ ...c, archivedAt: archived ? (c.archivedAt ?? new Date().toISOString()) : null }),
        { archived },
      );
    },

    syncFromServer: async () => {
      const accountId = currentAccountId();
      if (!accountId) return;
      // Push first: the pull then sees this device's changes applied.
      if (Platform.OS !== 'web') await drainChildQueue(accountId);
      await pullChildren(accountId);
    },

    setExpenseChildren: async (expenseId: string, childIds: string[], shares?: number[]) => {
      const accountId = currentAccountId();
      if (!accountId) throw new Error('No account');
      if (new Set(childIds).size !== childIds.length) throw new Error('Each child may appear once');
      const resolved = resolveShares(childIds.length, shares);
      const links = childIds.map((childId, i) => ({ childId, share: resolved[i] }));

      if (Platform.OS === 'web') {
        await api.setExpenseChildren(expenseId, { childIds, ...(shares ? { shares } : {}) });
        // The web's line flag (see `Expense.hasLineChildren`): children clear the lines.
        patchExpenseLinks(expenseId, links, childIds.length > 0 ? false : undefined);
        if (childIds.length > 0) patchItemChildren(expenseId, null, null);
        return;
      }

      await withTransaction(async () => {
        // Whole-expense attribution wins over line attribution.
        const clearedItemIds = childIds.length > 0 ? await clearExpenseItemChildren(expenseId) : [];
        const previous = await childRepo.getLinksForExpense(expenseId);
        await childRepo.replaceExpenseChildLinks(expenseId, links);

        for (const itemId of clearedItemIds) {
          await childRepo.enqueueChildChange({
            entityType: 'expense_item_child',
            entityId: itemId,
            operation: 'update',
            payload: { expenseId, itemId, childId: null },
            accountId,
          });
        }
        for (const old of previous) {
          if (childIds.includes(old.childId)) continue;
          await childRepo.enqueueChildChange({
            entityType: 'expense_child',
            entityId: `${expenseId}:${old.childId}`,
            operation: 'delete',
            payload: { expenseId, childId: old.childId, share: old.share },
            accountId,
          });
        }
        for (const link of links) {
          const existed = previous.some((p) => p.childId === link.childId);
          await childRepo.enqueueChildChange({
            entityType: 'expense_child',
            entityId: `${expenseId}:${link.childId}`,
            operation: existed ? 'update' : 'create',
            payload: { expenseId, childId: link.childId, share: link.share },
            accountId,
          });
        }
      });
      patchExpenseLinks(expenseId, links);
      if (childIds.length > 0) patchItemChildren(expenseId, null, null);
      void drainChildQueue(accountId);
    },

    setItemChild: async (expenseId: string, itemId: string, childId: string | null) => {
      const accountId = currentAccountId();
      if (!accountId) throw new Error('No account');

      if (Platform.OS === 'web') {
        await api.setItemChild(expenseId, itemId, childId);
        const stillHasLines = patchItemChildren(expenseId, itemId, childId);
        if (childId) patchExpenseLinks(expenseId, [], true);
        // Clearing the last attributed line drops the flag, so a bulk assign no longer skips it.
        else if (stillHasLines === false) patchLineFlag(expenseId, false);
        return;
      }

      let removedLinks = false;
      await withTransaction(async () => {
        // Line attribution wins over whole-expense attribution; clearing a line leaves links alone.
        if (childId) {
          const previous = await childRepo.getLinksForExpense(expenseId);
          if (previous.length > 0) {
            await childRepo.replaceExpenseChildLinks(expenseId, []);
            removedLinks = true;
            for (const old of previous) {
              await childRepo.enqueueChildChange({
                entityType: 'expense_child',
                entityId: `${expenseId}:${old.childId}`,
                operation: 'delete',
                payload: { expenseId, childId: old.childId, share: old.share },
                accountId,
              });
            }
          }
        }
        await setExpenseItemChild(itemId, childId);
        await childRepo.enqueueChildChange({
          entityType: 'expense_item_child',
          entityId: itemId,
          operation: 'update',
          payload: { expenseId, itemId, childId },
          accountId,
        });
      });
      patchItemChildren(expenseId, itemId, childId);
      if (removedLinks) patchExpenseLinks(expenseId, []);
      void drainChildQueue(accountId);
    },

    resolveServerChildIds: async (ids: string[]) => {
      const accountId = currentAccountId();
      const map: Record<string, string> = { ...get().childIdMap };
      const missing = () => ids.filter((id) => !map[id]);

      if (missing().length > 0 && accountId && Platform.OS !== 'web') {
        const repoMap = await childRepo.getChildServerIdMap(accountId);
        for (const [k, v] of repoMap) map[k] = v;
      }
      if (missing().length > 0 && accountId && Date.now() - lastMissingIdPullAt > MISSING_ID_PULL_INTERVAL_MS) {
        lastMissingIdPullAt = Date.now();
        await pullChildren(accountId);
        Object.assign(map, get().childIdMap);
      }

      const result = new Map<string, string>();
      for (const id of ids) if (map[id]) result.set(id, map[id]);
      return result;
    },

    // Torn down on sign-out (`logoutAction`) and on every account switch
    // (`accountStore`'s `clearAccountScopedCaches`): child names are minors'
    // data and must not survive into another account or user. Module-scope
    // state (drain bookkeeping, the missing-id pull throttle) goes with it.
    reset: () => {
      lastMissingIdPullAt = 0;
      resetChildSyncState();
      set({ ...initialState });
    },
  };
});
