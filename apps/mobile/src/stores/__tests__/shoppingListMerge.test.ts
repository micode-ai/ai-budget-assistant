// `shoppingListSync.ts` imports `@/db/client` (transitively, via
// shoppingListRepository/shoppingListItemRepository) which opens a real
// expo-sqlite database as a module-load side effect. That crashes under Jest
// (no native SQLite module available). `mergeServerLists` itself is a pure
// function, so we isolate it from every side-effecting sibling import with
// lightweight factory mocks — same pattern as
// `src/db/__tests__/shoppingListMappers.test.ts` (Task 2) and
// `src/stores/__tests__/expenseStore.test.ts`'s `jest.mock('../expenseSync', ...)`.
jest.mock('@/db/client', () => ({
  executeSql: jest.fn(),
  withTransaction: jest.fn((task: () => Promise<void>) => task()),
}));

jest.mock('@/db/shoppingListRepository', () => ({
  getAllShoppingLists: jest.fn().mockResolvedValue([]),
  upsertShoppingList: jest.fn().mockResolvedValue(undefined),
  deleteShoppingList: jest.fn().mockResolvedValue(undefined),
  getPendingShoppingLists: jest.fn().mockResolvedValue([]),
  markShoppingListSynced: jest.fn().mockResolvedValue(undefined),
  getShoppingListCreatedAtMap: jest.fn().mockResolvedValue(new Map()),
}));

jest.mock('@/db/shoppingListItemRepository', () => ({
  getItemsForList: jest.fn().mockResolvedValue([]),
  upsertShoppingListItem: jest.fn().mockResolvedValue(undefined),
  softDeleteShoppingListItem: jest.fn().mockResolvedValue(undefined),
  getPendingShoppingListItems: jest.fn().mockResolvedValue([]),
  markShoppingListItemSynced: jest.fn().mockResolvedValue(undefined),
  getShoppingListItemCreatedAtMap: jest.fn().mockResolvedValue(new Map()),
}));

jest.mock('@/services/api', () => ({
  api: {
    getLists: jest.fn().mockResolvedValue([]),
    createList: jest.fn().mockResolvedValue({}),
    updateList: jest.fn().mockResolvedValue({}),
    deleteList: jest.fn().mockResolvedValue({}),
    addItem: jest.fn().mockResolvedValue({}),
    updateItem: jest.fn().mockResolvedValue({}),
    deleteItem: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('../accountStore', () => ({
  useAccountStore: {
    getState: () => ({ currentAccountId: 'acc-1' }),
  },
}));

import { mergeServerLists, pullAndMergeShoppingLists } from '../shoppingListSync';
import { api } from '@/services/api';
import {
  getPendingShoppingLists,
  getAllShoppingLists,
  upsertShoppingList,
} from '@/db/shoppingListRepository';

describe('mergeServerLists', () => {
  const local = [
    { clientId: 'c1', syncStatus: 'synced', name: 'Old' },   // server still has it (update)
    { clientId: 'c2', syncStatus: 'synced', name: 'Gone' },   // server dropped it (tombstone)
    { clientId: 'c3', syncStatus: 'pending', name: 'Local' }, // unpushed local (keep)
  ] as any[];
  const server = [
    { clientId: 'c1', name: 'New' },
  ] as any[];

  it('updates present, tombstones absent-synced, keeps pending', () => {
    const { toUpsert, toTombstone } = mergeServerLists(local, server);
    expect(toUpsert.map((l) => l.clientId)).toEqual(['c1']);
    expect(toTombstone).toEqual(['c2']);                     // synced + server-absent → delete
    // c3 is pending → neither upserted from server nor tombstoned
  });

  it('does not overwrite a still-pending local edit with stale server data', () => {
    const localWithPendingEdit = [
      { clientId: 'c1', syncStatus: 'pending', name: 'Renamed Locally' }, // unpushed edit
    ] as any[];
    const serverStale = [
      { clientId: 'c1', name: 'Old Server Name' },
    ] as any[];
    const { toUpsert } = mergeServerLists(localWithPendingEdit, serverStale);
    expect(toUpsert.map((l) => l.clientId)).not.toContain('c1');
    expect(toUpsert).toEqual([]);
  });
});

// Regression test for the "offline rename/archive silently reverted" bug:
// api.createList is idempotent on (accountId, clientId) — for a list the
// server already has, it returns the EXISTING row UNCHANGED, ignoring a new
// name. pushPendingLists (private, exercised here via pullAndMergeShoppingLists)
// must follow up with api.updateList so a renamed/archived-but-already-synced
// row's edits actually reach the server, instead of being falsely marked
// synced and reverted by the next merge.
describe('pushPendingLists (via pullAndMergeShoppingLists)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.getLists as jest.Mock).mockResolvedValue([]);
    (getPendingShoppingLists as jest.Mock).mockResolvedValue([]);
  });

  it('pushes a renamed + archived pending list via updateList after createList', async () => {
    const pendingList = {
      id: 'list-1',
      accountId: 'acc-1',
      clientId: 'list-1',
      name: 'Renamed Groceries',
      isDefault: false,
      isArchived: true,
      sortOrder: 0,
      createdByUserId: 'user-1',
      items: [],
      isDeleted: false,
      syncStatus: 'pending',
    } as any;
    (getPendingShoppingLists as jest.Mock).mockResolvedValue([pendingList]);

    const set = jest.fn();
    await pullAndMergeShoppingLists('acc-1', set);

    expect(api.createList).toHaveBeenCalledWith({
      clientId: 'list-1',
      name: 'Renamed Groceries',
    });
    expect(api.updateList).toHaveBeenCalledWith('list-1', {
      name: 'Renamed Groceries',
      isArchived: true,
    });
  });

  // Regression for the "archive a list, it comes back" bug: the pull-merge now
  // feeds archived local rows (getAllShoppingLists includeArchived) into the
  // merge, so a locally-archived, still-pending list is protected from a stale
  // server copy that still reports it as un-archived.
  it('does NOT un-archive a locally-archived pending list from a stale server copy', async () => {
    const archived = {
      id: 'c-arch',
      accountId: 'acc-1',
      clientId: 'c-arch',
      name: 'Old',
      isDefault: false,
      isArchived: true,
      sortOrder: 0,
      createdByUserId: 'u1',
      items: [],
      isDeleted: false,
      syncStatus: 'pending',
    } as any;
    (getAllShoppingLists as jest.Mock).mockResolvedValue([archived]); // Part B: archived included
    (getPendingShoppingLists as jest.Mock).mockResolvedValue([archived]);
    (api.getLists as jest.Mock).mockResolvedValue([{ ...archived, isArchived: false }]); // stale

    const set = jest.fn();
    await pullAndMergeShoppingLists('acc-1', set);

    // The list is pending → mergeServerLists excludes it from toUpsert, so
    // upsertShoppingList is never called to write isArchived:false back.
    const upsertedClientIds = (upsertShoppingList as jest.Mock).mock.calls.map((c) => c[0]?.clientId);
    expect(upsertedClientIds).not.toContain('c-arch');
  });
});
