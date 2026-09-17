/**
 * `updateCategory` must persist the edit even when the server 404s.
 *
 * ## The bug this pins
 *
 * Locally-created and seeded categories carry a device-generated id, and
 * `Category` has no clientId column for the server to reconcile them by. The
 * old implementation `await`ed `api.updateCategory(localId)` BEFORE the local
 * upsert, so a 404 (prod-nginx, 2026-09-16: 13 of 15 PATCH /categories in 72h)
 * threw before anything was saved — the edit vanished on the next reload.
 * That is the "my category edits disappear after restart" user report.
 *
 * Contract now: local save first (optimistic), server best-effort; on 404 the
 * server twin (same name+type) is patched instead and re-synced.
 */

jest.mock('@/services/api', () => ({
  api: {
    getCategories: jest.fn(),
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
const mockGetById = jest.fn();
jest.mock('@/db/categoryRepository', () => ({
  getAllCategories: (...a: any[]) => mockGetAll(...a),
  upsertCategory: (...a: any[]) => mockUpsert(...a),
  getCategoryById: (...a: any[]) => mockGetById(...a),
  categoryExistsById: jest.fn().mockResolvedValue(false),
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

// Mock authStore outright: the real one transitively loads exchangeRateStore,
// whose module-scope refresh timer fires mid-test and crashes the VM.
jest.mock('@/stores/authStore', () => ({
  useAuthStore: { getState: jest.fn(() => ({ user: { id: 'u1' } })) },
}));

jest.mock('@/services/encryptionHelper', () => ({
  maybeEncrypt: jest.fn().mockResolvedValue({ payload: {}, encryptedPayload: undefined, encryptionKeyVersion: undefined }),
  maybeDecrypt: jest.fn().mockImplementation(async (_: unknown, cat: any) => ({ ...cat })),
}));

import { useCategoryStore } from '../categoryStore';
import { api } from '@/services/api';
import type { Category } from '@budget/shared-types';

const localCategory = (): Category => ({
  id: 'local-uuid-1',
  accountId: 'acc-1',
  name: 'Kawa',
  color: '#111111',
  type: 'expense',
  isSystem: false,
  createdAt: new Date('2026-09-01'),
  updatedAt: new Date('2026-09-01'),
  isDeleted: false,
  syncVersion: 0,
} as unknown as Category);

const notFound = () => Object.assign(new Error('Not Found'), { status: 404 });

beforeEach(() => {
  jest.clearAllMocks();
  mockUpsert.mockResolvedValue(undefined);
  mockGetAll.mockResolvedValue([localCategory()]);
  useCategoryStore.setState({
    categories: [localCategory()],
    isInitialized: true,
    isLoading: false,
  });
});


describe('categoryStore.updateCategory — local-first persistence', () => {
  it('persists the edit locally even when the server PATCH 404s', async () => {
    (api.updateCategory as jest.Mock).mockRejectedValueOnce(notFound());
    (api.getCategories as jest.Mock).mockResolvedValue([]);
    mockGetAll.mockResolvedValue([{ ...localCategory(), name: 'Kawa i ciasto' }]);

    await useCategoryStore.getState().updateCategory('local-uuid-1', { name: 'Kawa i ciasto' });

    // The old code threw here — nothing saved, edit lost on reload.
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'local-uuid-1', name: 'Kawa i ciasto' }),
    );
    expect(useCategoryStore.getState().categories.find((c) => c.id === 'local-uuid-1')?.name).toBe(
      'Kawa i ciasto',
    );
  });

  it('patches the server twin (matched by the OLD name) on a 404 and re-syncs', async () => {
    (api.updateCategory as jest.Mock)
      .mockRejectedValueOnce(notFound()) // PATCH by local id → 404
      .mockResolvedValueOnce({}); // PATCH the twin
    (api.getCategories as jest.Mock).mockResolvedValue([
      { id: 'server-uuid-9', name: 'Kawa', type: 'expense', isDeleted: false },
    ]);

    await useCategoryStore.getState().updateCategory('local-uuid-1', { name: 'Kawa i ciasto', color: '#ABCDEF' });

    expect(api.updateCategory).toHaveBeenNthCalledWith(2, 'server-uuid-9', {
      name: 'Kawa i ciasto',
      color: '#ABCDEF',
    });
  });

  it('does not throw when the 404 has no server twin', async () => {
    (api.updateCategory as jest.Mock).mockRejectedValueOnce(notFound());
    (api.getCategories as jest.Mock).mockResolvedValue([
      { id: 'server-uuid-9', name: 'Totally different', type: 'expense', isDeleted: false },
    ]);

    await expect(
      useCategoryStore.getState().updateCategory('local-uuid-1', { color: '#222222' }),
    ).resolves.toBeUndefined();
  });

  it('goes straight to the server (no twin lookup) when the PATCH succeeds', async () => {
    (api.updateCategory as jest.Mock).mockResolvedValueOnce({});

    await useCategoryStore.getState().updateCategory('local-uuid-1', { color: '#333333' });

    expect(api.getCategories).not.toHaveBeenCalled();
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'local-uuid-1', color: '#333333' }),
    );
  });

  it('still rethrows non-404 server failures (after the local save)', async () => {
    (api.updateCategory as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error('boom'), { status: 500 }),
    );

    await expect(
      useCategoryStore.getState().updateCategory('local-uuid-1', { color: '#444444' }),
    ).rejects.toThrow('boom');
    // Local save happened before the throw — the edit is not lost.
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'local-uuid-1', color: '#444444' }),
    );
  });
});
