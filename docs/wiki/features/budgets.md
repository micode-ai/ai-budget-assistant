# Budgets

*Hub: [api](../api.md) · [mobile-app](../mobile-app.md) · related:
[receipt-category-split](receipt-category-split.md)*

## What this is

Spending limits per period, optionally allocated across categories: how a period is computed, how a
financial month shifts it, how progress and the end-of-period projection are derived, the threshold
pushes, and history.

## Entry points

- `apps/api/src/modules/budgets/` — `budgets.service.ts` (`getProgress`, `getHistory`,
  `getAccountAnchorDay`), `budget-alert.service.ts` (daily threshold cron), `budget-period.util.ts`
- `apps/api/src/common/utils/financial-month.ts` · mirror
  `packages/shared-utils/src/formatting/financial-month.ts`
- `apps/api/src/common/utils/budget-projection.ts` · mirror
  `packages/shared-utils/src/formatting/budget-projection.ts`
- `apps/api/src/common/utils/category-attribution.ts` · mirror
  `packages/shared-utils/src/formatting/category-attribution.ts`
- Mobile store: `apps/mobile/src/stores/budgetStore.ts` composing `budgetCrudActions.ts`,
  `budgetSync.ts`, `budgetProgress.ts`
- `apps/mobile/src/features/budgets/budgetAttribution.ts`, `periodNav.ts`
- `apps/mobile/src/hooks/useFinancialMonth.ts`,
  `apps/mobile/src/components/account/FinancialMonthSheet.tsx`

## Key concepts

**A budget has no `categoryId`.** Category filtering is done only through `BudgetCategory`
allocations (`budget_categories`). An overall budget has zero rows; a single-category budget has one
row with `amount = budget.amount`; a multi-category budget has several. The legacy column was
dropped (migration `20260523000000_drop_budget_category_id`); existing devices still carry a dead
`category_id` SQLite column that is never read or written.

**Periods come from one function.** `computeBudgetPeriod(budget, now?)` (Monday-based weeks) in
`budget-period.util.ts` is imported by both the service and the alert cron; `shared-utils` exports
the same function for the mobile bundle. Do not add another copy.

**The financial month is a re-bucketing lens (ABA-383).** `Account.monthAnchorDay Int?` (1..31,
`null` = calendar month; migration `20260801120000_add_account_month_anchor`) shifts what "this
month" means — salary on the 10th means periods run 10th–9th. No expense or income is touched, only
which period a computation assigns it to, so it applies **retroactively**. An anchor above a month's
length clamps to that month's last day. Owner-only via `PATCH /accounts/:id`; the DTO uses
`ValidateIf(v !== null)` so an explicit reset still validates. Three read paths converge on the same
math: `AccountContextGuard` sets `req.monthAnchorDay` for the controller, the alert cron reads
`budget.account.monthAnchorDay` off the relation it already includes, and
`getAccountAnchorDay(accountId)` serves callers with no request (the AI `get_budget_status` tool).
Mobile reads it only through `useFinancialMonth`, whose day-bucketed memo recomputes after midnight;
period navigation steps whole anchored periods.

**Progress is split-aware (ABA-529).** When an expense has category splits, the splits decide and
its own `categoryId` is ignored; without splits its own category takes the whole amount. The rule
lives in `attributeToCategories`, which the server and the mobile client (which computes progress
locally) must both reach the same number through. See
[receipt-category-split](receipt-category-split.md).

**The projection is `spent + rate × daysRemaining` (ABA-523).** The rate is the mean of **daily
totals excluding the single largest day**, with that day's money still counted in `spent`. The
previous formula, mean daily spend extrapolated, treated every payment as a habit: one rent payment
of 4 374 against an 8 000 budget produced a projected overage of 11 674 where the realistic figure
was 1 913. A median was rejected on purpose — it collapses to zero once spending happens on fewer
than half the elapsed days, silently withdrawing the warning from someone who spends in bursts.

## Invariants

**Change a duplicated pair on both sides.** `financial-month.ts`, `budget-projection.ts` and
`category-attribution.ts` each exist twice — canonical in `apps/api/src/common/utils/`, mirror in
`packages/shared-utils` — because the API has no build step and must not import `@budget/shared-utils`
at runtime (`check-no-shared-utils-runtime-import.sh` fails the deploy if it does). Same case table
on both sides.

**The projection pads days with no spending inside the shared function.** `dailyTotals` holds only
days that had expenses (what `groupBy(date)` returns); padding to `daysElapsed` at each call site
would let the two sides disagree and report the rate of a spending *day* rather than of the period.
Below `MIN_DAYS_FOR_BUDGET_PROJECTION` (5) it returns `null` — dropping the largest of two or three
days leaves no signal.

**`projectedTotal` stays non-nullable.** A declined projection falls back to `spent`, the honest
floor, and every consumer gates its sentence on `projectedTotal > budget.amount`, so they all fall
silent. Making it nullable would ripple through shared-types and eight surfaces for no gain.

**`getProgress` needs the `groupBy(['date'])`.** A single SUM cannot express "drop the largest
day". Fixing the API copy also fixes the analytics predictions, which reach the client through
`api.getInsights()`.

**Threshold alerts dedupe through two partial unique indexes (ABA-314).** Category allocations cross
the same `[50, 80, 100]` thresholds as the overall budget, checked at the end of
`checkBudgetThresholds` with one `groupBy(['categoryId'])` per budget. Postgres enforces
`budget_alert_overall_unique` (`WHERE category_id IS NULL`) and `budget_alert_category_unique`
(`WHERE category_id IS NOT NULL`); overall-alert lookups must filter `categoryId: null` or they
match category alerts. Mark before send, roll back on failure — the same pattern as the overall
alerts. Reuses the `budget_alert` type and `notifyBudgetAlerts` preference.

**Planned expenses and split receivables never count.** `getProgress` and `getHistory` filter
`isPlanned: false` (purchase requests' planned expenses) and spread `EXCLUDE_SPLIT_RECEIVABLE` — a
friend's share of a split bill is money owed back, not spend.

**`budgetStore` is a composition — extend the modules, not the store (ABA-537).** CRUD in
`budgetCrudActions.ts` (with `resolveCategoryName()` defined once — it had been hand-copied three
times), pull/sync and history in `budgetSync.ts`, progress in `budgetProgress.ts` as pure functions
over a `budgets` array. The public `useBudgetStore` API is unchanged across its ~28 importers.

**On web, retry the budget pull on `lastPullAt === null`, not on an empty list** — see
[web-data-loading](web-data-loading.md).

## Known gaps

- Nothing marks a manually entered monthly charge (rent) as recurring, so the projection is *less
  wrong* rather than right. The machinery exists — the Repeat toggle, `UserSubscription`, the
  anomaly engine's `recurring_suggestion` — and `SafeToSpendService` already separates obligations;
  wiring a nudge would be new functionality.
- Financial month is Wave 1 only: analytics, home totals, the calendar widget, safe-to-spend,
  Wrapped/story, Fat Finder, reports and the AI user-context summary are still calendar-month. The
  constraint is that the server and client halves of one number migrate together.
- `GET /budgets/:id/history?periods=N` (max 12) returns `[]` for `custom`-period budgets. Mobile
  keeps the result in memory only.

## History

ABA-171 (period util) · ABA-314 (category threshold alerts) · ABA-383 (financial month, wave 1) ·
ABA-523 (projection) · ABA-529 (split-aware progress) · ABA-537 (store split).
