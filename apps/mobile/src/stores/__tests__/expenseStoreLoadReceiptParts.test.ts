/**
 * Long receipt in several photos: `addExpense` stores parts 2..N in
 * `expense_receipt_parts` and sends them in the SAME create as part 1. The API
 * treats a create that carries `receiptImageBase64` without
 * `receiptImageParts` as "the receipt is now this one image" and deletes the
 * stored parts, so parts must never trail part 1 in a later request.
 */
import * as receiptPartsRepository from '../../db/receiptPartsRepository';
import * as expenseRepository from '../../db/expenseRepository';
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
  adoptServerItemId: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../db/receiptPartsRepository', () => ({
  saveReceiptPartsLocally: jest.fn().mockResolvedValue(undefined),
  getReceiptPartsFromDb: jest.fn().mockResolvedValue([]),
  deleteReceiptPartsLocally: jest.fn().mockResolvedValue(undefined),
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
    getReceiptParts: jest.fn(),
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
  resetExpenseSyncThrottle: jest.fn(),
}));

jest.mock('../gamificationStore', () => ({
  useGamificationStore: {
    getState: () => ({ checkAchievements: () => {} }),
  },
}));

const partsRepo = receiptPartsRepository as jest.Mocked<typeof receiptPartsRepository>;
const mockApi = api as jest.Mocked<typeof api>;
const srv = (index: number, b: string) => ({ index, imageBase64: b, mimeType: 'image/jpeg' });

beforeEach(() => {
  jest.clearAllMocks();
  useExpenseStore.getState().reset();
});

describe('loadReceiptParts', () => {
  it('local parts win and trigger no request', async () => {
    partsRepo.getReceiptPartsFromDb.mockResolvedValueOnce([{ imageBase64: 'L2', mimeType: 'image/jpeg' }]);
    const out = await useExpenseStore.getState().loadReceiptParts('e1');
    expect(out).toEqual([srv(2, 'L2')]);
    expect(mockApi.getReceiptParts).not.toHaveBeenCalled();
  });

  it('fetches with from=2, caches a non-empty result locally', async () => {
    mockApi.getReceiptParts.mockResolvedValueOnce([srv(3, 'S3'), srv(2, 'S2')]);
    const out = await useExpenseStore.getState().loadReceiptParts('e2');
    expect(mockApi.getReceiptParts).toHaveBeenCalledWith('e2', { from: 2 });
    expect(out.map((p) => p.index)).toEqual([2, 3]);
    expect(partsRepo.saveReceiptPartsLocally).toHaveBeenCalledWith('e2', [
      { imageBase64: 'S2', mimeType: 'image/jpeg' },
      { imageBase64: 'S3', mimeType: 'image/jpeg' },
    ]);
  });

  it('negative-caches a single-photo receipt until reset()', async () => {
    mockApi.getReceiptParts.mockResolvedValue([]);
    expect(await useExpenseStore.getState().loadReceiptParts('e3')).toEqual([]);
    expect(await useExpenseStore.getState().loadReceiptParts('e3')).toEqual([]);
    expect(mockApi.getReceiptParts).toHaveBeenCalledTimes(1);
    useExpenseStore.getState().reset();
    await useExpenseStore.getState().loadReceiptParts('e3');
    expect(mockApi.getReceiptParts).toHaveBeenCalledTimes(2);
  });

  it('throws on a failed read (never reads as "no parts") and does not negative-cache it', async () => {
    mockApi.getReceiptParts.mockRejectedValueOnce(new Error('500'));
    await expect(useExpenseStore.getState().loadReceiptParts('e4')).rejects.toThrow('500');
    mockApi.getReceiptParts.mockResolvedValueOnce([srv(2, 'S2')]);
    await expect(useExpenseStore.getState().loadReceiptParts('e4')).resolves.toHaveLength(1);
  });
});
