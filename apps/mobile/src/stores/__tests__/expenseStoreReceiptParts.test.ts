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

const partsRepo = receiptPartsRepository as jest.Mocked<typeof receiptPartsRepository>;
const expenseRepo = expenseRepository as jest.Mocked<typeof expenseRepository>;
const mockApi = api as jest.Mocked<typeof api>;

const base = {
  userId: 'u-1',
  amount: 120,
  currencyCode: 'PLN' as const,
  description: 'Long receipt',
  date: new Date('2026-11-12T12:00:00'),
  source: 'ocr' as const,
  isRecurring: false,
  isDebt: false,
  isDebtRepayment: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  useExpenseStore.setState({ expenses: [], expenseItems: {} });
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('addExpense — receipt parts', () => {
  it('addExpense with parts writes expense_receipt_parts locally and includes receiptImageParts in the create payload', async () => {
    const parts = [
      { imageBase64: 'P2', mimeType: 'image/jpeg' },
      { imageBase64: 'P3', mimeType: 'image/jpeg' },
    ];
    const created = await useExpenseStore.getState().addExpense({
      ...base,
      receiptImageBase64: 'P1',
      receiptImageParts: parts,
    });
    await flush();

    expect(expenseRepo.saveReceiptImageLocally).toHaveBeenCalledWith(created.id, 'P1');
    expect(partsRepo.saveReceiptPartsLocally).toHaveBeenCalledWith(created.id, parts);
    expect(mockApi.createExpense).toHaveBeenCalledTimes(1);
    expect(mockApi.createExpense).toHaveBeenCalledWith(
      expect.objectContaining({ receiptImageBase64: 'P1', receiptImageParts: parts }),
    );
  });

  it('a single image saves no parts and sends none, exactly as before', async () => {
    await useExpenseStore.getState().addExpense({ ...base, receiptImageBase64: 'P1' });
    await flush();

    expect(partsRepo.saveReceiptPartsLocally).not.toHaveBeenCalled();
    const payload = mockApi.createExpense.mock.calls[0][0] as any;
    expect(payload.receiptImageBase64).toBe('P1');
    expect(payload).not.toHaveProperty('receiptImageParts');
  });

  it('parts without part 1 are neither stored nor sent', async () => {
    await useExpenseStore.getState().addExpense({
      ...base,
      receiptImageParts: [{ imageBase64: 'P2', mimeType: 'image/jpeg' }],
    });
    await flush();

    expect(partsRepo.saveReceiptPartsLocally).not.toHaveBeenCalled();
    const payload = mockApi.createExpense.mock.calls[0][0] as any;
    expect(payload).not.toHaveProperty('receiptImageParts');
    expect(payload).not.toHaveProperty('receiptImageBase64');
  });

  it('writes the parts locally BEFORE part 1, so a concurrent retry never reads part 1 without its parts', async () => {
    await useExpenseStore.getState().addExpense({
      ...base,
      receiptImageBase64: 'P1',
      receiptImageParts: [{ imageBase64: 'P2', mimeType: 'image/jpeg' }],
    });
    const partsAt = partsRepo.saveReceiptPartsLocally.mock.invocationCallOrder[0];
    const imageAt = expenseRepo.saveReceiptImageLocally.mock.invocationCallOrder[0];
    expect(partsAt).toBeLessThan(imageAt);
  });
});
