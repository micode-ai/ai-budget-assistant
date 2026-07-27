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
 * Applies to EVERY user-facing total, including cash-flow surfaces (wallet
 * balance, net worth) — not just consumption surfaces (analytics, budgets,
 * home totals). Per the design spec's accounting table
 * (docs/superpowers/specs/2026-07-24-receipt-split-guest-link-design.md,
 * "Accounting — the correctness core"): you paid the 200 receipt in cash, so
 * the wallet drops by 200; the three 50 debt rows are a receivable — an asset
 * the guests owe you, not cash that left the account — and only the eventual
 * repayment income (150, once confirmed) lands as a real cash-flow event.
 * Counting the debt rows too would drop the wallet by 350 for a 200 outflow.
 * Worked example: `−200 + 150 = −50`, exactly the author's own share. The
 * server agrees — `apps/api/src/modules/wallet/wallet.service.ts` spreads the
 * equivalent `EXCLUDE_SPLIT_RECEIVABLE` into its own balance/net-worth queries.
 */
export function filterConsumption(expenses: Expense[]): Expense[] {
  return expenses.filter((e) => !e.isSplitReceivable);
}
