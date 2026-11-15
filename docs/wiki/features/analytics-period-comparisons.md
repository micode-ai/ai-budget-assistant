# Analytics tab: period comparisons and the anomaly list

*Hub: [analytics-insights](../analytics-insights.md) · related: [analytics-tab-breakdowns](analytics-tab-breakdowns.md), [display-currency-conversion](display-currency-conversion.md), [anomaly-alerts](anomaly-alerts.md)*

## What this is

The numbers on the Analytics tab that compare the selected period with earlier ones: the "vs last
period" line and the "vs 3-month average" line on the Total spent card, "Avg per day", the
per-category "vs average" chips, and the anomaly list ("N% more than usual on X"). These are the
first figures a user reads, so a wrong one here is worse than a missing one.

## Entry points

- `apps/mobile/src/features/analytics/periodWindows.ts`: pure `comparablePreviousWindow`,
  `trailingMonthWindows`, `elapsedDays`, `inWindow`. Tested in `__tests__/periodWindows.test.ts`.
- `usePeriodComparison.ts` → `PeriodComparison` (with `isPartial`)
- `useSummaryAnalytics.ts` → `averagePerDay`, `vsAverage`, `mostExpensiveCategory`
- `useCategoryAnalytics.ts` → per-category `vsAverage` (the chips)
- `useSpendingAnomalies.ts`: pure `anomaliesFromCategories` builds the list; `GET /insights` is
  called only for budget predictions
- UI: `components/analytics/SummaryCards.tsx` (phone), `desktop/AnalyticsSummaryStrip.tsx`,
  `QuickInsights.tsx` (phone anomaly list). Desktop shows the chips and does not render the list.
- API: `InsightsService.detectSpendingAnomalies` in `apps/api/src/modules/insights/insights.service.ts`

## Key concepts

**Same days, while the period is in progress.** Each comparison window is half-open
(`start <= date < end`). While the selected period contains today, it is compared with the
calendar period before it, cut to the same number of elapsed days. On the 5th, that means the
first five days of last month, and the first five days of each of the three trailing months for
the average. A window is clamped to its own month, so on the 31st it holds all of February. A
finished or future period is compared whole. `PeriodComparison.isPartial` switches the card copy
to the `*ToDate` keys ("the same days of the previous period").

**Calendar, not milliseconds.** The previous month is the previous calendar month. Shifting back
by the period's length gave about 29 Jan – 28 Feb for March.

**Months are financial months (ABA-767).** With an account anchor day (`monthAnchorDay`, salary
on the 10th), the month view follows the anchor:
- *October* is 10 Oct – 9 Nov. `selectedMonth` names the month the period starts in, the
  `formatFinancialMonth` convention.
- `usePeriodNavigation` opens on the current financial month (on 5 Nov that is still October).
- `getPeriodRange()` prints the exact span under the label.
- `useFilteredTransactions` builds the range with `financialMonth`. `comparablePreviousWindow`,
  `trailingMonthWindows` and `monthWindowsEndingAt` step with `shiftFinancialMonth`.
- A `null` anchor is exactly the calendar month. Week and year views stay calendar.

**Day keys are local.** `localDayKey` keys the daily trend and the highest-spending day by the
local calendar day; a bare `YYYY-MM-DD` is kept as-is. `useDailySpending` iterates every local day
of the range, so an anchored month spanning two calendar months gets all its bars.

**Avg per day** divides by `elapsedDays`: days so far while in progress, the whole period
otherwise.

**vs 3-month average** is a monthly figure, so it exists only in the month view. In the week and
year views it is 0, and 0 hides the line. It uses the same currency filter as the current total.

**Anomalies are the chips.** The list is every top-level category whose chip reads +30% or more,
derived from the category tree. It therefore shares the tree's selected period, currency filter,
split attribution, conversion and same-days windows. The list is month-view only.

**Top category** comes from the same splits-aware grouping as the donut, rolled up to parents
(`groupExpensesByCategory` → `normalizeCategoryKeys` → `rollUpCategoryTotals`).

**Server `detectSpendingAnomalies`** is kept for app versions released before ABA-762, which still
render its list. It applies the same rules, adapted to the server:
- it covers the current month only;
- amounts are converted to `user.currencyCode` via `common/utils/fx.ts`, and an amount with an
  unknown rate is left out;
- `isPlanned` and split receivables are excluded, and amounts go through `attributeToCategories`;
- it compares the same days of the last three months, averaged over the months in which the
  account spent anything.

## Invariants

- Never compare a partial period with whole ones. The result always reads as a large saving early
  in the month and an overspend late in it, a fact about the calendar shown in green or red.
- The anomaly list and the category chips must come from one computation. When they came from
  two (client chips, server list), they disagreed on period, currency and splits.
- The summary's top category and the donut must use the same grouping.
- New comparison code reuses `periodWindows.ts` rather than doing its own date arithmetic.

## Known gaps

- The Story and Reports links from this tab still pass a calendar month; their server side has
  not moved to the financial month yet (see [budgets](budgets.md)).
- The average divides by three even for an account with only one earlier month of history. This
  is the chips' long-standing rule; the server counts only months with any spend.

## History

ABA-767: financial months in the month view and local day keys. ABA-762: same-days comparisons, a calendar previous period, avg per day over elapsed days,
anomalies derived from the chips, a currency-safe server list, and the year view including
31 December.
