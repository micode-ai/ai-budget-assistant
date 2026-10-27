/**
 * A standard category the user deleted must stay deleted, even though this
 * device seeds its own copy of it.
 *
 * The seed guard is `categoryExistsById(seed.id)`: a seed id that is in the
 * table (live or soft-deleted) is never seeded again. Two paths used to leave
 * NO row under the seed id - a new online install skipped the seed because the
 * server's keyed row was already there, and key convergence hard-deleted the
 * seed - so once the user deleted the server's category, the next launch
 * seeded "Groceries" back. Both now leave a tombstone.
 *
 * Runs the real loadCategories -> syncFromServer path over an in-memory table
 * that mirrors the repository's semantics (live reads filter is_deleted; the
 * key-convergence query also returns keyless `default-*` seeds; merging a seed
 * soft-deletes it).
 */

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    getString: () => undefined,
    getNumber: () => undefined,
    set: () => {},
    delete: () => {},
  })),
}));

type Row = Record<string, any> & { id: string; accountId: string; name: string; type: string; isDeleted?: boolean };
const mockTable = new Map<string, Row>();
const mockMerges: [string, string][] = [];

jest.mock('@/db/categoryRepository', () => ({
  getAllCategories: jest.fn(async (accountId: string) =>
    [...mockTable.values()].filter((c) => c.accountId === accountId && !c.isDeleted),
  ),
  upsertCategory: jest.fn(async (c: Row) => {
    const prev = mockTable.get(c.id);
    const next = { ...prev, ...c };
    // The real upsert leaves the key alone when the object does not carry it.
    if (c.systemKey === undefined && prev) next.systemKey = prev.systemKey;
    mockTable.set(c.id, next);
  }),
  categoryExistsById: jest.fn(async (id: string) => mockTable.has(id)),
  getCategoryById: jest.fn(async (id: string) => mockTable.get(id) ?? null),
  getCategoryByClientId: jest.fn(async () => null),
  remapCategoryId: jest.fn(async () => undefined),
  getCategoryByNameExcludingId: jest.fn(
    async (accountId: string, name: string, type: string, excludeId: string) =>
      [...mockTable.values()].find(
        (c) => c.accountId === accountId && c.name === name && c.type === type && c.id !== excludeId && !c.isDeleted,
      ) ?? null,
  ),
  getKeyConvergenceCandidates: jest.fn(async (accountId: string, key: string, type: string, excludeId: string) =>
    [...mockTable.values()].filter(
      (c) =>
        c.accountId === accountId &&
        c.type === type &&
        c.id !== excludeId &&
        !c.isDeleted &&
        (c.systemKey === key || (!c.systemKey && c.id.startsWith('default-'))),
    ),
  ),
  mergeCategoryInto: jest.fn(async (staleId: string, survivingId: string) => {
    mockMerges.push([staleId, survivingId]);
    if (staleId.startsWith('default-')) mockTable.set(staleId, { ...mockTable.get(staleId)!, isDeleted: true });
    else mockTable.delete(staleId);
  }),
  deleteCategory: jest.fn(async () => undefined),
  countCategoryReferences: jest.fn(async () => null),
}));

jest.mock('@/services/api', () => ({
  api: {
    getCategories: jest.fn(),
    createCategory: jest.fn(),
    updateCategory: jest.fn(),
    setLogoutHandler: jest.fn(),
    setAccountIdGetter: jest.fn(),
  },
}));
jest.mock('@/services/secureStorage', () => ({
  secureStorage: { getItem: jest.fn().mockResolvedValue(null), setItem: jest.fn(), removeItem: jest.fn() },
}));
jest.mock('@/db/syncMetadataRepository', () => ({ setLastSyncTime: jest.fn() }));
jest.mock('@/stores/accountStore', () => ({
  useAccountStore: { getState: jest.fn(() => ({ currentAccountId: 'acc-1' })) },
}));
jest.mock('@/stores/authStore', () => ({ useAuthStore: { getState: jest.fn(() => ({ user: { id: 'u1' } })) } }));
jest.mock('@/services/encryptionHelper', () => ({
  maybeEncrypt: jest.fn(async (_t: string, d: any) => ({ payload: d })),
  maybeDecrypt: jest.fn(async (_t: string, c: any) => ({ ...c })),
}));

import { useCategoryStore } from '../categoryStore';
import { api } from '@/services/api';

const now = new Date().toISOString();
const serverGroceries = (over: Record<string, unknown> = {}) => ({
  id: 'srv-groceries',
  clientId: null,
  accountId: 'acc-1',
  name: 'Zakupy spożywcze',
  type: 'expense',
  systemKey: 'groceries',
  nameCustomized: false,
  isSystem: false,
  isDeleted: false,
  syncVersion: 1,
  createdAt: now,
  updatedAt: now,
  color: '#000000',
  ...over,
});

const visibleIds = () => useCategoryStore.getState().categories.map((c) => c.id);

async function launch(serverRows: any[]) {
  (api.getCategories as jest.Mock).mockResolvedValue(serverRows);
  useCategoryStore.getState().reset();
  await useCategoryStore.getState().loadCategories();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTable.clear();
  mockMerges.length = 0;
});

describe('seed tombstones', () => {
  it('a new online install keeps the server row, leaves an invisible tombstone, and never re-seeds after a delete', async () => {
    await launch([serverGroceries()]);

    expect(visibleIds()).toContain('srv-groceries');
    expect(visibleIds()).not.toContain('default-exp-groceries');
    expect(mockTable.get('default-exp-groceries')).toEqual(
      expect.objectContaining({ isDeleted: true, systemKey: 'groceries' }),
    );
    // Keys the server did not deliver are still seeded live.
    expect(visibleIds()).toContain('default-exp-transport');

    // The user deleted the standard category; a later pull delivers it deleted.
    await launch([serverGroceries({ isDeleted: true })]);

    expect(visibleIds()).not.toContain('srv-groceries');
    expect(visibleIds()).not.toContain('default-exp-groceries');
    expect(mockTable.get('default-exp-groceries')?.isDeleted).toBe(true);
  });

  it('an upgraded device converges its unlabelled seed on the FIRST pull and never re-seeds it after a delete', async () => {
    // Seeded by an old build: English name, no key.
    mockTable.set('default-exp-groceries', {
      id: 'default-exp-groceries',
      accountId: 'acc-1',
      name: 'Groceries',
      type: 'expense',
      isSystem: true,
      systemKey: null,
      color: '#27AE60',
      isDeleted: false,
    });

    await launch([serverGroceries()]);

    expect(mockMerges).toContainEqual(['default-exp-groceries', 'srv-groceries']);
    expect(visibleIds()).toContain('srv-groceries');
    expect(visibleIds()).not.toContain('default-exp-groceries');

    await launch([serverGroceries({ isDeleted: true })]);

    expect(visibleIds()).not.toContain('default-exp-groceries');
    expect(visibleIds()).not.toContain('srv-groceries');
  });

  describe('a keyless server duplicate with the exact seed name', () => {
    const seed = () => ({
      id: 'default-exp-groceries',
      accountId: 'acc-1',
      name: 'Groceries',
      type: 'expense',
      isSystem: true,
      systemKey: null,
      color: '#27AE60',
      isDeleted: false,
    });
    const keylessGroceries = serverGroceries({ id: 'srv-groceries-en', name: 'Groceries', systemKey: null });

    it.each([
      ['keyed row first', () => [serverGroceries(), keylessGroceries]],
      ['keyless row first', () => [keylessGroceries, serverGroceries()]],
    ])('pairs the seed with the keyless "Groceries", never the keyed row (%s)', async (_label, rows) => {
      mockTable.set('default-exp-groceries', seed());

      await launch(rows());

      // mergeCategoryInto is what re-points expenses: the seed's expenses go
      // to the row they have always matched by name, not to the keyed row.
      expect(mockMerges).toContainEqual(['default-exp-groceries', 'srv-groceries-en']);
      expect(mockMerges).not.toContainEqual(['default-exp-groceries', 'srv-groceries']);
      expect(visibleIds()).toEqual(expect.arrayContaining(['srv-groceries', 'srv-groceries-en']));
      expect(visibleIds()).not.toContain('default-exp-groceries');
    });

    it('skips the key merge when the keyless twin is already stored from an earlier pull', async () => {
      mockTable.set('default-exp-groceries', seed());
      mockTable.set('srv-groceries-en', { ...keylessGroceries, isDeleted: false });

      await useCategoryStore.getState().syncFromServer([serverGroceries()]);

      expect(mockMerges).not.toContainEqual(['default-exp-groceries', 'srv-groceries']);
    });
  });

  it('does not fold a keyless seed of ANOTHER concept that the widened query also returns', async () => {
    mockTable.set('default-exp-shopping', {
      id: 'default-exp-shopping',
      accountId: 'acc-1',
      name: 'Shopping',
      type: 'expense',
      isSystem: true,
      systemKey: null,
      color: '#2B8ABD',
      isDeleted: false,
    });

    await launch([serverGroceries()]);

    expect(mockMerges.map(([stale]) => stale)).not.toContain('default-exp-shopping');
    expect(visibleIds()).toContain('default-exp-shopping');
  });
});
