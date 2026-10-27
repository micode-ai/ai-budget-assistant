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
const mockByKeyExcluding = jest.fn();
const mockGetById = jest.fn();

jest.mock('@/db/categoryRepository', () => ({
  getAllCategories: jest.fn().mockResolvedValue([]),
  upsertCategory: (...a: any[]) => mockUpsert(...a),
  getCategoryById: (...a: any[]) => mockGetById(...a),
  getKeyConvergenceCandidates: (...a: any[]) => mockByKeyExcluding(...a),
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
  mockByKeyExcluding.mockResolvedValue([]);
  mockGetById.mockResolvedValue(null);
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

describe('categoryStore.syncFromServer — system keys', () => {
  const seed = (over: Record<string, unknown> = {}) => ({
    id: 'default-exp-groceries',
    accountId: 'acc-1',
    name: 'Groceries',
    type: 'expense',
    systemKey: 'groceries',
    nameCustomized: false,
    isSystem: true,
    ...over,
  });

  it('stores the key and the renamed flag the server sends', async () => {
    await useCategoryStore
      .getState()
      .syncFromServer([serverRow({ name: 'Zakupy spożywcze', systemKey: 'groceries', nameCustomized: true })]);

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'server-1', systemKey: 'groceries', nameCustomized: true }),
    );
  });

  it('keeps the key the row already has when the server row does not carry the field', async () => {
    mockGetById.mockResolvedValue({ id: 'server-1', systemKey: 'groceries', nameCustomized: false });

    await useCategoryStore.getState().syncFromServer([serverRow({ name: 'Zakupy spożywcze' })]);

    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'server-1', systemKey: 'groceries' }));
  });

  it('lets an explicit null from the server clear the key', async () => {
    mockGetById.mockResolvedValue({ id: 'server-1', systemKey: 'groceries' });

    await useCategoryStore.getState().syncFromServer([serverRow({ systemKey: null, nameCustomized: false })]);

    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'server-1', systemKey: null }));
  });

  // The names differ ("Groceries" here, "Zakupy spożywcze" on the server), so
  // the old name match could never pair them: the seed lived on beside the
  // server row and expenses stayed split between the two.
  it('converges a seed with the server row of the same key', async () => {
    mockByKeyExcluding.mockResolvedValue([seed()]);

    await useCategoryStore
      .getState()
      .syncFromServer([serverRow({ name: 'Zakupy spożywcze', systemKey: 'groceries', nameCustomized: false })]);

    expect(mockByKeyExcluding).toHaveBeenCalledWith('acc-1', 'groceries', 'expense', 'server-1');
    expect(mockMerge).toHaveBeenCalledTimes(1);
    expect(mockMerge).toHaveBeenCalledWith('default-exp-groceries', 'server-1');
  });

  // The real query returns every keyless default-* seed (any concept) beside
  // the rows already carrying the key; only the one whose name maps to the key
  // is folded.
  it('converges a seed not yet labelled whose stored name is that key', async () => {
    mockByKeyExcluding.mockResolvedValue([
      seed({ id: 'default-exp-health---fitness', name: 'Health & Fitness', systemKey: null }),
      seed({ id: 'default-exp-transport', name: 'Transport', systemKey: null }),
    ]);

    await useCategoryStore
      .getState()
      .syncFromServer([serverRow({ name: 'Zdrowie', systemKey: 'health' })]);

    expect(mockMerge).toHaveBeenCalledTimes(1);
    expect(mockMerge).toHaveBeenCalledWith('default-exp-health---fitness', 'server-1');
  });

  it('converges by key even when the server row carries a clientId', async () => {
    mockByKeyExcluding.mockResolvedValue([seed()]);

    await useCategoryStore
      .getState()
      .syncFromServer([serverRow({ clientId: 'some-other-device', name: 'Zakupy spożywcze', systemKey: 'groceries' })]);

    expect(mockMerge).toHaveBeenCalledWith('default-exp-groceries', 'server-1');
  });

  it('never folds a seed the user renamed', async () => {
    mockByKeyExcluding.mockResolvedValue([
      seed({ name: 'Biedronka', nameCustomized: true }),
      seed({ id: 'default-exp-shopping', name: 'Sklep', systemKey: null }),
    ]);

    await useCategoryStore.getState().syncFromServer([serverRow({ name: 'Zakupy spożywcze', systemKey: 'groceries' })]);

    expect(mockMerge).not.toHaveBeenCalled();
  });

  it('never folds a row that is not a local seed', async () => {
    mockByKeyExcluding.mockResolvedValue([seed({ id: '2b1f5f0e-0000-4000-8000-000000000001', isSystem: false })]);

    await useCategoryStore.getState().syncFromServer([serverRow({ name: 'Zakupy spożywcze', systemKey: 'groceries' })]);

    expect(mockMerge).not.toHaveBeenCalled();
  });

  it('does not look up a key for a deleted server row', async () => {
    mockByKeyExcluding.mockResolvedValue([seed()]);

    await useCategoryStore
      .getState()
      .syncFromServer([serverRow({ systemKey: 'groceries', isDeleted: true })]);

    expect(mockMerge).not.toHaveBeenCalled();
  });
});
