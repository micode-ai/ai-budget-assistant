/**
 * Excludes receivable rows created by a receipt split (ABA receipt-split
 * feature) from any Expense sum/aggregation.
 *
 * Why: splitting a 200 bill among three guests creates the 200 receipt PLUS
 * three 50 debt rows (`isDebt: true, isSplitReceivable: true`). Those debt
 * rows record a receivable — the money already left the account as the 200
 * receipt — so counting both reports 350 of spend/outflow for one dinner
 * instead of 200.
 *
 * Why not filter on `isDebt`: for a standalone cash loan ("I handed Kolya
 * 500") the debt row IS the outflow. Filtering on `isDebt` would silently
 * rewrite the numbers of every user who already tracks debts. Only rows a
 * split created may be excluded, hence the dedicated `isSplitReceivable`
 * marker instead of the broader `isDebt`.
 *
 * Applies to EVERY user-facing total, including cash-flow surfaces (wallet
 * balance, net profit) — not just consumption surfaces (analytics, budgets).
 * Per the design spec's accounting table
 * (docs/superpowers/specs/2026-07-24-receipt-split-guest-link-design.md,
 * "Accounting — the correctness core"): a 200 receipt (counted) + 3×50 debt
 * rows (excluded here) + a 150 repayment income (counted, once it arrives)
 * nets to exactly the author's own 50 — as if the split had never happened.
 *
 * Used by: analytics.service.ts, safe-to-spend.service.ts,
 * budget-alert.service.ts, wallet.service.ts. Spread this into every Prisma
 * `where` clause that sums/aggregates Expense rows for a user-facing total —
 * do not add a second copy of this object literal.
 */
export const EXCLUDE_SPLIT_RECEIVABLE = { isSplitReceivable: false } as const;
