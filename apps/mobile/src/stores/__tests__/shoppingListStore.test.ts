// Regression test for the hydrate-race fix: `createList`/`addItem` must NOT
// mark a row 'synced' until the server create actually acknowledges it.
// Marking it 'synced' before the ack lets a concurrent hydrate()'s merge see
// a "synced" row absent from the (not-yet-processed) server response and
// tombstone it — the next pending-sweep then pushes a delete for a create
// that only just landed, permanently losing the row. See shoppingListStore.ts.
//
// Same manual-factory-mock approach as expenseStore.test.ts — avoids pulling
// in `@/db/client`'s real expo-sqlite `openDatabaseSync` (crashes under Jest).

// NOTE: mocked via the RELATIVE path (not the `@/` alias) — matching
// expenseStore.test.ts's convention. `@/`-alias jest.mock() calls resolve
// inconsistently between this test file's directory and shoppingListStore.ts's
// own `@/...` imports in this Jest+babel-module-resolver setup, which silently
// leaves the store using the real (unmocked) module.
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
  useSubscriptionStore: {
    getState: () => ({ isPro: () => false }),
  },
}));

jest.mock('../upgradeStore', () => ({
  useUpgradeStore: {
    getState: () => ({ show: jest.fn() }),
  },
}));

jest.mock('../../i18n', () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));

// Deferred promises so the test controls exactly when the mocked `api` calls
// resolve, to observe store state/mock-calls strictly *before* and *after*
// the server ack.
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const mockCreateListDeferred = deferred<unknown>();
const mockAddItemDeferred = deferred<unknown>();

jest.mock('../../services/api', () => ({
  api: {
    createList: jest.fn(() => mockCreateListDeferred.promise),
    addItem: jest.fn(() => mockAddItemDeferred.promise),
  },
}));

import { useShoppingListStore } from '../shoppingListStore';
import { markShoppingListSynced } from '../../db/shoppingListRepository';
import { markShoppingListItemSynced } from '../../db/shoppingListItemRepository';
import { api } from '../../services/api';

describe('shoppingListStore — hydrate-race fix', () => {
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
    jest.clearAllMocks();
  });

  it('createList keeps the row pending until api.createList resolves', async () => {
    const createPromise = useShoppingListStore.getState().createList('Groceries');

    // The optimistic in-memory row must show up immediately, as 'pending'.
    const list = useShoppingListStore.getState().lists[0];
    expect(list).toBeDefined();
    expect((list as any).syncStatus).toBe('pending');

    // `createList`'s async body suspends at `await upsertShoppingList(...)`
    // before it reaches the fire-and-forget `api.createList(...)` call, so we
    // must let the outer action finish (it does NOT await the fire-and-forget
    // chain itself) before asserting on it.
    await createPromise;

    // The create request is in flight but hasn't resolved yet (deferred) —
    // the row must NOT be marked synced before the ack.
    expect(api.createList).toHaveBeenCalled();
    expect(markShoppingListSynced).not.toHaveBeenCalled();

    // Server acks the create.
    mockCreateListDeferred.resolve({});
    await Promise.resolve();
    await Promise.resolve();

    expect(markShoppingListSynced).toHaveBeenCalledWith(list.id);
  });

  it('addItem keeps the row pending until api.addItem resolves', async () => {
    // Seed an active list to add the item to.
    useShoppingListStore.setState({
      lists: [
        {
          id: 'list-1',
          accountId: 'acc-1',
          clientId: 'list-1',
          name: 'Groceries',
          isDefault: true,
          isArchived: false,
          sortOrder: 0,
          createdByUserId: 'user-1',
          items: [],
        } as any,
      ],
      activeListId: 'list-1',
    } as any);

    const addPromise = useShoppingListStore.getState().addItem('Milk');

    const item = useShoppingListStore.getState().lists[0].items[0];
    expect(item).toBeDefined();
    expect((item as any).syncStatus).toBe('pending');

    // See createList's test above for why the outer action must be awaited
    // before asserting on the fire-and-forget `api.addItem(...)` call.
    await addPromise;

    expect(api.addItem).toHaveBeenCalled();
    expect(markShoppingListItemSynced).not.toHaveBeenCalled();

    mockAddItemDeferred.resolve({});
    await Promise.resolve();
    await Promise.resolve();

    expect(markShoppingListItemSynced).toHaveBeenCalledWith(item.id);
  });
});
