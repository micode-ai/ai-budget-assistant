/**
 * The app's own offline seeds carry catalog keys (category system keys spec).
 *
 * Seed rows keep the deterministic ids devices already hold; what changes is
 * that each carries its key, so it reads in the UI language and converges with
 * the server's row of the same key. An already-seeded row from an older build
 * is labelled in place (only while its name is still the standard one), and a
 * seed whose key the server's pull already delivered is not created a second
 * time beside it.
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
const mockExists = jest.fn();

jest.mock('@/db/categoryRepository', () => ({
  getAllCategories: (...a: any[]) => mockGetAll(...a),
  upsertCategory: (...a: any[]) => mockUpsert(...a),
  getCategoryById: jest.fn().mockResolvedValue(null),
  getCategoryByClientId: jest.fn().mockResolvedValue(null),
  remapCategoryId: jest.fn().mockResolvedValue(undefined),
  getCategoryByNameExcludingId: (...a: any[]) => mockGetByNameExcluding(...a),
  mergeCategoryInto: (...a: any[]) => mockMerge(...a),
  categoryExistsById: (...a: any[]) => mockExists(...a),
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
import { CATEGORY_SEEDS } from '@/features/categories/categorySeeds';

const row = (over: Record<string, unknown>) => ({
  accountId: 'acc-1',
  type: 'expense',
  color: '#111111',
  isSystem: true,
  systemKey: null,
  nameCustomized: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  isDeleted: false,
  syncVersion: 0,
  ...over,
});

const upserted = () => mockUpsert.mock.calls.map((c) => c[0]);

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAll.mockResolvedValue([]);
  mockUpsert.mockResolvedValue(undefined);
  mockMerge.mockResolvedValue(undefined);
  mockGetByNameExcluding.mockResolvedValue(null);
  mockExists.mockResolvedValue(false);
  (api.getCategories as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));
  useCategoryStore.getState().reset();
});

describe('categoryStore.loadCategories — keyed seeds', () => {
  it('seeds every default with its key, under the ids devices already hold', async () => {
    await useCategoryStore.getState().loadCategories();

    const written = upserted();
    expect(written.map((c) => c.id)).toEqual(CATEGORY_SEEDS.map((s) => s.id));
    const health = written.find((c) => c.id === 'default-exp-health---fitness');
    expect(health).toEqual(expect.objectContaining({ systemKey: 'health', nameCustomized: false, isSystem: true, name: 'Health' }));
    for (const c of written) expect(c.systemKey).toBeTruthy();
  });

  it('labels an unkeyed seed row from an older build in place', async () => {
    mockGetAll.mockResolvedValue([row({ id: 'default-exp-health---fitness', name: 'Health & Fitness' })]);
    mockExists.mockResolvedValue(true);

    await useCategoryStore.getState().loadCategories();

    expect(upserted()).toEqual([
      expect.objectContaining({ id: 'default-exp-health---fitness', name: 'Health & Fitness', systemKey: 'health' }),
    ]);
  });

  it('leaves a seed row the user renamed unlabelled', async () => {
    mockGetAll.mockResolvedValue([row({ id: 'default-exp-groceries', name: 'Biedronka' })]);
    mockExists.mockResolvedValue(true);

    await useCategoryStore.getState().loadCategories();

    expect(upserted()).toEqual([]);
  });

  it('writes only a tombstone for a key the server pull already delivered', async () => {
    mockGetAll.mockResolvedValue([
      row({ id: 'server-groceries', name: 'Zakupy spożywcze', systemKey: 'groceries', isSystem: false }),
    ]);

    await useCategoryStore.getState().loadCategories();

    const seed = upserted().filter((c) => c.id === 'default-exp-groceries');
    expect(seed).toEqual([expect.objectContaining({ isDeleted: true, systemKey: 'groceries' })]);
    expect(upserted().find((c) => c.id === 'default-exp-transport')?.isDeleted).toBe(false);
  });

  it('writes nothing for a seed id already in the table, even as a tombstone', async () => {
    mockGetAll.mockResolvedValue([
      row({ id: 'server-groceries', name: 'Zakupy spożywcze', systemKey: 'groceries', isSystem: false }),
    ]);
    mockExists.mockImplementation(async (id: string) => id === 'default-exp-groceries');

    await useCategoryStore.getState().loadCategories();

    expect(upserted().map((c) => c.id)).not.toContain('default-exp-groceries');
  });
});
