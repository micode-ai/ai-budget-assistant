// `./client` resolves to `client.native.ts`, which opens a real expo-sqlite
// database as a module-load side effect (`SQLite.openDatabaseSync(...)`).
// That crashes under Jest (no native SQLite module available). The mappers
// under test are pure functions that never touch `executeSql`/`withTransaction`,
// so a lightweight factory mock isolates them from that side effect.
jest.mock('../client', () => ({
  executeSql: jest.fn(),
  withTransaction: jest.fn(),
}));

import { rowToShoppingList } from '../shoppingListRepository';
import { rowToShoppingListItem } from '../shoppingListItemRepository';

describe('shopping-list row mappers', () => {
  it('maps a list row to a ShoppingList entity (booleans, no items)', () => {
    const list = rowToShoppingList({
      id: 'l1', account_id: 'a1', client_id: 'c1', name: 'Weekly',
      is_default: 1, is_archived: 0, sort_order: 2, created_by_user_id: 'u1',
      is_deleted: 0, sync_status: 'synced', sync_version: 3,
      created_at: 1000, updated_at: 2000,
    });
    expect(list.name).toBe('Weekly');
    expect(list.isDefault).toBe(true);
    expect(list.isArchived).toBe(false);
    expect(list.sortOrder).toBe(2);
    expect(list.items).toEqual([]);
  });

  it('maps an item row to a ShoppingListItem entity (quantity number, isChecked bool, null canonicalName)', () => {
    const item = rowToShoppingListItem({
      id: 'i1', account_id: 'a1', shopping_list_id: 'l1', client_id: 'ci1',
      canonical_name: null, raw_label: 'Milk', quantity: 2, note: null,
      is_checked: 1, added_by_user_id: 'u1', sort_order: 0,
      is_deleted: 0, sync_status: 'synced', sync_version: 1,
      created_at: 1000, updated_at: 2000,
    });
    expect(item.rawLabel).toBe('Milk');
    expect(item.quantity).toBe(2);
    expect(item.isChecked).toBe(true);
    expect(item.canonicalName).toBeNull();
    expect(item.shoppingListId).toBe('l1');
  });
});
