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

import { updateExpenseInDb, moveExpenseAccountInDb } from '../expenseRepository';

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
