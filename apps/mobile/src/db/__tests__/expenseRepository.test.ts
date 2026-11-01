/**
 * `./client` resolves to `client.native.ts`, which opens a real expo-sqlite
 * database as a module-load side effect — that crashes under Jest, so the
 * mock boundary is `../client` (mirrors `expenseItemRepository.test.ts`).
 *
 * ABA-615: editing an expense can now start a recurring series (previously
 * only possible on the create form). `updateExpenseInDb` already had
 * `is_recurring`/`recurring_id`/`recurring_period` column mapping from the
 * original create-time recurring feature — this pins it against a
 * regression now that the edit path depends on it too.
 */
const mockExecuteSql = jest.fn().mockResolvedValue([]);

jest.mock('../client', () => ({
  executeSql: (...args: unknown[]) => mockExecuteSql(...args),
}));

import { updateExpenseInDb, moveExpenseAccountInDb, loadAllExpenses, upsertExpense } from '../expenseRepository';
import type { Expense } from '@budget/shared-types';

beforeEach(() => {
  mockExecuteSql.mockClear();
});

describe('updateExpenseInDb — recurring columns', () => {
  it('writes is_recurring/recurring_id/recurring_period when starting a series on an edit', async () => {
    await updateExpenseInDb(
      'exp-1',
      { isRecurring: true, recurringId: 'r-uuid-1', recurringPeriod: 'monthly' },
      new Date('2026-01-15T00:00:00.000Z'),
      'pending',
    );

    expect(mockExecuteSql).toHaveBeenCalledTimes(1);
    const [sql, params] = mockExecuteSql.mock.calls[0];
    expect(sql).toContain('is_recurring = ?');
    expect(sql).toContain('recurring_id = ?');
    expect(sql).toContain('recurring_period = ?');
    // 1 for true, then the two string fields, in the order the SQL lists them.
    expect(params.slice(0, 3)).toEqual([1, 'r-uuid-1', 'monthly']);
  });

  it('leaves the recurring columns untouched when the update does not mention them', async () => {
    await updateExpenseInDb('exp-1', { description: 'Rent' }, new Date(), 'pending');

    const [sql] = mockExecuteSql.mock.calls[0];
    expect(sql).not.toContain('is_recurring');
    expect(sql).not.toContain('recurring_id');
    expect(sql).not.toContain('recurring_period');
  });

  it('clears recurringId/recurringPeriod to null on an explicit null (stop-recurring path)', async () => {
    await updateExpenseInDb(
      'exp-1',
      { isRecurring: false },
      new Date(),
      'synced',
    );

    const [sql, params] = mockExecuteSql.mock.calls[0];
    expect(sql).toContain('is_recurring = ?');
    expect(params[0]).toBe(0);
  });
});

describe('moveExpenseAccountInDb', () => {
  it('re-homes the expense and clears its line items category ids', async () => {
    await moveExpenseAccountInDb('exp-1', 'acc-2');
    const calls = mockExecuteSql.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toContain('UPDATE expenses SET account_id = ?, category_id = NULL');
    expect(calls[0][1][0]).toBe('acc-2');
    expect(calls[0][1][3]).toBe('exp-1');
    expect(calls[1][0]).toBe('UPDATE expense_items SET category_id = NULL WHERE expense_id = ?');
    expect(calls[1][1]).toEqual(['exp-1']);
  });
});

describe('createdByApp — "Added via <app>" (public API)', () => {
  const baseRow = {
    id: 'exp-1', local_id: 'exp-1', server_id: 'srv-1', user_id: 'u-1', account_id: 'acc-1',
    amount: 12.5, discount_amount: null, deposit_amount: null, currency_code: 'PLN',
    description: null, notes: null, merchant: null, category_id: null, date: 0, time: null,
    location_lat: null, location_lng: null, location_name: null, receipt_url: null,
    is_recurring: 0, recurring_id: null, recurring_period: null, source: 'manual', external_ref: null,
    is_debt: 0, is_debt_repayment: 0, is_planned: 0, is_split_receivable: 0,
    debt_contact_name: null, debt_due_date: null, related_debt_income_id: null,
    created_by_user_name: 'Alice', paid_by_user_id: null,
    created_at: 0, updated_at: 0, is_deleted: 0, sync_status: 'synced', sync_version: 1,
  };

  it('maps the two columns to createdByApp', async () => {
    mockExecuteSql.mockResolvedValueOnce([
      { ...baseRow, created_by_app_id: 'aba_ci_x', created_by_app_name: 'AI Accounting' },
    ]);
    const [e] = await loadAllExpenses('acc-1');
    expect(e.createdByApp).toEqual({ id: 'aba_ci_x', name: 'AI Accounting' });
  });

  it('maps absent columns to null', async () => {
    mockExecuteSql.mockResolvedValueOnce([{ ...baseRow, created_by_app_id: null, created_by_app_name: null }]);
    const [e] = await loadAllExpenses('acc-1');
    expect(e.createdByApp).toBeNull();
  });

  it('upsert writes the app columns and keeps a stored value when the incoming one is null', async () => {
    const expense = {
      id: 'exp-1', localId: 'exp-1', userId: 'u-1', accountId: 'acc-1', amount: 1, currencyCode: 'PLN',
      date: new Date(0), source: 'manual', isRecurring: false, isDebt: false, isDebtRepayment: false,
      createdAt: new Date(0), updatedAt: new Date(0), isDeleted: false, syncStatus: 'synced', syncVersion: 1,
      createdByApp: { id: 'aba_ci_x', name: 'AI Accounting' },
    } as unknown as Expense;
    await upsertExpense(expense);
    const [sql, params] = mockExecuteSql.mock.calls[0];
    const placeholders = (sql.match(/VALUES \(([^)]*)\)/)![1].match(/\?/g) || []).length;
    expect(placeholders).toBe(params.length);
    expect(params.slice(-2)).toEqual(['aba_ci_x', 'AI Accounting']);
    expect(sql).toContain('created_by_app_id = COALESCE(excluded.created_by_app_id, created_by_app_id)');
    expect(sql).toContain('created_by_app_name = COALESCE(excluded.created_by_app_name, created_by_app_name)');
  });
});
