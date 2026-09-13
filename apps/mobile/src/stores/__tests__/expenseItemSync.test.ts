/**
 * Line items must reach `syncStatus: 'synced'` under their REAL server ids, or
 * splitting a receipt by item is unreachable.
 *
 * `deriveSplitMode` offers item-level assignment only when every line is
 * synced, because the server validates `itemIds` against its own
 * `expense_item` rows and rejects a client-generated id. A scanned receipt
 * writes its lines locally as `pending`, and before this suite both paths that
 * could have adopted the server's rows were gated on the local table being
 * EMPTY (`if (items.length === 0)`) — which it never is after a scan. The lines
 * stayed pending forever and the split screen silently fell back to an equal
 * split, on every receipt, on the device that scanned it.
 */
import * as expenseItemRepository from '../../db/expenseItemRepository';
import { api } from '../../services/api';
import { useExpenseStore } from '../expenseStore';

jest.mock('../../db/tripExpenseShareRepository', () => ({
  insertShare: jest.fn().mockResolvedValue(undefined),
  bulkInsertShares: jest.fn().mockResolvedValue(undefined),
  getSharesForExpense: jest.fn().mockResolvedValue([]),
  deleteAllSharesForExpense: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../db/expenseRepository', () => ({
  insertExpense: jest.fn().mockResolvedValue(undefined),
  updateExpenseInDb: jest.fn().mockResolvedValue(undefined),
  softDeleteExpenseInDb: jest.fn().mockResolvedValue(undefined),
  saveReceiptImageLocally: jest.fn().mockResolvedValue(undefined),
  getReceiptImageFromDb: jest.fn().mockResolvedValue(null),
  deleteReceiptImageLocally: jest.fn().mockResolvedValue(undefined),
  bulkRenameMerchant: jest.fn().mockResolvedValue(undefined),
  bulkMergeMerchants: jest.fn().mockResolvedValue(undefined),
  setExpenseServerId: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../db/expenseItemRepository', () => ({
  loadItemsByExpenseId: jest.fn().mockResolvedValue([]),
  insertExpenseItems: jest.fn().mockResolvedValue(undefined),
  insertExpenseItem: jest.fn().mockResolvedValue(undefined),
  upsertExpenseItem: jest.fn().mockResolvedValue(undefined),
  updateExpenseItemInDb: jest.fn().mockResolvedValue(undefined),
  softDeleteExpenseItemInDb: jest.fn().mockResolvedValue(undefined),
  deduplicateItemsByExpenseId: jest.fn().mockResolvedValue(undefined),
  replaceItemsForExpense: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../db/tagRepository', () => ({
  insertExpenseTag: jest.fn().mockResolvedValue(undefined),
  getTagsForExpense: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../db/projectRepository', () => ({
  addExpenseToProject: jest.fn().mockResolvedValue(undefined),
  removeExpenseFromProject: jest.fn().mockResolvedValue(undefined),
  getProjectIdForExpense: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../services/api', () => ({
  api: {
    createExpense: jest.fn().mockResolvedValue({}),
    updateExpense: jest.fn().mockResolvedValue({}),
    deleteExpense: jest.fn().mockResolvedValue({}),
    bulkUpdateExpenses: jest.fn().mockResolvedValue({}),
    getExpenseItems: jest.fn().mockResolvedValue([]),
    createExpenseItem: jest.fn().mockResolvedValue({}),
    updateExpenseItem: jest.fn().mockResolvedValue({}),
    deleteExpenseItem: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('../../services/encryptionHelper', () => ({
  maybeEncrypt: jest.fn((_t: string, data: Record<string, unknown>) => Promise.resolve({ payload: data })),
}));

jest.mock('../accountStore', () => ({
  useAccountStore: { getState: () => ({ currentAccountId: 'acc-1', canEdit: () => true }) },
}));

jest.mock('../../i18n', () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));

jest.mock('../../services/widgetData', () => ({
  refreshWidgetData: jest.fn(),
}));

jest.mock('../../utils/merchant', () => ({
  getDistinctMerchants: jest.fn(() => []),
  getMerchantCounts: jest.fn(() => []),
}));

jest.mock('../categoryStore', () => ({
  useCategoryStore: {
    getState: () => ({ getCategoryById: () => undefined }),
  },
}));

jest.mock('../expenseSync', () => ({
  pullAndMergeExpenses: jest.fn().mockResolvedValue(undefined),
  syncPendingExpenses: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../gamificationStore', () => ({
  useGamificationStore: {
    getState: () => ({ checkAchievements: () => {} }),
  },
}));

const repo = expenseItemRepository as jest.Mocked<typeof expenseItemRepository>;
const mockApi = api as jest.Mocked<typeof api>;

const localItem = (over: Partial<any> = {}) => ({
  id: 'local-1',
  localId: 'local-1',
  expenseId: 'exp-1',
  description: 'Wino',
  quantity: 1,
  unitPrice: 60,
  totalPrice: 60,
  sortOrder: 0,
  isDeleted: false,
  syncStatus: 'pending',
  syncVersion: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

const serverItem = (over: Partial<any> = {}) => ({
  id: 'srv-1',
  description: 'Wino',
  quantity: 1,
  unitPrice: 60,
  totalPrice: 60,
  sortOrder: 0,
  isDeleted: false,
  syncVersion: 1,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  useExpenseStore.setState({ expenses: [], expenseItems: {} });
});

afterEach(() => {
  // expenseStore debounces a `require('@/services/widgetData')` behind a
  // setTimeout on every `expenses` change. Left pending, it fires after this
  // file's Jest environment is torn down and takes an unrelated suite down
  // with it, so drain it here (same reason the sibling expenseStore suite
  // does).
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('loadExpenseItems — adopting the server’s ids', () => {
  it('refetches from the server when a local line is still pending', async () => {
    repo.loadItemsByExpenseId.mockResolvedValueOnce([localItem()] as any);
    mockApi.getExpenseItems.mockResolvedValueOnce([serverItem()] as any);

    const items = await useExpenseStore.getState().loadExpenseItems('exp-1');

    expect(mockApi.getExpenseItems).toHaveBeenCalledWith('exp-1');
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('srv-1');
    expect(items[0].syncStatus).toBe('synced');
  });

  it('REPLACES the local rows rather than adding the server ones beside them', async () => {
    // deduplicateItemsByExpenseId keeps the row created FIRST — the local
    // pending one — so merging alongside would keep the unusable id and leave
    // the receipt permanently unsplittable.
    repo.loadItemsByExpenseId.mockResolvedValueOnce([localItem()] as any);
    mockApi.getExpenseItems.mockResolvedValueOnce([serverItem()] as any);

    await useExpenseStore.getState().loadExpenseItems('exp-1');

    expect(repo.replaceItemsForExpense).toHaveBeenCalledTimes(1);
    const [expenseId, written] = repo.replaceItemsForExpense.mock.calls[0];
    expect(expenseId).toBe('exp-1');
    expect(written.map((i: any) => i.id)).toEqual(['srv-1']);
  });

  it('does not call the server when every line is already synced', async () => {
    repo.loadItemsByExpenseId.mockResolvedValueOnce([
      localItem({ id: 'srv-1', syncStatus: 'synced' }),
    ] as any);

    const items = await useExpenseStore.getState().loadExpenseItems('exp-1');

    expect(mockApi.getExpenseItems).not.toHaveBeenCalled();
    expect(items[0].id).toBe('srv-1');
  });

  it('keeps the pending lines when the server cannot be reached', async () => {
    // Offline, or the fire-and-forget create has not landed yet. Showing the
    // lines the user just scanned beats showing nothing; they simply stay
    // unsplittable until a later load succeeds.
    repo.loadItemsByExpenseId.mockResolvedValueOnce([localItem()] as any);
    mockApi.getExpenseItems.mockRejectedValueOnce(new Error('offline'));

    const items = await useExpenseStore.getState().loadExpenseItems('exp-1');

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('local-1');
    expect(repo.replaceItemsForExpense).not.toHaveBeenCalled();
  });

  it('keeps the pending lines when the server answers with none', async () => {
    // An empty answer here means "not created yet", never "the user deleted
    // them" — wiping the scan on that basis would lose real work.
    repo.loadItemsByExpenseId.mockResolvedValueOnce([localItem()] as any);
    mockApi.getExpenseItems.mockResolvedValueOnce([] as any);

    const items = await useExpenseStore.getState().loadExpenseItems('exp-1');

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('local-1');
    expect(repo.replaceItemsForExpense).not.toHaveBeenCalled();
  });
});

describe('editing a line reaches the server', () => {
  it('pushes an edit, so the next load cannot revert it', async () => {
    // Without this the edit lived only on this device, and adopting server
    // state on the next load would visibly undo it.
    useExpenseStore.setState({
      expenseItems: { 'exp-1': [localItem({ id: 'srv-1', syncStatus: 'synced' })] as any },
    });

    useExpenseStore.getState().updateExpenseItem('exp-1', 'srv-1', { totalPrice: 55 });
    await Promise.resolve();

    expect(mockApi.updateExpenseItem).toHaveBeenCalledWith(
      'exp-1',
      'srv-1',
      expect.objectContaining({ totalPrice: 55 }),
    );
  });

  it('pushes a newly added line and adopts the id the server gives it', async () => {
    mockApi.createExpenseItem.mockResolvedValueOnce(serverItem({ id: 'srv-new' }) as any);

    useExpenseStore.getState().addExpenseItem('exp-1', {
      description: 'Chleb',
      quantity: 1,
      unitPrice: 5,
      totalPrice: 5,
      sortOrder: 1,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(mockApi.createExpenseItem).toHaveBeenCalled();
  });
});

describe('creating an expense adopts the ids its lines were given', () => {
  it('replaces the just-written pending lines with the ones the server created', async () => {
    // Without this the receipt is only splittable after some later load
    // happens to refetch it. Adopting here makes a freshly scanned receipt
    // splittable straight away.
    (api.createExpense as jest.Mock).mockResolvedValueOnce({
      id: 'srv-exp-1',
      items: [serverItem({ id: 'srv-1' }), serverItem({ id: 'srv-2', description: 'Chleb', sortOrder: 1 })],
    });

    await useExpenseStore.getState().addExpense({
      amount: 65,
      currencyCode: 'PLN',
      description: 'Biedronka',
      date: new Date(),
      categoryId: 'cat-1',
      accountId: 'acc-1',
      source: 'ocr',
      items: [
        { description: 'Wino', quantity: 1, unitPrice: 60, totalPrice: 60, sortOrder: 0 },
        { description: 'Chleb', quantity: 1, unitPrice: 5, totalPrice: 5, sortOrder: 1 },
      ],
    } as any);

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(repo.replaceItemsForExpense).toHaveBeenCalled();
    const written = repo.replaceItemsForExpense.mock.calls.at(-1)![1];
    expect(written.map((i: any) => i.id)).toEqual(['srv-1', 'srv-2']);
    expect(written.every((i: any) => i.syncStatus === 'synced')).toBe(true);
  });

  it('leaves the local lines alone when the response carries none', async () => {
    (api.createExpense as jest.Mock).mockResolvedValueOnce({ id: 'srv-exp-1' });

    await useExpenseStore.getState().addExpense({
      amount: 60,
      currencyCode: 'PLN',
      description: 'Biedronka',
      date: new Date(),
      categoryId: 'cat-1',
      accountId: 'acc-1',
      source: 'ocr',
      items: [{ description: 'Wino', quantity: 1, unitPrice: 60, totalPrice: 60, sortOrder: 0 }],
    } as any);

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(repo.replaceItemsForExpense).not.toHaveBeenCalled();
  });
});
