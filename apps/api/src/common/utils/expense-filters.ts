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

/**
 * Matches an Expense that belongs to any of `categoryIds` — by its own
 * category, or by holding a live split into one of them.
 *
 * Filtering on `categoryId` alone is the defect this replaces: an expense
 * whose own category sits outside a budget can still carry a split into it,
 * and one whose own category sits inside can hold most of its money
 * elsewhere. Wrong in both directions. See
 * docs/superpowers/specs/2026-09-10-budget-split-attribution-design.md.
 *
 * This narrows the rows fetched; it does not decide how much of each row
 * counts. That is `attributeToCategories`, applied in JS afterwards — the
 * predicate and the arithmetic are deliberately separate, because SQL cannot
 * express the "splits win when present" rule without a second copy of it.
 *
 * Spread into a Prisma `where` alongside the other filters. Do not add a
 * second copy of this object literal.
 */
export function categoryOrSplitFilter(categoryIds: readonly string[]) {
  const ids = [...categoryIds];
  return {
    OR: [
      { categoryId: { in: ids } },
      { categorySplits: { some: { isDeleted: false, categoryId: { in: ids } } } },
    ],
  };
}
