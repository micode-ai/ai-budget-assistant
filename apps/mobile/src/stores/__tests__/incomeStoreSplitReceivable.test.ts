/**
 * Shared-groups phase 2, task H1: `Income.isSplitReceivable` is server-owned,
 * must survive the pull into the store (or every later exclusion reads
 * `undefined` and silently counts it), and must keep a flagged income out of
 * the month's income total — while leaving every existing total unchanged,
 * because nothing sets the flag yet.
 */
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

jest.mock('@/db/incomeRepository', () => ({
  loadAllIncomes: jest.fn().mockResolvedValue([]),
  insertIncome: jest.fn().mockResolvedValue(undefined),
  upsertIncome: jest.fn().mockResolvedValue(undefined),
  updateIncomeInDb: jest.fn().mockResolvedValue(undefined),
  softDeleteIncomeInDb: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/db/tagRepository', () => ({
  insertIncomeTag: jest.fn().mockResolvedValue(undefined),
  getTagsForIncome: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/db/categoryRepository', () => ({
  getCategoryByNameExcludingId: jest.fn().mockResolvedValue(null),
  mergeCategoryInto: jest.fn().mockResolvedValue(undefined),
  getCategoryById: jest.fn().mockResolvedValue(null),
  upsertCategory: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/db/syncMetadataRepository', () => ({
  setLastSyncTime: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/db/client', () => ({
  withTransaction: jest.fn((fn: () => Promise<void>) => fn()),
}));

jest.mock('@/services/api', () => ({
  api: { getIncomes: jest.fn(), createIncome: jest.fn(), updateIncome: jest.fn() },
}));

jest.mock('@/services/encryptionHelper', () => ({
  maybeEncrypt: jest.fn(async (x: unknown) => x),
  // The real helper is (entityType, record, accountId) and returns the record.
  maybeDecrypt: jest.fn(async (_type: string, x: unknown) => x),
}));

jest.mock('@/stores/accountStore', () => ({
  useAccountStore: { getState: jest.fn(() => ({ currentAccountId: 'acc-1' })) },
}));

jest.mock('@/stores/categoryStore', () => ({
  useCategoryStore: { getState: jest.fn(() => ({ loadCategories: jest.fn().mockResolvedValue(undefined) })) },
}));

jest.mock('@/stores/gamificationStore', () => ({
  useGamificationStore: { getState: jest.fn(() => ({})) },
}));

import { useIncomeStore, computeIncomeTotalsByCurrency } from '../incomeStore';
import { api } from '@/services/api';

const getIncomes = api.getIncomes as jest.Mock;

const thisMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 10);
};
const income = (over: Record<string, unknown>): any => ({
  id: 'i', amount: 0, currencyCode: 'PLN', date: thisMonth(), isDeleted: false, ...over,
});

describe('incomeStore — split-receivable incomes (task H1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useIncomeStore.getState().reset();
  });

  it('totals are identical with the flag false or absent', () => {
    const rows = [
      income({ id: 'a', amount: 5000 }),
      income({ id: 'b', amount: 120, isSplitReceivable: false }),
      income({ id: 'c', amount: 30, currencyCode: 'EUR', isSplitReceivable: undefined }),
    ];
    expect(computeIncomeTotalsByCurrency(rows)).toEqual({ PLN: 5120, EUR: 30 });
  });

  it('keeps a flagged income out of the month total, but not a debt income', () => {
    const rows = [
      income({ id: 'a', amount: 5000 }),
      income({ id: 'settle', amount: 150, isSplitReceivable: true }),
      income({ id: 'loan', amount: 400, isDebt: true }),
    ];
    expect(computeIncomeTotalsByCurrency(rows)).toEqual({ PLN: 5400 });
  });

  it('carries the server flag through the pull, defaulting to false', async () => {
    const now = new Date().toISOString();
    const server = (id: string, extra: Record<string, unknown> = {}) => ({
      id: `srv-${id}`, clientId: id, userId: 'u1', accountId: 'acc-1', amount: '10', currencyCode: 'PLN',
      date: now, source: 'manual', isDebt: false, isDebtRepayment: false, isDeleted: false,
      createdAt: now, updatedAt: now, syncVersion: 1, ...extra,
    });
    getIncomes.mockResolvedValue({ data: [server('flagged', { isSplitReceivable: true }), server('plain')] });

    await useIncomeStore.getState().loadIncomes({ force: true });

    const byId = new Map(useIncomeStore.getState().incomes.map((i) => [i.id, i]));
    expect(byId.get('flagged')?.isSplitReceivable).toBe(true);
    expect(byId.get('plain')?.isSplitReceivable).toBe(false);
  });
});
