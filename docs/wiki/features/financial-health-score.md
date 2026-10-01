# Financial Health Score

*Hub: [analytics-insights](../analytics-insights.md) · related: [home-screen](home-screen.md),
[desktop-dashboard](desktop-dashboard.md)*

## What this is

A 0–100 score on the home screen summarising four signals about the account, with a tap-to-open
explanation of each. Computed entirely on the device — no server call, no AI cost.

## Entry points

- `apps/mobile/src/features/analytics/useFinancialHealthScore.ts` — the pure `useMemo` hook
- `apps/mobile/src/components/widgets/FinancialHealthWidget.tsx` — circular gauge (a plain
  `View`/border construction, no native chart dependency) plus the explanation sheet
- `WidgetKey` `financialHealth` in `apps/mobile/src/stores/widgetVisibilityStore.ts` (default on);
  also on the desktop dashboard (`components/home/desktop/DashboardDesktop.tsx`)
- i18n: `healthScore.*`

## Key concepts

**Four components, up to 25 points each.**

- *Budget adherence* — share of active budgets not over their limit. Excluded when there are no
  active budgets.
- *Savings rate* — `(income − expenses) / income` for the current totals from `exchangeRateStore`,
  linear from 0% (0 points) to 20% or more (25). Excluded when there is no income.
- *Goal progress* — share of active goals on track, meaning the saved amount is at least the linear
  pace from creation to deadline. Excluded when there are no active goals.
- *Debt health* — always included: 25 points with no debts or none overdue, otherwise scaled by the
  share of debts not overdue.

The score normalises over the included components only, so a missing signal neither helps nor
hurts. With fewer than two included components `hasEnoughData` is false and no score is shown.
Colour: red below 40, yellow 40–69, green 70 and above.

## Invariants

**The score is wrong in the flattering direction while data is still loading** — debt health is
always 25/25 with no debts, and budget adherence is 25/25 as soon as budgets land with no expenses
yet. That is why the widget takes a `readiness` input and ANDs it into `hasEnoughData` on web, where
a mid-load dashboard once reported "Great, 100" about an account it knew nothing about. On the phone
the prop is absent (meaning ready), because SQLite is authoritative. Details on
[desktop-dashboard](desktop-dashboard.md).

## Known gaps

- Debt health counts debts, not amounts: one small overdue loan weighs the same as a large one.

## History

ABA-193 (the score and widget) · ABA-521 (readiness gate on web).
