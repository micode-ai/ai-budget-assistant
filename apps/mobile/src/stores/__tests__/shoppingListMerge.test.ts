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
}));

jest.mock('@/db/shoppingListItemRepository', () => ({
  getItemsForList: jest.fn().mockResolvedValue([]),
  upsertShoppingListItem: jest.fn().mockResolvedValue(undefined),
  softDeleteShoppingListItem: jest.fn().mockResolvedValue(undefined),
  getPendingShoppingListItems: jest.fn().mockResolvedValue([]),
  markShoppingListItemSynced: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/services/api', () => ({
  api: {
    getLists: jest.fn().mockResolvedValue([]),
    createList: jest.fn().mockResolvedValue({}),
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

import { mergeServerLists } from '../shoppingListSync';

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
});
