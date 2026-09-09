/**
 * A failed category fetch must not look like "this account has no categories".
 *
 * ## The bug this pins
 *
 * On web there is no SQLite, so `loadCategories` always falls through to
 * `GET /categories`. When that request SUCCEEDS the store keeps the built
 * server rows, returns early, and deliberately leaves the account unmarked so
 * a later call re-fetches. When it FAILED, the `catch` swallowed it and
 * execution fell into the default-seeding loop — every `upsertCategory` a
 * no-op on web — ending at two unconditional lines:
 *
 *     _seededAccounts.add(accountId);
 *     set({ categories, isInitialized: true });   // categories === []
 *
 * Both are wrong in that state, and the second is worse than the first.
 * `_seededAccounts` sends every later call down the fast path, which re-reads
 * the empty local DB and writes `[]` again. And `isInitialized: true` with an
 * empty list disables all NINE retry points in the app, every one of which is
 * shaped `if (!categoriesInitialized) loadCategories()`.
 *
 * So one dropped request left the whole app category-less for the rest of the
 * session — which is what the user saw as a monthly budget whose every
 * allocation read "Uncategorized". The dashboard's own segmented bar was
 * innocent: it subscribes to the category store correctly (ABA-505) and
 * recomputed fine; there was simply nothing to find.
 *
 * This is the rule ABA-506 states for the account list, applied here: a failed
 * load and a successful empty load must never leave the same state.
 */

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

// categoryStore pulls in walletStore transitively, which builds an MMKV
// instance at module scope; MMKV has no jest-native binding.
jest.mock('react-native-mmkv', () => {
  const store = new Map<string, string | number>();
  return {
    MMKV: jest.fn().mockImplementation(() => ({
      getString: (k: string) => (store.has(k) ? String(store.get(k)) : undefined),
      getNumber: (k: string) => (typeof store.get(k) === 'number' ? (store.get(k) as number) : undefined),
      set: (k: string, v: string | number) => store.set(k, v),
      delete: (k: string) => store.delete(k),
    })),
  };
});

const mockGetCategories = jest.fn();
jest.mock('@/services/api', () => ({
  api: {
    getCategories: () => mockGetCategories(),
    // Wired at module scope by authStore, which this store pulls in.
    setLogoutHandler: jest.fn(),
    setAccountIdGetter: jest.fn(),
  },
}));

jest.mock('@/db/categoryRepository', () => ({
  getAllCategories: jest.fn().mockResolvedValue([]),
  upsertCategory: jest.fn().mockResolvedValue(undefined),
  categoryExistsById: jest.fn().mockResolvedValue(false),
  softDeleteCategory: jest.fn().mockResolvedValue(undefined),
  getCategoryByNameFromDb: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/services/secureStorage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/db/syncMetadataRepository', () => ({
  setLastSyncTime: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/stores/accountStore', () => ({
  useAccountStore: { getState: jest.fn(() => ({ currentAccountId: 'acc-1' })) },
}));

import { useCategoryStore } from '../categoryStore';
import { getAllCategories } from '@/db/categoryRepository';
import type { Category } from '@budget/shared-types';

const serverCategory = (id: string, name: string): Category =>
  ({
    id,
    accountId: 'acc-1',
    name,
    icon: '🍎',
    color: '#fff',
    type: 'expense',
    isSystem: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    isDeleted: false,
    syncVersion: 0,
  }) as Category;

describe('categoryStore.loadCategories on web when the server fetch fails', () => {
  beforeEach(() => {
    mockGetCategories.mockReset();
    useCategoryStore.getState().reset();
    (getAllCategories as jest.Mock).mockReset().mockResolvedValue([]);
  });

  it('does not claim to be initialised with an empty list', async () => {
    mockGetCategories.mockRejectedValue(new TypeError('Failed to fetch'));

    await useCategoryStore.getState().loadCategories();

    // The single most damaging line: `isInitialized: true` here is what turns
    // every `if (!categoriesInitialized) loadCategories()` in the app into a
    // no-op for the rest of the session.
    expect(useCategoryStore.getState().isInitialized).toBe(false);
    expect(useCategoryStore.getState().categories).toEqual([]);
  });

  it('retries the server on the next call instead of taking a poisoned fast path', async () => {
    mockGetCategories.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await useCategoryStore.getState().loadCategories();

    mockGetCategories.mockResolvedValueOnce([serverCategory('c1', 'Groceries')]);
    await useCategoryStore.getState().loadCategories();

    expect(mockGetCategories).toHaveBeenCalledTimes(2);
    expect(useCategoryStore.getState().categories.map((c) => c.name)).toEqual(['Groceries']);
    expect(useCategoryStore.getState().isInitialized).toBe(true);
  });

  it('never replaces categories it already has with an empty list', async () => {
    // The fast path did exactly this: re-read the empty local DB and overwrite
    // a perfectly good in-memory list, so names that were resolving a moment
    // ago started rendering as "Uncategorized".
    useCategoryStore.setState({ categories: [serverCategory('c1', 'Groceries')], isInitialized: true });
    mockGetCategories.mockRejectedValue(new TypeError('Failed to fetch'));

    await useCategoryStore.getState().loadCategories();

    expect(useCategoryStore.getState().categories.map((c) => c.name)).toEqual(['Groceries']);
    expect(useCategoryStore.getState().isInitialized).toBe(true);
  });

  it('reset clears the store and the seeded marker, so the next load really re-fetches', async () => {
    // Two defects in one: categoryStore had NO reset at all, so the previous
    // user's category names survived sign-out in memory; and `_seededAccounts`
    // is module-scoped, so after signing out and back in onto the same account
    // the fast path would fire and write an empty list back while marking
    // itself initialised.
    const local = getAllCategories as jest.Mock;
    // Exactly two: `loadCategories` reads the local table once up front and
    // once more after the seeding loop. A third queued value would leak into
    // the NEXT call and make it look locally populated, hiding the very thing
    // this test is checking.
    local
      .mockResolvedValueOnce([serverCategory('c1', 'Groceries')])
      .mockResolvedValueOnce([serverCategory('c1', 'Groceries')]);

    await useCategoryStore.getState().loadCategories();
    // A populated local read means the server was never needed, and the tail
    // marked this account seeded.
    expect(mockGetCategories).not.toHaveBeenCalled();
    expect(useCategoryStore.getState().categories.map((c) => c.name)).toEqual(['Groceries']);

    useCategoryStore.getState().reset();
    expect(useCategoryStore.getState().categories).toEqual([]);
    expect(useCategoryStore.getState().isInitialized).toBe(false);

    // Local reads are empty again (web after a login that cleared the DB). If
    // `_seededAccounts` had survived, this would take the fast path and set an
    // empty list instead of asking the server.
    mockGetCategories.mockResolvedValue([serverCategory('c2', 'Rent')]);
    await useCategoryStore.getState().loadCategories();

    expect(mockGetCategories).toHaveBeenCalledTimes(1);
    expect(useCategoryStore.getState().categories.map((c) => c.name)).toEqual(['Rent']);
  });

  it('clears isLoading either way', async () => {
    mockGetCategories.mockRejectedValue(new TypeError('Failed to fetch'));

    await useCategoryStore.getState().loadCategories();

    expect(useCategoryStore.getState().isLoading).toBe(false);
  });
});
