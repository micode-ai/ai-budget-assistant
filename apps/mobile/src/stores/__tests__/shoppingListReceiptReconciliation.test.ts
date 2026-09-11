// Unit tests for `reconcileWithReceipt`/`undoReceiptReconciliation`
// (ABA shopping-list-receipt-reconciliation). Same manual-factory-mock
// approach as shoppingListStore.test.ts — avoids pulling in `@/db/client`'s
// real expo-sqlite `openDatabaseSync` and keeps this file's mocks local to
// itself (Jest's module registry is per test file, so nothing here can leak
// into or be affected by shoppingListStore.test.ts's own mocks).
//
// NOTE: mocked via the RELATIVE path (not the `@/` alias), matching
// shoppingListStore.test.ts's convention — see that file's comment for why.

jest.mock('../../db/shoppingListRepository', () => ({
  upsertShoppingList: jest.fn().mockResolvedValue(undefined),
  deleteShoppingList: jest.fn().mockResolvedValue(undefined),
  markShoppingListSynced: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../db/shoppingListItemRepository', () => ({
  upsertShoppingListItem: jest.fn().mockResolvedValue(undefined),
  updateShoppingListItem: jest.fn().mockResolvedValue(undefined),
  softDeleteShoppingListItem: jest.fn().mockResolvedValue(undefined),
  markShoppingListItemSynced: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../shoppingListSync', () => ({
  pullAndMergeShoppingLists: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../accountStore', () => ({
  useAccountStore: {
    getState: () => ({ currentAccountId: 'acc-1' }),
  },
}));

jest.mock('../authStore', () => ({
  useAuthStore: {
    getState: () => ({ user: { id: 'user-1' } }),
  },
}));

jest.mock('../subscriptionStore', () => ({
  useSubscriptionStore: { getState: () => ({ isPro: () => false }) },
}));

jest.mock('../upgradeStore', () => ({
  useUpgradeStore: { getState: () => ({ show: jest.fn() }) },
}));

jest.mock('../../i18n', () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));

jest.mock('../../services/api', () => ({
  api: {
    updateItem: jest.fn().mockResolvedValue(undefined),
  },
}));

import { useShoppingListStore } from '../shoppingListStore';
import { useShoppingListAutoCheckStore } from '../shoppingListAutoCheckStore';
import { updateShoppingListItem } from '../../db/shoppingListItemRepository';
import { api } from '../../services/api';

function makeList(overrides: Partial<any> = {}) {
  return {
    id: 'list-1',
    accountId: 'acc-1',
    clientId: 'list-1',
    name: 'Groceries',
    isDefault: true,
    isArchived: false,
    sortOrder: 0,
    createdByUserId: 'user-1',
    items: [],
    ...overrides,
  };
}

function makeItem(overrides: Partial<any> = {}) {
  return {
    id: 'item-1',
    shoppingListId: 'list-1',
    clientId: 'item-1',
    canonicalName: null,
    rawLabel: 'Milk',
    quantity: 1,
    note: null,
    isChecked: false,
    addedByUserId: 'user-1',
    sortOrder: 0,
    ...overrides,
  };
}

describe('shoppingListStore — receipt reconciliation', () => {
  beforeEach(() => {
    useShoppingListStore.setState({
      lists: [],
      activeListId: null,
      items: [],
      basketResult: null,
      isComparing: false,
      isLoading: false,
      error: null,
    } as any);
    useShoppingListAutoCheckStore.setState({ enabled: true });
    jest.clearAllMocks();
  });

  it('auto-checks an item whose canonicalName exactly matches a receipt line, and persists locally + remotely', () => {
    const milk = makeItem({ id: 'item-milk', rawLabel: 'Milk', canonicalName: 'Mleko Laciate 1L' });
    useShoppingListStore.setState({
      lists: [makeList({ items: [milk] })],
      activeListId: 'list-1',
    } as any);

    const result = useShoppingListStore.getState().reconcileWithReceipt([
      { description: 'MLEKO LACIATE 1L', canonicalName: 'Mleko Laciate 1L' },
    ]);

    expect(result.checked).toEqual([{ id: 'item-milk', rawLabel: 'Milk' }]);

    const updated = useShoppingListStore.getState().lists[0].items[0];
    expect(updated.isChecked).toBe(true);

    expect(updateShoppingListItem).toHaveBeenCalledWith('item-milk', { isChecked: true });
    expect(api.updateItem).toHaveBeenCalledWith('item-milk', { isChecked: true });
  });

  it('does not touch an item that is already checked', () => {
    const milk = makeItem({ id: 'item-milk', canonicalName: 'Mleko Laciate 1L', isChecked: true });
    useShoppingListStore.setState({ lists: [makeList({ items: [milk] })], activeListId: 'list-1' } as any);

    const result = useShoppingListStore.getState().reconcileWithReceipt([
      { description: 'MLEKO LACIATE 1L', canonicalName: 'Mleko Laciate 1L' },
    ]);

    expect(result.checked).toEqual([]);
    expect(updateShoppingListItem).not.toHaveBeenCalled();
    expect(api.updateItem).not.toHaveBeenCalled();
  });

  it('skips items on an archived list', () => {
    const milk = makeItem({ id: 'item-milk', canonicalName: 'Mleko Laciate 1L' });
    useShoppingListStore.setState({
      lists: [makeList({ id: 'list-archived', isArchived: true, items: [milk] })],
      activeListId: null,
    } as any);

    const result = useShoppingListStore.getState().reconcileWithReceipt([
      { description: 'MLEKO LACIATE 1L', canonicalName: 'Mleko Laciate 1L' },
    ]);

    expect(result.checked).toEqual([]);
  });

  it('does nothing when the auto-check preference is off', () => {
    useShoppingListAutoCheckStore.setState({ enabled: false });
    const milk = makeItem({ id: 'item-milk', canonicalName: 'Mleko Laciate 1L' });
    useShoppingListStore.setState({ lists: [makeList({ items: [milk] })], activeListId: 'list-1' } as any);

    const result = useShoppingListStore.getState().reconcileWithReceipt([
      { description: 'MLEKO LACIATE 1L', canonicalName: 'Mleko Laciate 1L' },
    ]);

    expect(result.checked).toEqual([]);
    const item = useShoppingListStore.getState().lists[0].items[0];
    expect(item.isChecked).toBe(false);
  });

  it('undoReceiptReconciliation reverts exactly the given ids back to unchecked', () => {
    const milk = makeItem({ id: 'item-milk', canonicalName: 'Mleko Laciate 1L', isChecked: true });
    const eggs = makeItem({ id: 'item-eggs', rawLabel: 'Eggs', canonicalName: 'Jajka M', isChecked: true });
    useShoppingListStore.setState({ lists: [makeList({ items: [milk, eggs] })], activeListId: 'list-1' } as any);

    useShoppingListStore.getState().undoReceiptReconciliation(['item-milk']);

    const [milkAfter, eggsAfter] = useShoppingListStore.getState().lists[0].items;
    expect(milkAfter.isChecked).toBe(false);
    expect(eggsAfter.isChecked).toBe(true); // untouched — not in the undo list

    expect(updateShoppingListItem).toHaveBeenCalledWith('item-milk', { isChecked: false });
    expect(api.updateItem).toHaveBeenCalledWith('item-milk', { isChecked: false });
    expect(updateShoppingListItem).not.toHaveBeenCalledWith('item-eggs', expect.anything());
  });
});
