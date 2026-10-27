import { create } from 'zustand';
import i18next from 'i18next';
import { Platform } from 'react-native';
import type { Category } from '@budget/shared-types';
import { generateUUID, catalogKeyForName } from '@budget/shared-utils';
import { getAllCategories, upsertCategory, deleteCategory as deleteCategoryFromDb, categoryExistsById, getCategoryByClientId, getCategoryById, remapCategoryId, getCategoryByNameExcludingId, getKeyConvergenceCandidates, mergeCategoryInto, countCategoryReferences } from '@/db/categoryRepository';
import { CATEGORY_SEEDS, seedForKey, seedForName } from '@/features/categories/categorySeeds';
import { setLastSyncTime } from '@/db/syncMetadataRepository';
import { useAccountStore } from './accountStore';
import { useAuthStore } from './authStore';
import { api } from '@/services/api';
import { maybeEncrypt, maybeDecrypt } from '@/services/encryptionHelper';

// Accounts whose default categories have been seeded and color-patched in this
// session. Avoids re-running 18 sequential `categoryExistsById` SELECTs + a
// color-patch loop on every `loadCategories` call (used to cost 60-600ms each).
const _seededAccounts = new Set<string>();

/**
 * A local row this device seeded itself (`default-exp-*` / `default-inc-*`),
 * standing for `key`, that a pulled server row with the same key may absorb.
 *
 * Deliberately narrow: only the app's own seeds, never a row the user renamed
 * (flagged, or a keyless seed whose name no longer maps to the key). Anything
 * else with the same key is left alone - folding re-points expenses, and keys
 * must never move money on their own.
 */
function isConvergibleSeed(local: Category, key: string, type: 'expense' | 'income'): boolean {
  if (!local.id.startsWith('default-')) return false;
  if (local.nameCustomized) return false;
  if (local.systemKey) return local.systemKey === key;
  return catalogKeyForName(local.name, type) === key;
}

/**
 * Whether a live row other than `seed` and `keyedId` holds exactly the seed's
 * name and type - either a server row in this pull (it may not be written yet)
 * or a non-seed row already stored here. Same equality as the legacy name
 * convergence (`getCategoryByNameExcludingId`), which is what then pairs them.
 */
async function hasExactNameTwin(
  seed: Category,
  keyedId: string,
  type: 'expense' | 'income',
  accountId: string,
  serverCategories: any[],
): Promise<boolean> {
  const inPull = serverCategories.some(
    (c) =>
      c &&
      c.id !== keyedId &&
      c.id !== seed.id &&
      !c.isDeleted &&
      (c.type === 'income' ? 'income' : 'expense') === type &&
      (!c.accountId || c.accountId === accountId) &&
      c.name === seed.name,
  );
  if (inPull) return true;
  const stored = await getCategoryByNameExcludingId(accountId, seed.name, type, seed.id);
  return !!stored && stored.id !== keyedId && !stored.id.startsWith('default-');
}

interface CategoryState {
  categories: Category[];
  isLoading: boolean;
  isInitialized: boolean;

  loadCategories: () => Promise<void>;
  reset: () => void;
  getCategoryById: (id: string) => Category | undefined;
  getCategoryByName: (name: string, type: 'expense' | 'income') => Category | undefined;
  getExpenseCategories: () => Category[];
  getIncomeCategories: () => Category[];
  createCategory: (name: string, type: 'expense' | 'income', icon?: string, color?: string, parentId?: string) => Promise<Category>;
  syncFromServer: (serverCategories: any[]) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  updateCategory: (id: string, data: { name?: string; color?: string; icon?: string; parentId?: string | null }) => Promise<void>;
}

/**
 * The server's copy of a locally-addressed category, matched on name+type.
 *
 * Categories created before `clientId` support carry a device id here and a
 * different primary key on the server with nothing linking them, so an id from
 * this device can 404 while the row is alive server-side. Name+type is the only
 * thing both sides still share. Returns `null` when the server genuinely has no
 * such category - i.e. when a 404 really does mean "local only" (ABA-567).
 *
 * Never throws: if the lookup itself fails there is nothing to compare against,
 * and the caller must not be blocked from deleting a local row by a network
 * problem.
 */
async function findServerCategoryTwin(
  category: Category | undefined,
): Promise<{ id: string } | null> {
  if (!category?.name) return null;
  try {
    const serverCategories = await api.getCategories();
    const twin = serverCategories.find(
      (c: any) =>
        !c.isDeleted &&
        c.type === category.type &&
        c.id !== category.id &&
        // By key too - but never for this device's own seed: a seed reaching
        // this point has no references, and its key twin is the account's real
        // standard category, which deleting the seed must not take with it.
        (c.name === category.name ||
          (!!category.systemKey && !category.id.startsWith('default-') && c.systemKey === category.systemKey)),
    );
    return twin ? { id: twin.id } : null;
  } catch {
    return null;
  }
}

export const useCategoryStore = create<CategoryState>((set, get) => ({
  categories: [],
  isLoading: false,
  isInitialized: false,

  /**
   * Tear the store down at a user or account boundary.
   *
   * Categories are account-scoped (`getAllCategories(accountId)`,
   * `GET /categories` under `X-Account-Id`), and this store had **no reset at
   * all** — so the previous user's category names stayed in memory after a
   * sign-out, readable by whoever signed in next on that browser, and the
   * previous account's names lingered after a switch. Same class as the
   * `chatStore` leak fixed in ABA-513.
   *
   * `_seededAccounts` must be cleared with the state, not just alongside it:
   * it is keyed by account id, so after signing out and back in onto the SAME
   * account the fast path would fire, re-read a local DB the login path had
   * just emptied, and write an empty list back while marking itself
   * initialised — the exact poisoning ABA-519 removed from the failure path,
   * arriving instead through the logout path.
   */
  reset: () => {
    _seededAccounts.clear();
    set({ categories: [], isInitialized: false, isLoading: false });
  },

  loadCategories: async () => {
    const accountId = useAccountStore.getState().currentAccountId;
    if (!accountId) return;
    set({ isLoading: true });
    try {
      // Fast path: this account was already seeded + color-patched in this
      // session. Skip the 18 categoryExistsById SELECTs + color-patch loop and
      // just re-read from SQLite (which the caller wants because the cascade
      // upstream may have upserted new server categories).
      if (_seededAccounts.has(accountId)) {
        const categories = await getAllCategories(accountId);
        // Never trade a populated in-memory list for an empty local read. On
        // web that read is ALWAYS empty (`db/client.web.ts` is a mock), so
        // this path used to wipe perfectly good categories and every name in
        // the app started rendering as "Uncategorized".
        if (categories.length === 0 && get().categories.length > 0) {
          set({ isInitialized: true });
          return;
        }
        set({ categories, isInitialized: true });
        return;
      }

      let categories = await getAllCategories(accountId);

      // Pull the server's categories on the first `loadCategories` of this
      // session for this account — NOT only when the local table is empty.
      //
      // That gate used to read `if (categories.length === 0)`, which is true
      // exactly once in a device's life. Everything that repairs a diverged
      // install lives in `syncFromServer` (the clientId remap, and ABA-564's
      // fold-the-stale-twin branch), and nothing else ever passes it the
      // server's list — so on a device that had already seeded, the repair
      // could never run. A category created before clientId support keeps a
      // device id locally while the server holds a different primary key, and
      // every expense pulled back carries the server's id, which then resolves
      // to no local row: the detail screen falls back to "uncategorized" and
      // the without-category filter finds nothing (ABA-575).
      //
      // The `_seededAccounts` fast path above is what keeps this to one
      // request per account per session; a failure leaves the local rows
      // untouched, so an offline launch behaves exactly as before.
      {
        try {
          const serverCategories = await api.getCategories();
          if (serverCategories && serverCategories.length > 0) {
            await get().syncFromServer(serverCategories);
            categories = await getAllCategories(accountId);
            setLastSyncTime(Date.now());
            // Web (no real SQLite): syncFromServer already set state from built
            // server rows; the local read-back is empty and the native seeding /
            // color-patch below would clobber it back to empty. Keep them and stop.
            // (Don't mark _seededAccounts so later loads re-fetch from server.)
            if (categories.length === 0 && get().categories.length > 0) {
              set({ isInitialized: true });
              return;
            }
          }
        } catch {
          // Server unavailable — will seed defaults below
        }
      }

      // Ensure all default categories exist (check by deterministic ID to avoid
      // re-creating deleted system categories). The seed set, its ids and its
      // look live in categorySeeds.ts; names come from the catalog.
      let seeded = false;
      const now = new Date();

      for (const seed of CATEGORY_SEEDS) {
        const live = categories.find((c) => c.id === seed.id);
        if (live) {
          // A seed row from a build before system keys: label it in place, but
          // only while its name is still the standard one - a seed the user
          // renamed stays theirs (keyless shows `name`).
          if (!live.systemKey && catalogKeyForName(live.name, seed.type) === seed.key) {
            await upsertCategory({ ...live, systemKey: seed.key, nameCustomized: false });
            seeded = true;
          }
          continue;
        }
        const exists = await categoryExistsById(seed.id);
        if (exists) continue;
        // The server's row for this key already arrived with the pull above:
        // a live seed beside it would be a duplicate. Write the seed id as a
        // TOMBSTONE instead of nothing, so deleting the server's category later
        // cannot bring the seed back - the exists check above is what keeps a
        // deleted standard category deleted. Invisible: lists read only
        // `is_deleted = 0`, and categories are never pushed from SQLite.
        const delivered = categories.some((c) => c.systemKey === seed.key && c.type === seed.type);
        await upsertCategory({
          id: seed.id,
          accountId,
          name: seed.name,
          icon: seed.icon,
          color: seed.color,
          type: seed.type,
          isSystem: true,
          systemKey: seed.key,
          nameCustomized: false,
          createdAt: now,
          updatedAt: now,
          isDeleted: delivered,
          syncVersion: 0,
        });
        if (!delivered) seeded = true;
      }

      if (seeded) {
        categories = await getAllCategories(accountId);
      }

      // Patch categories that are missing a color (e.g. synced from server without color)
      let patched = false;
      for (const cat of categories) {
        if (!cat.color) {
          const type = cat.type === 'income' ? 'income' : 'expense';
          const fallback = (seedForKey(cat.systemKey, type) ?? seedForName(cat.name, type))?.color;
          if (fallback) {
            await upsertCategory({ ...cat, color: fallback });
            cat.color = fallback;
            patched = true;
          }
        }
      }
      if (patched) {
        categories = await getAllCategories(accountId);
      }

      // Nothing to show, and on web no local DB it could have come from: an
      // empty list HERE means the server never answered, because the success
      // path above returns early. Claiming success would be the ABA-506
      // mistake — a failed load and a successful empty load must not leave the
      // same state — and it is unusually expensive here:
      //   * `isInitialized: true` with an empty list silently disables all
      //     nine `if (!categoriesInitialized) loadCategories()` retries in the
      //     app, so nothing tries again for the rest of the session;
      //   * `_seededAccounts.add` sends every later call down the fast path,
      //     which re-reads the empty local DB and writes `[]` again.
      // One dropped request therefore left the whole app category-less, which
      // is what surfaced as a monthly budget whose every allocation read
      // "Uncategorized". Leaving both untouched is what makes the next caller
      // genuinely retry.
      if (Platform.OS === 'web' && categories.length === 0) {
        return;
      }

      _seededAccounts.add(accountId);
      set({ categories, isInitialized: true });
    } finally {
      set({ isLoading: false });
    }
  },

  getCategoryById: (id: string) => {
    return get().categories.find(c => c.id === id);
  },

  getCategoryByName: (name: string, type: 'expense' | 'income') => {
    return get().categories.find(c => c.name === name && c.type === type && !c.isDeleted);
  },

  getExpenseCategories: () => {
    return get().categories.filter(c => c.type === 'expense' && !c.isDeleted);
  },

  getIncomeCategories: () => {
    return get().categories.filter(c => c.type === 'income' && !c.isDeleted);
  },

  createCategory: async (name: string, type: 'expense' | 'income', icon?: string, color?: string, parentId?: string) => {
    const accountId = useAccountStore.getState().currentAccountId;
    const userId = useAuthStore.getState().user?.id;
    if (!accountId || !userId) throw new Error('No account or user');

    // The server enforces a (accountId, name, type) unique. Return the category
    // that already exists locally, which is also what the server does for a
    // duplicate create.
    // A standard name in any language is the account's keyed category when it
    // has one: the server answers such a create with that row, which this
    // device already holds under another name ("Zakupy spożywcze" vs a typed
    // "Groceries").
    const key = catalogKeyForName(name, type);
    const existing =
      get().getCategoryByName(name, type) ??
      (key ? get().categories.find((c) => c.systemKey === key && c.type === type && !c.isDeleted) : undefined);
    if (existing) return existing;

    const now = new Date();
    // Same value in both roles: the local row id IS the clientId, so the server
    // can match a resend and a pull can match the row back.
    const id = generateUUID();

    const category: Category = {
      id,
      clientId: id,
      userId,
      accountId,
      name,
      icon,
      color: color || '#6B7280',
      type,
      isSystem: false,
      parentId,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      syncVersion: 0,
    };

    await upsertCategory(category);

    // Web (no real SQLite): the read-back below is always empty (see
    // loadCategories' identical guard above), which would wipe the in-memory
    // list and silently drop this category from any split still being built
    // around it. Fall back to appending it to the current list instead — the
    // `existing` check above already ruled out a duplicate.
    const previousList = get().categories;
    const categories = await getAllCategories(accountId);
    set({ categories: categories.length > 0 ? categories : [...previousList, category] });

    // AWAITED, not fire-and-forget (was the opposite before). Discarding the
    // response left the local row on its device id forever while the server
    // created its own row with its own PK: a budget allocation was then stored
    // server-side against the server PK while the device's expenses kept the
    // local id, so the budget read 0,00 (or "everything") after the next pull.
    // Adopting the response id and re-pointing every local reference closes
    // that split. Offline: the local create stands and the next sync retries
    // (the server is idempotent on clientId), so nothing is lost.
    try {
      const { payload: encPayload, encryptedPayload, encryptionKeyVersion } =
        await maybeEncrypt('category', { name }, accountId);
      const created = await api.createCategory({
        name: encPayload.name ?? name,
        icon,
        color,
        type,
        parentId,
        clientId: id,
        encryptedPayload,
        encryptionKeyVersion,
      } as any);

      if (created?.id && created.id !== id) {
        await remapCategoryId(id, created.id, id);
        await get().syncFromServer([created]);
        return { ...category, id: created.id, clientId: id };
      }
    } catch (error: any) {
      // A server REFUSAL (400 'Invalid parent category', 409) is authoritative
      // and never succeeds on retry: keeping the local row would leave a child
      // the phone rolls into its parent while the server has no such link.
      // A hierarchy edit also cannot be queued (categories are not in
      // syncQueue; an offline-created category reaches the server parentless,
      // via an expense's fallbackName), so a TRANSPORT failure on a create that
      // carries a parent is undone too. Plain offline creates stand.
      const refused = error?.status === 400 || error?.status === 409;
      if (refused || parentId) {
        await deleteCategoryFromDb(id);
        set({ categories: previousList });
        if (!refused) console.warn('createCategory with a parent needs a connection', error);
        throw error;
      }
      // Offline / server unavailable — the local row above is the source of
      // truth until the next successful sync.
    }

    return category;
  },

  syncFromServer: async (serverCategories: any[]) => {
    // Collect the built rows so web (no real SQLite) can fall back to them when
    // the post-upsert read-back is empty.
    const built: Category[] = [];
    for (const cat of serverCategories) {
      // Decrypt encrypted fields if present
      const decrypted = await maybeDecrypt('category', cat, cat.accountId);
      const accountIdForRow = cat.accountId || useAccountStore.getState().currentAccountId || '';

      // A row this device created offline is stored under its clientId as the
      // id. When the server sends that row back with its own PK, adopt the PK
      // and re-point local references instead of inserting a second row for the
      // same category (which is what used to make a budget on a new category
      // read 0,00 after a pull while the list still showed it).
      if (cat.clientId && cat.clientId !== cat.id && accountIdForRow) {
        const local = await getCategoryByClientId(accountIdForRow, cat.clientId);
        if (local && local.id === cat.clientId) {
          await remapCategoryId(cat.clientId, cat.id, cat.clientId);
        }
      }

      // Preserve existing clientId if server didn't return one - this prevents
      // losing the remapped clientId when syncFromServer is called with a
      // category that has null/undefined clientId (server echo without clientId).
      // The remap in createCategory sets client_id on the row; if syncFromServer
      // later receives the same row with no clientId, we must preserve it.
      const existingCategory = cat.id ? await getCategoryById(cat.id) : null;
      const clientIdToUse = cat.clientId ?? existingCategory?.clientId ?? undefined;

      const entity: Category = {
        id: cat.id,
        clientId: clientIdToUse,
        userId: cat.userId || undefined,
        accountId: cat.accountId || undefined,
        name: decrypted.name,
        icon: cat.icon || undefined,
        color: cat.color || undefined,
        type: cat.type || 'expense',
        isSystem: cat.isSystem ?? false,
        parentId: cat.parentId || undefined,
        // Server-owned. A row that does not carry the field (an older server,
        // an embedded copy) keeps what this device has; an explicit null
        // (the server cleared the key) clears it.
        systemKey: cat.systemKey !== undefined ? cat.systemKey : existingCategory?.systemKey ?? null,
        nameCustomized:
          cat.nameCustomized !== undefined ? !!cat.nameCustomized : existingCategory?.nameCustomized ?? false,
        createdAt: new Date(cat.createdAt),
        updatedAt: new Date(cat.updatedAt),
        isDeleted: cat.isDeleted ?? false,
        syncVersion: cat.syncVersion || 0,
      };
      await upsertCategory(entity);

      // Seed convergence by KEY, before the name match below: the app's own
      // seed and the server's row of one standard concept often hold
      // different names (English seed, server row in the account's language),
      // which the name match can never pair. Runs whatever the clientId - a
      // seed is never the row a clientId points at.
      const entityType: 'expense' | 'income' = entity.type === 'income' ? 'income' : 'expense';
      if (entity.systemKey && accountIdForRow && !entity.isDeleted) {
        const sameKey = await getKeyConvergenceCandidates(
          accountIdForRow,
          entity.systemKey,
          entityType,
          entity.id,
        );
        for (const local of sameKey) {
          if (!isConvergibleSeed(local, entity.systemKey, entityType)) continue;
          // An exact-name twin wins over the key. Where the server backfill
          // keyed one row of a concept and left a keyless duplicate ("Zakupy
          // spożywcze" keyed, "Groceries" keyless), the seed "Groceries" has
          // always paired with the keyless row by name - folding it into the
          // keyed row instead would re-point its expenses, i.e. move money.
          // Leave it for the legacy name convergence below (or the clientId
          // remap) to pair as before.
          if (await hasExactNameTwin(local, entity.id, entityType, accountIdForRow, serverCategories)) continue;
          await mergeCategoryInto(local.id, entity.id);
        }
      }

      // Legacy convergence (ABA-566). The branch above only fires when the
      // server row carries a clientId, which rows created before that support
      // do not have — on one production account all 38 categories had none. For
      // those the phone kept its own id, the pull added the server's row beside
      // it, and every expense went on pointing at an id the server cannot
      // resolve. Name+type is the only thing both sides still share, so use it
      // to fold the stale twin into the server's row. Runs AFTER the upsert so
      // the surviving row exists and the merge can delete rather than rename,
      // which would collide on the primary key.
      if (!cat.clientId && accountIdForRow && !entity.isDeleted) {
        const stale = await getCategoryByNameExcludingId(
          accountIdForRow,
          entity.name,
          entity.type === 'income' ? 'income' : 'expense',
          entity.id,
        );
        if (stale) await mergeCategoryInto(stale.id, entity.id);
      }

      if (!entity.isDeleted) built.push(entity);
    }
    // Reload without recursive fetch
    const accountId = useAccountStore.getState().currentAccountId;
    if (accountId) {
      const categories = await getAllCategories(accountId);
      // Web (no real SQLite): read-back is empty — fall back to built rows.
      set({ categories: categories.length > 0 ? categories : built, isInitialized: true });
    }
  },

  deleteCategory: async (id: string) => {
    const category = get().categories.find((c) => c.id === id);

    // Guard locally FIRST (ABA-567). The server refuses to delete a category
    // that still has expenses, budgets or child categories behind it - but that
    // guard can only run for a category the server can FIND. For an id it
    // cannot resolve it answers 404, and this method used to swallow the 404
    // and delete locally with no check at all, so a category with a year of
    // expenses behind it could be removed by one accidental tap and never
    // announced. (The scale of those 404s was already on record next to
    // `updateCategory`: 13 of 15 category PATCHes in 72h.)
    //
    // Checking here rather than only on the server also makes the rule hold
    // offline, and for a category that has never left this device - which the
    // server could not vouch for either way.
    const refs = await countCategoryReferences(id);
    const referenced = refs.expenses + refs.incomes + refs.budgetCategories + refs.splits + refs.children;
    if (referenced > 0) {
      // Same shape the API raises, so the screen renders one message for both
      // and no new copy is needed.
      throw Object.assign(new Error('Category has related records'), {
        status: 409,
        details: refs,
      });
    }

    try {
      await api.deleteCategory(id);
    } catch (error: any) {
      if (error?.status !== 404) throw error;

      // A 404 is legitimate for a category that only ever existed here, but it
      // is ALSO exactly what a diverged id looks like - and in that case the
      // server still holds the row, so deleting only locally would leave it
      // live and let the next pull hand it straight back ("categories I
      // deleted came back"). Look for the server's own copy by name+type, the
      // same signal `updateCategory` uses below, and delete THAT so the
      // server's guard actually runs. A 409 from it propagates.
      const twin = await findServerCategoryTwin(category);
      if (twin) await api.deleteCategory(twin.id);
    }

    await deleteCategoryFromDb(id);
    set((state) => ({
      categories: state.categories.filter((c) => c.id !== id),
    }));
  },

  updateCategory: async (id: string, data: { name?: string; color?: string; icon?: string; parentId?: string | null }) => {
    // Save locally FIRST (Sentry/prod-nginx 2026-09: 13 of 15 PATCH
    // /categories/:id calls in 72h returned 404). Locally-created and seeded
    // rows carry a device-generated id and Category has no clientId for the
    // server to reconcile it by (see the deleteCategory 404 comment). The old
    // order — `await api.updateCategory` before the local upsert — threw on
    // that 404 BEFORE anything was saved, so every edit to such a category
    // silently vanished on the next reload: the "my category edits disappear
    // after restart" report.
    const current = get().categories.find((c) => c.id === id);
    // `data` goes to the server as-is (`parentId: null` is how a parent is
    // cleared there); locally the row stores "no parent" as `undefined`.
    const { parentId: dataParentId, ...dataRest } = data;
    const localData: Partial<Category> = { ...dataRest };
    if ('parentId' in data) localData.parentId = dataParentId ?? undefined;
    // Mirror the server: renaming a keyed category (a name that differs from
    // the stored one) pins the user's name in every language.
    if (current?.systemKey && data.name !== undefined && data.name !== current.name) {
      localData.nameCustomized = true;
    }
    const merged = { ...current, ...localData, updatedAt: new Date() };
    set((state) => ({
      categories: state.categories.map((c) => (c.id === id ? (merged as typeof c) : c)),
    }));
    if (current) {
      await upsertCategory({ ...current, ...localData, updatedAt: new Date() });
      // Native only — on web the read-back is empty (see loadCategories' guard)
      // and must not wipe the in-memory list we just updated.
      const accountId = useAccountStore.getState().currentAccountId;
      if (accountId) {
        const categories = await getAllCategories(accountId);
        if (categories.length > 0) set({ categories });
      }
    }

    // Server best-effort. 404 = the row exists only on this device (delete
    // already tolerates this); patch the server twin by name+type instead so
    // the edit survives the next server pull. Other failures propagate.
    try {
      await api.updateCategory(id, data);
    } catch (error: any) {
      // 409 = the server refused the name because another category of this
      // account and type already holds it. Unlike a transport failure this is
      // authoritative and will never succeed on a retry, so the optimistic
      // write above has to be undone: leaving it would show two categories
      // under one name until the next pull silently reverted the edit, and the
      // local row would disagree with the server in the meantime (ABA-565).
      // 400 on a parent change is the same kind of answer: the server judged
      // the hierarchy invalid ('Invalid parent category'), so a retry cannot
      // succeed and the local parent must not outlive the refusal.
      // A parent change that did not reach the server (transport failure or
      // any non-404 answer) is undone as well: categories have no push queue,
      // so the next pull would silently revert it anyway.
      const parentChanged =
        'parentId' in data && (data.parentId ?? undefined) !== (current?.parentId ?? undefined);
      if ((error?.status === 409 || (parentChanged && error?.status !== 404)) && current) {
        await upsertCategory(current);
        set((state) => ({
          categories: state.categories.map((c) => (c.id === id ? (current as typeof c) : c)),
        }));
        throw error;
      }
      if (error?.status !== 404) throw error;
      try {
        const serverCategories = await api.getCategories();
        const names = new Set([current?.name, data.name].filter(Boolean) as string[]);
        const twin = serverCategories.find(
          (c: any) =>
            !c.isDeleted &&
            c.type === merged.type &&
            (names.has(c.name) || (!!current?.systemKey && c.systemKey === current.systemKey)),
        );
        if (twin) {
          await api.updateCategory(twin.id, data);
          await get().syncFromServer(serverCategories);
        }
      } catch {
        // Best-effort only — the local edit above already persisted.
      }
    }
  },
}));

/**
 * Category LABELS follow the UI language (`categoryLabel`), but most screens
 * memoise derived data (tables, breakdowns, budget progress) on the
 * `categories` array. A language switch changes no row, so nothing would
 * recompute and the old language would linger until the data next changed.
 * Hand out a new array reference on `languageChanged` - same rows - so every
 * memo keyed on it recomputes, and bump the budget version.
 */
export function refreshCategoryLabels(): void {
  const { categories } = useCategoryStore.getState();
  if (categories.length === 0) return;
  useCategoryStore.setState({ categories: [...categories] });
  // Budget progress carries category labels too (budgetProgress.ts), and the
  // budget screens re-render on `budgetVersion`. Required lazily: budgetStore
  // sits on an import cycle with this module (via authStore), so a top-level
  // import or a module-scope subscription there would run before this store
  // exists.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useBudgetStore } = require('./budgetStore');
    useBudgetStore.setState({ budgetVersion: (useBudgetStore.getState().budgetVersion || 0) + 1 });
  } catch {
    // Budgets not loadable here (tests that mock the store graph) - nothing to refresh.
  }
}
i18next.on('languageChanged', refreshCategoryLabels);
