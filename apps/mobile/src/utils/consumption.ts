import type { Expense } from '@budget/shared-types';

/**
 * Drop rows that are bookkeeping of a receivable rather than consumption.
 *
 * Splitting a 200 bill among three guests creates the 200 receipt PLUS three 50
 * debt rows. The money already left as the receipt, so counting both reports 350
 * of spending for one dinner.
 *
 * Filter on `isSplitReceivable` ONLY, never `isDebt`: for a standalone cash loan
 * the debt row IS the outflow, and excluding it would rewrite the numbers of
 * every user who tracks debts. Absent means false — the column is nullable on
 * the client, so most rows arrive without it.
 *
 * Consumption surfaces only. Wallet balances and net worth keep counting these
 * rows, because the money really did leave the account.
 */
export function filterConsumption(expenses: Expense[]): Expense[] {
  return expenses.filter((e) => !e.isSplitReceivable);
}
