/**
 * Creating a category offline-first must ADOPT the server PK.
 *
 * ## The bug this pins
 *
 * The local row was saved under a device-generated id and the POST result was
 * discarded (fire-and-forget). The server creates its own row with its own PK,
 * and it resolves a budget allocation by NAME to that PK — so a budget on a
 * newly-created category was stored against the server PK while the device's
 * expenses kept the local id. After the next pull the budget read 0,00 (or
 * "everything") while the list still showed the category.
 *
 * Contract now: the create is awaited, and when the server answers with a
 * different id every local reference is re-pointed at it (`remapCategoryId`)
 * while the clientId is kept so a resend/pull can still match the row.
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
const mockRemap = jest.fn();
const mockGetByClientId = jest.fn();
const mockGetById = jest.fn();
jest.mock('@/db/categoryRepository', () => ({
  getCategoryByNameExcludingId: jest.fn().mockResolvedValue(null),
  mergeCategoryInto: jest.fn().mockResolvedValue(undefined),
  getAllCategories: (...a: any[]) => mockGetAll(...a),
  upsertCategory: (...a: any[]) => mockUpsert(...a),
  remapCategoryId: (...a: any[]) => mockRemap(...a),
  getCategoryByClientId: (...a: any[]) => mockGetByClientId(...a),
  getCategoryById: (...a: any[]) => mockGetById(...a),
  categoryExistsById: jest.fn().mockResolvedValue(true),
  deleteCategory: jest.fn().mockResolvedValue(undefined),
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

jest.mock('@/stores/authStore', () => ({
  useAuthStore: { getState: jest.fn(() => ({ user: { id: 'u1' } })) },
}));

jest.mock('@/services/encryptionHelper', () => ({
  maybeEncrypt: jest.fn().mockImplementation(async (_t: string, data: any) => ({ payload: data })),
  maybeDecrypt: jest.fn().mockImplementation(async (_t: string, cat: any) => ({ ...cat })),
}));

import { useCategoryStore } from '../categoryStore';
import { api } from '@/services/api';

beforeEach(() => {
  jest.clearAllMocks();
  mockUpsert.mockResolvedValue(undefined);
  mockGetAll.mockResolvedValue([]);
  mockRemap.mockResolvedValue(undefined);
  mockGetById.mockResolvedValue(null);
  useCategoryStore.setState({ categories: [], isInitialized: true, isLoading: false });
});

describe('categoryStore.createCategory — adopts the server id', () => {
  it('remaps the local row and every reference when the server returns a different id', async () => {
    (api.createCategory as jest.Mock).mockResolvedValue({ id: 'server-9', clientId: 'local-1', name: 'Kawa', type: 'expense' });

    const created = await useCategoryStore.getState().createCategory('Kawa', 'expense');

    // The clientId sent must be the local id, so the server can be idempotent.
    const sent = (api.createCategory as jest.Mock).mock.calls[0][0];
    expect(sent.clientId).toBe(sent.localIdSent ?? sent.clientId);
    expect(typeof sent.clientId).toBe('string');

    expect(mockRemap).toHaveBeenCalledWith(sent.clientId, 'server-9', sent.clientId);
    expect(created.id).toBe('server-9');
    expect(created.clientId).toBe(sent.clientId);
  });

  it('keeps the local row when the create fails (offline) instead of throwing', async () => {
    (api.createCategory as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));

    const created = await useCategoryStore.getState().createCategory('Kawa', 'expense');

    expect(mockUpsert).toHaveBeenCalled();
    expect(mockRemap).not.toHaveBeenCalled();
    expect(created.name).toBe('Kawa');
  });

  it('does not remap when the server echoes the same id', async () => {
    (api.createCategory as jest.Mock).mockImplementation(async (data: any) => ({ id: data.clientId, clientId: data.clientId, name: 'Kawa', type: 'expense' }));

    const created = await useCategoryStore.getState().createCategory('Kawa', 'expense');

    expect(mockRemap).not.toHaveBeenCalled();
    expect(created.id).toBe(created.clientId);
  });
});
