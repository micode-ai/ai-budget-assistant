/**
 * `getExpenseTotalsByCurrency`'s split-receivable exclusion lives entirely in
 * the SQL text — there's no JS-side filter to unit test — so this captures
 * the actual SQL string handed to the driver (overriding the `expo-sqlite`
 * stub from jest.setup.js for this file only) and asserts on what the real
 * function actually produced. Deleting the `is_split_receivable` guard from
 * the production query makes the second assertion below fail.
 */
let capturedSql: string | undefined;
let capturedParams: unknown[] = [];

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    execSync: () => undefined,
    getAllSync: (sql: string, ...params: unknown[]) => {
      capturedSql = sql;
      capturedParams = params;
      return [];
    },
    withTransactionAsync: async (task: () => Promise<void>) => {
      await task();
    },
  }),
}));

import { getExpenseTotalsByCurrency } from '../walletRepository';

describe('getExpenseTotalsByCurrency', () => {
  beforeEach(() => {
    capturedSql = undefined;
    capturedParams = [];
  });

  it('excludes split-receivable rows from the SUM — absent must mean false, same as the client-side rule', async () => {
    await getExpenseTotalsByCurrency('account-1');

    expect(capturedSql).toBeDefined();
    expect(capturedParams).toEqual(['account-1']);
    // Baseline: still scoped to the account and excludes soft-deleted rows.
    expect(capturedSql).toMatch(/account_id\s*=\s*\?/);
    expect(capturedSql).toMatch(/is_deleted\s*=\s*0/);
    // The load-bearing guard: a receipt split's per-participant debt rows
    // must never contribute to this SUM (see src/utils/consumption.ts) — the
    // money already left the account as the original receipt expense.
    // `IS NULL OR = 0` mirrors `!e.isSplitReceivable` treating an absent
    // (nullable, pre-existing-row) column as false.
    expect(capturedSql).toMatch(
      /is_split_receivable\s+IS\s+NULL\s+OR\s+is_split_receivable\s*=\s*0/i,
    );
  });
});
