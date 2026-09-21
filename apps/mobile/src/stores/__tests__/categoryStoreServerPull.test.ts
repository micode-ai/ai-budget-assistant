/**
 * `loadCategories` must reach the server even when the local table is NOT empty.
 *
 * ## The bug this pins
 *
 * ABA-564 taught `syncFromServer` to fold a stale local twin into the server's
 * row, which is what repairs a device whose categories carry device-generated
 * ids while its expenses carry the server's. But the only caller that passes it
 * the server's list was gated on `categories.length === 0` — true exactly once,
 * on a device that has never seeded. Every already-diverged install therefore
 * never ran the repair, and the convergence code was unreachable for the users
 * who needed it.
 *
 * The visible symptom (reported with a screen recording): every imported expense
 * showed "Bez kategorii" on the detail screen while the server had it filed
 * under a real category, and the "without category" filter returned nothing at
 * all — the ids those expenses carried resolved to no local row.
 */

jest.mock('@/services/api', () => ({
  api: {
    getCategories: jest.fn(),
    createCategory: jest.fn(),
    updateCategory: jest.fn(),
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

const mockGetAll = jest.fn();
const mockUpsert = jest.fn();
const mockGetByNameExcluding = jest.fn();
const mockMerge = jest.fn();

jest.mock('@/db/categoryRepository', () => ({
  getAllCategories: (...a: any[]) => mockGetAll(...a),
  upsertCategory: (...a: any[]) => mockUpsert(...a),
  getCategoryById: jest.fn().mockResolvedValue(null),
  getCategoryByClientId: jest.fn().mockResolvedValue(null),
  remapCategoryId: jest.fn().mockResolvedValue(undefined),
  getCategoryByNameExcludingId: (...a: any[]) => mockGetByNameExcluding(...a),
  mergeCategoryInto: (...a: any[]) => mockMerge(...a),
  categoryExistsById: jest.fn().mockResolvedValue(true),
  deleteCategory: jest.fn().mockResolvedValue(undefined),
  countCategoryReferences: jest.fn().mockResolvedValue(null),
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

jest.mock('@/stores/authStore', () => ({
  useAuthStore: { getState: jest.fn(() => ({ user: { id: 'u1' } })) },
}));

jest.mock('@/services/encryptionHelper', () => ({
  maybeEncrypt: jest.fn().mockImplementation(async (_t: string, data: any) => ({ payload: data })),
  maybeDecrypt: jest.fn().mockImplementation(async (_t: string, cat: any) => ({ ...cat })),
}));

import { useCategoryStore } from '../categoryStore';
import { api } from '@/services/api';

const localRow = {
  id: 'local-legacy',
  accountId: 'acc-1',
  name: 'Sample Category',
  type: 'expense' as const,
  isSystem: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  isDeleted: false,
  syncVersion: 0,
};

const serverRow = {
  id: 'server-1',
  clientId: null,
  accountId: 'acc-1',
  name: 'Sample Category',
  type: 'expense',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  isDeleted: false,
  syncVersion: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAll.mockResolvedValue([localRow]);
  mockUpsert.mockResolvedValue(undefined);
  mockMerge.mockResolvedValue(undefined);
  mockGetByNameExcluding.mockResolvedValue(null);
  (api.getCategories as jest.Mock).mockResolvedValue([serverRow]);
  useCategoryStore.getState().reset();
});

describe('categoryStore.loadCategories — server pull on a populated device', () => {
  it('fetches the server list even though the local table already has rows', async () => {
    await useCategoryStore.getState().loadCategories();

    expect(api.getCategories).toHaveBeenCalled();
  });

  it('folds a stale local twin into the server row during that pull', async () => {
    mockGetByNameExcluding.mockResolvedValue({ id: 'local-legacy' });

    await useCategoryStore.getState().loadCategories();

    expect(mockMerge).toHaveBeenCalledWith('local-legacy', 'server-1');
  });

  it('pulls only once per account per session', async () => {
    await useCategoryStore.getState().loadCategories();
    await useCategoryStore.getState().loadCategories();

    expect((api.getCategories as jest.Mock).mock.calls).toHaveLength(1);
  });

  it('keeps the local categories when the server is unreachable', async () => {
    (api.getCategories as jest.Mock).mockRejectedValue(new Error('offline'));

    await useCategoryStore.getState().loadCategories();

    expect(useCategoryStore.getState().categories).toHaveLength(1);
  });
});
