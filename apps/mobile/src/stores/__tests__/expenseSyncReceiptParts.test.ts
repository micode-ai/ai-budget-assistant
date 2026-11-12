/**
 * Long receipt in several photos — the offline retry. A receipt saved while
 * offline never reached the server, so `syncPendingExpenses` resends its image,
 * and when it does, parts 2..N go in the SAME create: the API reads an image
 * without parts as a one-image receipt and deletes any stored parts. A row the
 * server already acknowledged (`serverId` set) is an edit retry and carries no
 * images at all, as before.
 */
import { syncPendingExpenses } from '../expenseSync';
import { api } from '../../services/api';
import * as expenseRepository from '../../db/expenseRepository';
import * as receiptPartsRepository from '../../db/receiptPartsRepository';

jest.mock('../../db/client', () => ({
  withTransaction: jest.fn((fn: () => Promise<void>) => fn()),
}));

jest.mock('../../db/syncMetadataRepository', () => ({
  setLastSyncTime: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../db/expenseRepository', () => ({
  loadAllExpenses: jest.fn().mockResolvedValue([]),
  upsertExpense: jest.fn().mockResolvedValue(undefined),
  softDeleteExpenseInDb: jest.fn().mockResolvedValue(undefined),
  updateExpenseInDb: jest.fn().mockResolvedValue(undefined),
  setExpenseServerId: jest.fn().mockResolvedValue(undefined),
  getReceiptImageFromDb: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../db/receiptPartsRepository', () => ({
  getReceiptPartsFromDb: jest.fn().mockResolvedValue([]),
  readReceiptPartsStrict: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../db/expenseItemRepository', () => ({
  loadItemsByExpenseId: jest.fn().mockResolvedValue([]),
  upsertExpenseItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../db/tagRepository', () => ({
  insertExpenseTag: jest.fn().mockResolvedValue(undefined),
  getTagsForExpense: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../db/projectRepository', () => ({
  addExpenseToProject: jest.fn().mockResolvedValue(undefined),
  getProjectIdForExpense: jest.fn().mockResolvedValue(null),
  getAllProjectExpenseMappings: jest.fn().mockResolvedValue([]),
  upsertProject: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../features/receipt/serverSplits', () => ({
  mapServerSplits: jest.fn(),
}));

jest.mock('../../db/splitRepository', () => ({
  getSplitsForExpenses: jest.fn().mockResolvedValue([]),
  replaceSplitsForExpense: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../db/categoryRepository', () => ({
  upsertCategory: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/api', () => ({
  api: {
    createExpense: jest.fn().mockResolvedValue({ id: 'srv-1' }),
    getExpenses: jest.fn().mockResolvedValue({ data: [] }),
  },
}));

jest.mock('../../services/encryptionHelper', () => ({
  maybeEncrypt: jest.fn((_entityType: string, data: Record<string, unknown>) =>
    Promise.resolve({ payload: data, encryptedPayload: undefined, encryptionKeyVersion: undefined }),
  ),
  maybeDecrypt: jest.fn(),
}));

jest.mock('../../utils/location', () => ({
  parseServerLocation: jest.fn(),
}));

jest.mock('../accountStore', () => ({
  useAccountStore: { getState: () => ({ currentAccountId: 'acc-1' }) },
}));

jest.mock('../categoryStore', () => ({
  useCategoryStore: { getState: () => ({}) },
}));

jest.mock('../projectStore', () => ({
  useProjectStore: { getState: () => ({}) },
}));

const mockApi = api as jest.Mocked<typeof api>;

function makePendingExpense(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'exp-1',
    localId: 'exp-1',
    accountId: 'acc-1',
    amount: 42,
    currencyCode: 'PLN',
    description: 'Netflix',
    date: new Date('2026-01-01T00:00:00.000Z'),
    source: 'manual',
    syncStatus: 'pending',
    isDeleted: false,
    ...over,
  };
}

const noopSet = jest.fn();
const expenseRepo = expenseRepository as jest.Mocked<typeof expenseRepository>;
const partsRepo = receiptPartsRepository as jest.Mocked<typeof receiptPartsRepository>;

beforeEach(() => {
  jest.clearAllMocks();
});

const run = (expense: Record<string, unknown>) =>
  syncPendingExpenses(noopSet as any, (() => ({ expenses: [expense] })) as any);

describe('syncPendingExpenses — receipt image and parts', () => {
  it('a never-acknowledged row resends part 1 together with all parts', async () => {
    expenseRepo.getReceiptImageFromDb.mockResolvedValueOnce({ base64: 'P1', mimeType: 'image/jpeg' });
    partsRepo.readReceiptPartsStrict.mockResolvedValueOnce([
      { imageBase64: 'P2', mimeType: 'image/jpeg' },
      { imageBase64: 'P3', mimeType: 'image/jpeg' },
    ]);
    await run(makePendingExpense());
    expect(mockApi.createExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptImageBase64: 'P1',
        receiptImageParts: [
          { imageBase64: 'P2', mimeType: 'image/jpeg' },
          { imageBase64: 'P3', mimeType: 'image/jpeg' },
        ],
      }),
    );
  });

  it('never sends parts when part 1 is missing locally', async () => {
    partsRepo.readReceiptPartsStrict.mockResolvedValueOnce([{ imageBase64: 'P2', mimeType: 'image/jpeg' }]);
    await run(makePendingExpense());
    const payload = mockApi.createExpense.mock.calls[0][0] as any;
    expect(payload).not.toHaveProperty('receiptImageParts');
    expect(payload).not.toHaveProperty('receiptImageBase64');
  });

  it('an acknowledged row (edit retry) carries no images, so stored parts are left alone', async () => {
    await run(makePendingExpense({ serverId: 'srv-9' }));
    expect(expenseRepo.getReceiptImageFromDb).not.toHaveBeenCalled();
    const payload = mockApi.createExpense.mock.calls[0][0] as any;
    expect(payload).not.toHaveProperty('receiptImageBase64');
    expect(payload).not.toHaveProperty('receiptImageParts');
  });

  it('a stored PDF is not resent through the create image field', async () => {
    expenseRepo.getReceiptImageFromDb.mockResolvedValueOnce({ base64: 'PDF', mimeType: 'application/pdf' });
    await run(makePendingExpense());
    const payload = mockApi.createExpense.mock.calls[0][0] as any;
    expect(payload).not.toHaveProperty('receiptImageBase64');
  });

  it('carries the stored mime type of part 1', async () => {
    expenseRepo.getReceiptImageFromDb.mockResolvedValueOnce({ base64: 'P1', mimeType: 'image/png' });
    await run(makePendingExpense());
    expect(mockApi.createExpense).toHaveBeenCalledWith(
      expect.objectContaining({ receiptImageBase64: 'P1', receiptMimeType: 'image/png' }),
    );
  });

  it('a failed parts read sends NO image (part 1 alone would wipe the parts on the server), and the row still syncs', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expenseRepo.getReceiptImageFromDb.mockResolvedValueOnce({ base64: 'P1', mimeType: 'image/jpeg' });
    partsRepo.readReceiptPartsStrict.mockRejectedValueOnce(new Error('disk I/O error'));
    await run(makePendingExpense());
    expect(mockApi.createExpense).toHaveBeenCalledTimes(1);
    const payload = mockApi.createExpense.mock.calls[0][0] as any;
    expect(payload).not.toHaveProperty('receiptImageBase64');
    expect(payload).not.toHaveProperty('receiptImageParts');
    expect(payload).not.toHaveProperty('receiptMimeType');
    warn.mockRestore();
  });
});
