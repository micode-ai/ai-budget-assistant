// Reproduction test for the reported bug: "when I archive a shopping list, it
// still comes back to the list." Exercises the REAL archiveList store action
// through the REAL pullAndMergeShoppingLists, backed by stateful fakes that
// mimic SQLite (local) and the mockServer (with the same getLists materialize +
// archive-returns-archived semantics as ShoppingListService).

// ─── stateful fake SQLite (lists) ────────────────────────────────────────────
interface FakeRow {
  clientId: string;
  accountId: string;
  name: string;
  isDefault: boolean;
  isArchived: boolean;
  isDeleted: boolean;
  sortOrder: number;
  createdByUserId: string;
  syncStatus: string;
  createdAt: number;
}
const mockSqlite = new Map<string, FakeRow>();

// ─── stateful fake mockServer (lists) ────────────────────────────────────────────
interface SrvRow {
  clientId: string;
  accountId: string;
  name: string;
  isDefault: boolean;
  isArchived: boolean;
  isDeleted: boolean;
  sortOrder: number;
  createdByUserId: string;
}
const mockServer = new Map<string, SrvRow>();

function mockToServerList(r: SrvRow) {
  return {
    id: r.clientId,
    accountId: r.accountId,
    clientId: r.clientId,
    name: r.name,
    isDefault: r.isDefault,
    isArchived: r.isArchived,
    sortOrder: r.sortOrder,
    createdByUserId: r.createdByUserId,
    items: [],
  };
}

jest.mock('@/db/client', () => ({
  executeSql: jest.fn(),
  withTransaction: jest.fn((task: () => Promise<void>) => task()),
}));

jest.mock('@/db/shoppingListRepository', () => ({
  upsertShoppingList: jest.fn(async (list: any) => {
    mockSqlite.set(list.clientId, {
      clientId: list.clientId,
      accountId: list.accountId,
      name: list.name,
      isDefault: !!list.isDefault,
      isArchived: !!list.isArchived,
      isDeleted: !!list.isDeleted,
      sortOrder: list.sortOrder ?? 0,
      createdByUserId: list.createdByUserId ?? '',
      syncStatus: list.syncStatus ?? 'synced',
      createdAt: list.createdAt?.getTime?.() ?? Date.now(),
    });
  }),
  updateShoppingList: jest.fn(async (id: string, patch: any) => {
    const r = mockSqlite.get(id);
    if (!r) return;
    if (patch.name !== undefined) r.name = patch.name;
    if (patch.isArchived !== undefined) r.isArchived = patch.isArchived;
    r.syncStatus = 'pending';
  }),
  deleteShoppingList: jest.fn(async (id: string) => {
    const r = mockSqlite.get(id);
    if (r) {
      r.isDeleted = true;
      r.syncStatus = 'pending';
    }
  }),
  markShoppingListSynced: jest.fn(async (id: string) => {
    const r = mockSqlite.get(id);
    if (r) r.syncStatus = 'synced';
  }),
  getAllShoppingLists: jest.fn(async (accountId: string, includeArchived = false) => {
    return [...mockSqlite.values()]
      .filter(
        (r) =>
          r.accountId === accountId &&
          !r.isDeleted &&
          (includeArchived || !r.isArchived),
      )
      .map((r) => ({
        id: r.clientId,
        accountId: r.accountId,
        clientId: r.clientId,
        name: r.name,
        isDefault: r.isDefault,
        isArchived: r.isArchived,
        sortOrder: r.sortOrder,
        createdByUserId: r.createdByUserId,
        items: [],
      }));
  }),
  getPendingShoppingLists: jest.fn(async (accountId: string) => {
    return [...mockSqlite.values()]
      .filter((r) => r.accountId === accountId && r.syncStatus === 'pending')
      .map((r) => ({
        id: r.clientId,
        accountId: r.accountId,
        clientId: r.clientId,
        name: r.name,
        isDefault: r.isDefault,
        isArchived: r.isArchived,
        sortOrder: r.sortOrder,
        createdByUserId: r.createdByUserId,
        items: [],
        isDeleted: r.isDeleted,
        syncStatus: r.syncStatus,
        syncVersion: 0,
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.createdAt),
      }));
  }),
  getShoppingListCreatedAtMap: jest.fn(async (accountId: string) => {
    const m = new Map<string, number>();
    for (const r of mockSqlite.values())
      if (r.accountId === accountId) m.set(r.clientId, r.createdAt);
    return m;
  }),
}));

jest.mock('@/db/shoppingListItemRepository', () => ({
  getItemsForList: jest.fn().mockResolvedValue([]),
  upsertShoppingListItem: jest.fn().mockResolvedValue(undefined),
  updateShoppingListItem: jest.fn().mockResolvedValue(undefined),
  softDeleteShoppingListItem: jest.fn().mockResolvedValue(undefined),
  getPendingShoppingListItems: jest.fn().mockResolvedValue([]),
  markShoppingListItemSynced: jest.fn().mockResolvedValue(undefined),
  getShoppingListItemCreatedAtMap: jest.fn().mockResolvedValue(new Map()),
}));

jest.mock('@/services/api', () => ({
  api: {
    getLists: jest.fn(async () => {
      const acc = 'acc-1';
      const rows = [...mockServer.values()].filter(
        (r) => r.accountId === acc && !r.isDeleted,
      );
      if (rows.length === 0) {
        // mockServer materialize (only when NO non-deleted lists at all)
        const clientId = `default-${acc}`;
        const existing = mockServer.get(clientId);
        if (existing) {
          existing.isArchived = false;
          existing.isDeleted = false;
        } else {
          mockServer.set(clientId, {
            clientId,
            accountId: acc,
            name: 'My List',
            isDefault: true,
            isArchived: false,
            isDeleted: false,
            sortOrder: 0,
            createdByUserId: 'u1',
          });
        }
        return [mockToServerList(mockServer.get(clientId)!)];
      }
      return rows.map(mockToServerList);
    }),
    createList: jest.fn(async ({ clientId, name }: any) => {
      const existing = mockServer.get(clientId);
      if (existing) return mockToServerList(existing); // idempotent, unchanged
      const row: SrvRow = {
        clientId,
        accountId: 'acc-1',
        name,
        isDefault: false,
        isArchived: false,
        isDeleted: false,
        sortOrder: mockServer.size,
        createdByUserId: 'u1',
      };
      mockServer.set(clientId, row);
      return mockToServerList(row);
    }),
    updateList: jest.fn(async (id: string, dto: any) => {
      const r = mockServer.get(id);
      if (!r) throw Object.assign(new Error('Not found'), { status: 404 });
      if (dto.name !== undefined) r.name = dto.name;
      if (dto.isArchived !== undefined) r.isArchived = dto.isArchived;
      if (dto.sortOrder !== undefined) r.sortOrder = dto.sortOrder;
      return mockToServerList(r);
    }),
    deleteList: jest.fn(async (id: string) => {
      const r = mockServer.get(id);
      if (r) r.isDeleted = true;
    }),
    getRestockSuggestions: jest.fn().mockResolvedValue([]),
    getDeals: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../accountStore', () => ({
  useAccountStore: { getState: () => ({ currentAccountId: 'acc-1' }) },
}));
jest.mock('../authStore', () => ({
  useAuthStore: { getState: () => ({ user: { id: 'u1' } }) },
}));
jest.mock('../subscriptionStore', () => ({
  useSubscriptionStore: { getState: () => ({ isPro: () => false }) },
}));
jest.mock('../upgradeStore', () => ({
  useUpgradeStore: { getState: () => ({ show: jest.fn() }) },
}));
jest.mock('../../i18n', () => ({ __esModule: true, default: { t: (k: string) => k } }));

import { useShoppingListStore } from '../shoppingListStore';

const flush = () => new Promise((r) => setImmediate(r));

function seedList(clientId: string, over: Partial<FakeRow> = {}) {
  const base: FakeRow = {
    clientId,
    accountId: 'acc-1',
    name: clientId,
    isDefault: false,
    isArchived: false,
    isDeleted: false,
    sortOrder: 0,
    createdByUserId: 'u1',
    syncStatus: 'synced',
    createdAt: 1_700_000_000_000,
    ...over,
  };
  mockSqlite.set(clientId, { ...base });
  mockServer.set(clientId, {
    clientId,
    accountId: 'acc-1',
    name: base.name,
    isDefault: base.isDefault,
    isArchived: false, // mockServer starts un-archived
    isDeleted: false,
    sortOrder: base.sortOrder,
    createdByUserId: base.createdByUserId,
  });
}

describe('archiveList — reported "archive comes back" bug', () => {
  beforeEach(() => {
    mockSqlite.clear();
    mockServer.clear();
    jest.clearAllMocks();
    useShoppingListStore.setState({
      lists: [],
      activeListId: null,
      items: [],
      suggestions: [],
      deals: [],
      basketResult: null,
      isComparing: false,
      isLoading: false,
      error: null,
    } as any);
  });

  it('archiving a NON-last list keeps it gone after a subsequent hydrate', async () => {
    seedList('A');
    seedList('B');
    useShoppingListStore.setState({
      lists: [
        { id: 'A', clientId: 'A', name: 'A', isDefault: false, isArchived: false, sortOrder: 0, createdByUserId: 'u1', accountId: 'acc-1', items: [] },
        { id: 'B', clientId: 'B', name: 'B', isDefault: false, isArchived: false, sortOrder: 0, createdByUserId: 'u1', accountId: 'acc-1', items: [] },
      ],
      activeListId: 'A',
    } as any);

    await useShoppingListStore.getState().archiveList('A');
    await flush();

    // Immediately after archive: A gone from in-memory lists.
    expect(useShoppingListStore.getState().lists.map((l) => l.id)).toEqual(['B']);

    // A subsequent hydrate (screen remount / account change) must NOT bring A back.
    await useShoppingListStore.getState().hydrate();
    await flush();

    expect(useShoppingListStore.getState().lists.map((l) => l.id)).toEqual(['B']);
    expect(mockServer.get('A')!.isArchived).toBe(true);
    expect(mockSqlite.get('A')!.isArchived).toBe(true);
  });

  it('archiving the LAST list leaves an empty state and it does not come back', async () => {
    seedList('A');
    useShoppingListStore.setState({
      lists: [
        { id: 'A', clientId: 'A', name: 'A', isDefault: false, isArchived: false, sortOrder: 0, createdByUserId: 'u1', accountId: 'acc-1', items: [] },
      ],
      activeListId: 'A',
    } as any);

    // archiveList's noListsRemain branch triggers an internal hydrate().
    await useShoppingListStore.getState().archiveList('A');
    await flush();

    expect(useShoppingListStore.getState().lists).toEqual([]);

    // Remount hydrate — must stay empty, NOT resurrect A.
    await useShoppingListStore.getState().hydrate();
    await flush();

    expect(useShoppingListStore.getState().lists).toEqual([]);
    expect(mockServer.get('A')!.isArchived).toBe(true);
  });

  it('archiving the LAST list while OFFLINE (archive never reaches mockServer) still stays gone once back online', async () => {
    seedList('A');
    useShoppingListStore.setState({
      lists: [
        { id: 'A', clientId: 'A', name: 'A', isDefault: false, isArchived: false, sortOrder: 0, createdByUserId: 'u1', accountId: 'acc-1', items: [] },
      ],
      activeListId: 'A',
    } as any);

    // Simulate offline: the archive's fire-and-forget updateList + the internal
    // hydrate's mockServer calls all reject. The local archive still persists +
    // stays pending.
    const { api } = require('@/services/api');
    (api.updateList as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    (api.getLists as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    (api.createList as jest.Mock).mockRejectedValueOnce(new Error('offline'));

    await useShoppingListStore.getState().archiveList('A');
    await flush();
    expect(useShoppingListStore.getState().lists).toEqual([]);

    // Back online — hydrate must push the pending archive to the mockServer and NOT
    // let the (still un-archived) mockServer copy resurrect A.
    await useShoppingListStore.getState().hydrate();
    await flush();

    expect(useShoppingListStore.getState().lists).toEqual([]);
    expect(mockServer.get('A')!.isArchived).toBe(true);
  });
});
