/**
 * Deleting a category must not silently destroy the expenses behind it.
 *
 * ## The bug this pins
 *
 * The server refuses to delete a category that still has expenses, budgets or
 * child categories behind it - but that guard can only run for a category the
 * server can FIND. For an id it cannot resolve it answers 404, and the store
 * swallowed the 404 and deleted locally with no check at all.
 *
 * Reported by a user as: "this time deleting a category isn't blocked because
 * of the expenses already attached to it. It was before. You can just delete
 * something, even by accident." The scale of those 404s was already on record
 * next to `updateCategory`: 13 of 15 category PATCHes in 72 hours (ABA-567).
 */

jest.mock('@/services/api', () => ({
  api: {
    getCategories: jest.fn(),
    createCategory: jest.fn(),
    updateCategory: jest.fn(),
    deleteCategory: jest.fn(),
    setLogoutHandler: jest.fn(),
    setAccountIdGetter: jest.fn(),
  },
}));

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

const mockCountRefs = jest.fn();
const mockDeleteFromDb = jest.fn();

jest.mock('@/db/categoryRepository', () => ({
  getAllCategories: jest.fn().mockResolvedValue([]),
  upsertCategory: jest.fn().mockResolvedValue(undefined),
  getCategoryById: jest.fn().mockResolvedValue(null),
  getCategoryByClientId: jest.fn().mockResolvedValue(null),
  remapCategoryId: jest.fn().mockResolvedValue(undefined),
  getCategoryByNameExcludingId: jest.fn().mockResolvedValue(null),
  mergeCategoryInto: jest.fn().mockResolvedValue(undefined),
  categoryExistsById: jest.fn().mockResolvedValue(true),
  countCategoryReferences: (...a: any[]) => mockCountRefs(...a),
  deleteCategory: (...a: any[]) => mockDeleteFromDb(...a),
}));

jest.mock('@/services/secureStorage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/db/syncMetadataRepository', () => ({ setLastSyncTime: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/stores/accountStore', () => ({
  useAccountStore: { getState: jest.fn(() => ({ currentAccountId: 'acc-1' })) },
}));
jest.mock('@/stores/authStore', () => ({ useAuthStore: { getState: jest.fn(() => ({ user: { id: 'u1' } })) } }));
jest.mock('@/services/encryptionHelper', () => ({
  maybeEncrypt: jest.fn().mockImplementation(async (_t: string, data: any) => ({ payload: data })),
  maybeDecrypt: jest.fn().mockImplementation(async (_t: string, cat: any) => ({ ...cat })),
}));

import { useCategoryStore } from '../categoryStore';
import { api } from '@/services/api';

const NONE = { expenses: 0, incomes: 0, budgetCategories: 0, splits: 0, children: 0 };
const CAT = { id: 'local-1', name: 'Restauracja', type: 'expense' as const };

function notFound() {
  return Object.assign(new Error('Not found'), { status: 404 });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCountRefs.mockResolvedValue(NONE);
  mockDeleteFromDb.mockResolvedValue(undefined);
  (api.deleteCategory as jest.Mock).mockResolvedValue(undefined);
  (api.getCategories as jest.Mock).mockResolvedValue([]);
  useCategoryStore.setState({ categories: [CAT as any], isInitialized: true, isLoading: false });
});

describe('categoryStore.deleteCategory — local guard', () => {
  it('refuses when local expenses still point at the category, and deletes nothing', async () => {
    mockCountRefs.mockResolvedValue({ ...NONE, expenses: 12 });

    await expect(useCategoryStore.getState().deleteCategory('local-1')).rejects.toMatchObject({
      status: 409,
      details: { expenses: 12 },
    });

    expect(api.deleteCategory).not.toHaveBeenCalled();
    expect(mockDeleteFromDb).not.toHaveBeenCalled();
    expect(useCategoryStore.getState().categories).toHaveLength(1);
  });

  it.each([
    ['incomes', { ...NONE, incomes: 3 }],
    ['budget allocations', { ...NONE, budgetCategories: 1 }],
    ['receipt splits', { ...NONE, splits: 5 }],
    ['child categories', { ...NONE, children: 2 }],
  ])('refuses on %s too, not just expenses', async (_label, refs) => {
    mockCountRefs.mockResolvedValue(refs);

    await expect(useCategoryStore.getState().deleteCategory('local-1')).rejects.toMatchObject({ status: 409 });
    expect(mockDeleteFromDb).not.toHaveBeenCalled();
  });

  it('deletes when nothing references it', async () => {
    await useCategoryStore.getState().deleteCategory('local-1');

    expect(api.deleteCategory).toHaveBeenCalledWith('local-1');
    expect(mockDeleteFromDb).toHaveBeenCalledWith('local-1');
    expect(useCategoryStore.getState().categories).toHaveLength(0);
  });
});

describe('categoryStore.deleteCategory — a 404 is not proof the server lacks the category', () => {
  it("deletes the server's twin when the id did not resolve, so the row cannot come back on the next pull", async () => {
    (api.deleteCategory as jest.Mock)
      .mockRejectedValueOnce(notFound())
      .mockResolvedValueOnce(undefined);
    (api.getCategories as jest.Mock).mockResolvedValue([
      { id: 'server-9', name: 'Restauracja', type: 'expense', isDeleted: false },
    ]);

    await useCategoryStore.getState().deleteCategory('local-1');

    expect(api.deleteCategory).toHaveBeenNthCalledWith(1, 'local-1');
    expect(api.deleteCategory).toHaveBeenNthCalledWith(2, 'server-9');
    expect(mockDeleteFromDb).toHaveBeenCalledWith('local-1');
  });

  it("propagates the server's 409 raised against the twin, and keeps the local row", async () => {
    // The whole point: the guard the user lost now actually runs.
    (api.deleteCategory as jest.Mock)
      .mockRejectedValueOnce(notFound())
      .mockRejectedValueOnce(Object.assign(new Error('has records'), { status: 409, details: { expenses: 7 } }));
    (api.getCategories as jest.Mock).mockResolvedValue([
      { id: 'server-9', name: 'Restauracja', type: 'expense', isDeleted: false },
    ]);

    await expect(useCategoryStore.getState().deleteCategory('local-1')).rejects.toMatchObject({ status: 409 });

    expect(mockDeleteFromDb).not.toHaveBeenCalled();
    expect(useCategoryStore.getState().categories).toHaveLength(1);
  });

  it('still deletes locally when the server genuinely has no such category', async () => {
    (api.deleteCategory as jest.Mock).mockRejectedValueOnce(notFound());
    (api.getCategories as jest.Mock).mockResolvedValue([
      { id: 'server-9', name: 'Zakupy', type: 'expense', isDeleted: false },
    ]);

    await useCategoryStore.getState().deleteCategory('local-1');

    expect(api.deleteCategory).toHaveBeenCalledTimes(1);
    expect(mockDeleteFromDb).toHaveBeenCalledWith('local-1');
  });

  it('does not match a soft-deleted server row as the twin', async () => {
    (api.deleteCategory as jest.Mock).mockRejectedValueOnce(notFound());
    (api.getCategories as jest.Mock).mockResolvedValue([
      { id: 'server-9', name: 'Restauracja', type: 'expense', isDeleted: true },
    ]);

    await useCategoryStore.getState().deleteCategory('local-1');

    expect(api.deleteCategory).toHaveBeenCalledTimes(1);
  });

  it('does not match a same-named category of the other type', async () => {
    (api.deleteCategory as jest.Mock).mockRejectedValueOnce(notFound());
    (api.getCategories as jest.Mock).mockResolvedValue([
      { id: 'server-9', name: 'Restauracja', type: 'income', isDeleted: false },
    ]);

    await useCategoryStore.getState().deleteCategory('local-1');

    expect(api.deleteCategory).toHaveBeenCalledTimes(1);
  });

  it('falls back to a plain local delete when the twin lookup itself fails', async () => {
    // A network problem must not block deleting a row that lives only here.
    (api.deleteCategory as jest.Mock).mockRejectedValueOnce(notFound());
    (api.getCategories as jest.Mock).mockRejectedValue(new Error('offline'));

    await useCategoryStore.getState().deleteCategory('local-1');

    expect(mockDeleteFromDb).toHaveBeenCalledWith('local-1');
  });

  it('still propagates a non-404 failure without deleting anything', async () => {
    (api.deleteCategory as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error('boom'), { status: 500 }),
    );

    await expect(useCategoryStore.getState().deleteCategory('local-1')).rejects.toThrow('boom');
    expect(mockDeleteFromDb).not.toHaveBeenCalled();
  });
});
