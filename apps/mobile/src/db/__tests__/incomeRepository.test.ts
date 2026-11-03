/**
 * `./client` resolves to `client.native.ts`, which opens a real expo-sqlite database as a
 * module-load side effect, so the mock boundary is `../client` (same as expenseRepository.test.ts).
 */
const mockExecuteSql = jest.fn().mockResolvedValue([]);

jest.mock('../client', () => ({
  executeSql: (...args: unknown[]) => mockExecuteSql(...args),
}));

import { loadAllIncomes, upsertIncome, insertIncome } from '../incomeRepository';
import type { Income } from '@budget/shared-types';

beforeEach(() => {
  mockExecuteSql.mockClear();
});

describe('createdByApp — "Added via <app>" (public API)', () => {
  const baseRow = {
    id: 'inc-1',
    local_id: 'inc-1',
    server_id: 'srv-1',
    user_id: 'u-1',
    account_id: 'acc-1',
    amount: 100,
    currency_code: 'PLN',
    description: null,
    notes: null,
    category_id: null,
    date: 0,
    source: 'api',
    is_debt: 0,
    is_debt_repayment: 0,
    debt_contact_name: null,
    debt_due_date: null,
    related_debt_expense_id: null,
    created_by_user_name: 'Alice',
    created_at: 0,
    updated_at: 0,
    is_deleted: 0,
    sync_status: 'synced',
    sync_version: 1,
    is_split_receivable: 0,
  };

  const income = {
    id: 'inc-1',
    localId: 'inc-1',
    userId: 'u-1',
    accountId: 'acc-1',
    amount: 1,
    currencyCode: 'PLN',
    date: new Date(0),
    source: 'api',
    isDebt: false,
    isDebtRepayment: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    isDeleted: false,
    syncStatus: 'synced',
    syncVersion: 1,
    createdByApp: { id: 'aba_ci_x', name: 'AI Accounting' },
  } as unknown as Income;

  it('maps the two columns to createdByApp', async () => {
    mockExecuteSql.mockResolvedValueOnce([
      { ...baseRow, created_by_app_id: 'aba_ci_x', created_by_app_name: 'AI Accounting' },
    ]);
    const [i] = await loadAllIncomes('acc-1');
    expect(i.createdByApp).toEqual({ id: 'aba_ci_x', name: 'AI Accounting' });
  });

  it('maps absent columns to null', async () => {
    mockExecuteSql.mockResolvedValueOnce([
      { ...baseRow, created_by_app_id: null, created_by_app_name: null },
    ]);
    const [i] = await loadAllIncomes('acc-1');
    expect(i.createdByApp).toBeNull();
  });

  it('insert and upsert write the app columns (placeholders match params); upsert keeps a stored value on null', async () => {
    await insertIncome(income);
    await upsertIncome(income);
    for (const [sql, params] of mockExecuteSql.mock.calls) {
      const placeholders = (sql.match(/VALUES \(([^)]*)\)/)![1].match(/\?/g) || []).length;
      expect(placeholders).toBe(params.length);
      expect(params.slice(-2)).toEqual(['aba_ci_x', 'AI Accounting']);
    }
    const upsertSql = mockExecuteSql.mock.calls[1][0];
    expect(upsertSql).toContain(
      'created_by_app_id = COALESCE(excluded.created_by_app_id, created_by_app_id)'
    );
    expect(upsertSql).toContain(
      'created_by_app_name = COALESCE(excluded.created_by_app_name, created_by_app_name)'
    );
  });
});
