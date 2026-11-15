# 30-day cash-flow forecast

*Hub: [analytics-insights](../analytics-insights.md) · related: [safe-to-spend](safe-to-spend.md), [analytics-cash-flow](analytics-cash-flow.md), [subscription-manager](subscription-manager.md), [recurring-expenses](recurring-expenses.md)*

## What this is

The account's balance for the next 30 days, day by day, on the Analytics tab. It answers "will I
make it to the next salary, and what will tip me over". Safe-to-Spend gives one number for
today; this lays the same known future out on a calendar. Deterministic, no LLM, free on every
tier.

## Entry points

- `apps/api/src/common/utils/cash-flow-dates.ts`: the pure date rules, **shared with
  Safe-to-Spend** and mirrored in shared-utils for the app's offline Safe-to-Spend (ABA-772);
  `apps/api/src/modules/insights/cash-flow-forecast.util.ts`: the series builder, re-exporting them.
- `apps/api/src/modules/insights/cash-flow-forecast.service.ts`: `CashFlowForecastService`,
  `cashFlowForecastCacheKey`.
- `GET /insights/cash-flow-forecast` in `insights.controller.ts`. No tier guard; viewers may read
  it.
- `packages/shared-types/src/dto/insights.ts`: `CashFlowForecastResponse`.
- Mobile: `features/analytics/useCashFlowForecast.ts` and
  `components/analytics/CashFlowForecastCard.tsx`. The phone shows the card in
  `AnalyticsMobile.tsx`; desktop shows it under `CashFlowRow` in `AnalyticsDesktop.tsx`.

## Key concepts

**Start**: today's wallet balance, every currency converted to `user.currencyCode`
(`common/utils/fx.ts`).

**Scheduled events** over today … today + 30:
- **Income**: every income series with a monthly cadence (`detectMonthlyIncomeSeries`, the same
  rule Safe-to-Spend uses). Its next date is the last date plus the average gap. A payment that
  is already overdue is not assumed to still come.
- **Subscriptions**: active `UserSubscription` renewals. An overdue `nextRenewalDate` is walked
  forward, and a renewal due today counts.
- **Recurring expenses**: the newest row per `recurringId`, stepped by `recurringPeriod`,
  strictly after today. Today's instance is assumed already booked by the 08:00 cron.
- **Planned purchases** (`isPlanned` expenses, approved purchase requests) on their date, and
  **borrowed debts due** (`Income.isDebt` with `debtDueDate`, minus repayments linked by
  `relatedDebtIncomeId`) — both as outflows; anything already overdue is placed on today (ABA-775).
  Lent debts (money others owe the user) are deliberately NOT assumed to come back.

**Everyday spending**: the average day of the last 90 days. It leaves out rows in a recurring
series and rows that pay an active subscription (`paysSubscription`, the same name-or-category+amount rule as
the app's fixed-vs-flexible card), because those are already scheduled and would otherwise count
twice. With under 14 days of history it is not estimated (`spendingHistoryShort`), and the card
says so.

**Series**: day 0 = start + today's scheduled events (today's spending is already in the
balance); every later day also subtracts the typical day. `lowest` is the minimum,
`endBalance` the last day.

**Card**: the headline names the **first day below zero** when there is one ("money may run short
around …"), otherwise the lowest point. When today's balance is already negative it says so
instead (`analytics.forecastAlreadyShort`, ABA-768): a run-short date of today is a prediction about
the past. It also shows today / lowest / in 30 days, 31 bars (red
below zero, amber at the lowest day, green on income days), the next six events, and a note that
this is an estimate. The card is shown only while the current period is open.

## Invariants

- Safe-to-Spend and the forecast take their date rules from `common/utils/cash-flow-dates.ts` (and the app's offline Safe-to-Spend from its shared-utils mirror). A
  second copy would let the hero number and the forecast disagree about when the salary comes.
- Goal contributions are **not** subtracted. Safe-to-Spend reserves them, but they are not money
  leaving the wallet, so subtracting them would fabricate a shortfall.
- A recurring series or a subscription charge must never also count in the typical day.
- No forecast is drawn from data the app does not have. There is no device fallback: it needs
  income cadence, subscriptions and the wallet together, so offline the card is simply absent. A
  fully encrypted account gets `encryptionRestricted` and no figures.
- The "runs short" date is the first negative day, not the lowest one. The lowest can be weeks
  later, and the warning is about when the money runs out.

## Known gaps

- Irregular income (no monthly cadence) is ignored, so a freelancer's forecast is pessimistic.
- No push when the forecast first dips below zero.
- The start is the wallet balance. When it was never set, `walletBalanceUnset` makes the card say
  so with a **Set balance** link (ABA-773, see [safe-to-spend](safe-to-spend.md)); the figures
  themselves still count from zero.

## History

ABA-764: the forecast, and the shared date rules extracted from Safe-to-Spend. ABA-768: the
already-below-zero headline. ABA-775: planned purchases and borrowed debts due.
