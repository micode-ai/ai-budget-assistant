/**
 * A pull must fold a stale local category into the server's row.
 *
 * ## The bug this pins
 *
 * Categories created before `clientId` support carry a device-generated id on
 * the phone and a different primary key on the server, with nothing linking the
 * two. `syncFromServer` only adopted the server id when the server row carried
 * a `clientId` — on the production account that reported this, ALL 38 rows had
 * none. So the pull inserted the server's row beside the local one and every
 * expense went on pointing at the local id, which the server cannot resolve.
 *
 * The visible symptom: a budget on such a category showed the right figure from
 * local data and dropped to 0,00 zł on the next refresh, because the server had
 * stored those expenses with no category at all (ABA-566).
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

const mockUpsert = jest.fn();
const mockGetByNameExcluding = jest.fn();
const mockMerge = jest.fn();
const mockRemap = jest.fn();

jest.mock('@/db/categoryRepository', () => ({
  getAllCategories: jest.fn().mockResolvedValue([]),
  upsertCategory: (...a: any[]) => mockUpsert(...a),
  getCategoryById: jest.fn().mockResolvedValue(null),
  getCategoryByClientId: jest.fn().mockResolvedValue(null),
  remapCategoryId: (...a: any[]) => mockRemap(...a),
  getCategoryByNameExcludingId: (...a: any[]) => mockGetByNameExcluding(...a),
  mergeCategoryInto: (...a: any[]) => mockMerge(...a),
  categoryExistsById: jest.fn().mockResolvedValue(true),
  deleteCategory: jest.fn().mockResolvedValue(undefined),
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

const serverRow = (over: Record<string, unknown> = {}) => ({
  id: 'server-1',
  clientId: null,
  accountId: 'acc-1',
  name: 'Restauracja',
  type: 'expense',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  isDeleted: false,
  syncVersion: 1,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUpsert.mockResolvedValue(undefined);
  mockMerge.mockResolvedValue(undefined);
  mockRemap.mockResolvedValue(undefined);
  mockGetByNameExcluding.mockResolvedValue(null);
  useCategoryStore.setState({ categories: [], isInitialized: true, isLoading: false });
});

describe('categoryStore.syncFromServer — legacy category convergence', () => {
  it('folds a stale local twin into the server row when neither side has a clientId', async () => {
    mockGetByNameExcluding.mockResolvedValue({ id: 'local-legacy', name: 'Restauracja', type: 'expense' });

    await useCategoryStore.getState().syncFromServer([serverRow()]);

    expect(mockGetByNameExcluding).toHaveBeenCalledWith('acc-1', 'Restauracja', 'expense', 'server-1');
    expect(mockMerge).toHaveBeenCalledWith('local-legacy', 'server-1');
  });

  it('does nothing when there is no stale twin', async () => {
    mockGetByNameExcluding.mockResolvedValue(null);

    await useCategoryStore.getState().syncFromServer([serverRow()]);

    expect(mockMerge).not.toHaveBeenCalled();
  });

  // A row that carries a clientId is already handled by the older, narrower
  // branch above it; running both would merge the same pair twice.
  it('leaves a clientId-carrying row to the existing remap path', async () => {
    mockGetByNameExcluding.mockResolvedValue({ id: 'local-legacy' });

    await useCategoryStore.getState().syncFromServer([serverRow({ clientId: 'local-legacy' })]);

    expect(mockMerge).not.toHaveBeenCalled();
  });

  it('does not converge onto a deleted server category', async () => {
    mockGetByNameExcluding.mockResolvedValue({ id: 'local-legacy' });

    await useCategoryStore.getState().syncFromServer([serverRow({ isDeleted: true })]);

    expect(mockMerge).not.toHaveBeenCalled();
  });

  it('matches an income category on the income side, not as an expense', async () => {
    mockGetByNameExcluding.mockResolvedValue({ id: 'local-inc' });

    await useCategoryStore.getState().syncFromServer([serverRow({ type: 'income', name: 'Premia' })]);

    expect(mockGetByNameExcluding).toHaveBeenCalledWith('acc-1', 'Premia', 'income', 'server-1');
  });
});
