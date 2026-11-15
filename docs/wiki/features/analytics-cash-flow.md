# Analytics tab: income vs spending, and fixed vs flexible spending

*Hub: [analytics-insights](../analytics-insights.md) · related: [analytics-period-comparisons](analytics-period-comparisons.md), [subscription-manager](subscription-manager.md), [recurring-expenses](recurring-expenses.md)*

## What this is

Two cards on the Analytics tab, computed on the device from data already in the stores:

- **Income vs spending**: what came in, what went out, what was kept, the savings rate, and an
  earned-vs-spent bar pair per month.
- **Fixed vs flexible**: how much of the period's spending is fixed (money that leaves whatever
  the user decides) and the largest fixed items.

Before these cards, the tab only answered "where did the money go".

## Entry points

- `apps/mobile/src/features/analytics/cashFlow.ts`: pure `summarizeCashFlow`, `monthlyCashFlow`,
  `monthWindowsEndingAt`, `classifyCommitments`, `matchSubscription`. Tested in
  `__tests__/cashFlow.test.ts`.
- `useCashFlowAnalytics.ts` → `{ cashFlow, cashFlowMonths, commitments }`, exposed through
  `useAnalytics` and `useAnalyticsScreenData` as `cashFlowAnalytics`.
- UI: `components/analytics/CashFlowCard.tsx` and `CommitmentsCard.tsx`, shared by both layouts.
  The phone shows them stacked under `SummaryCards` (`AnalyticsMobile.tsx`). Desktop shows them
  side by side in `desktop/CashFlowRow.tsx`, under the summary strip and only once the screen has
  loaded and the period is not empty.

## Key concepts

**Spent** is the same filtered expense list the Total spent card sums, so the two figures always
agree. **Earned** is the period's incomes, excluding split receivables. Both follow the currency
filter and are converted to the display currency. Kept = earned − spent; a negative value is
labelled "Overspent". The savings rate is kept ÷ earned, or none at all when nothing was earned.

**Monthly chart**: in the month view, the 6 calendar months ending with the selected one; in the
year view, the 12 months of that year; in the week view, no chart.

**Fixed** means only what the app *knows* repeats:
1. an expense in a recurring series (`recurringId`), or
2. an expense matching an **active** tracked subscription. A match is either the same name
   (description or merchant, trimmed, case-insensitive), or the same category, the same currency
   and an amount within 1%. The subscription manager books renewals as ordinary expenses with no
   link back to the subscription, so matching is the only way to recognise them.

Everything else is flexible, including a rent typed in by hand every month. The card's footer
says what "fixed" means, and when it finds nothing fixed it suggests marking an expense as
recurring or adding subscriptions.

## Invariants

- Never infer "fixed" beyond the two rules above. Calling a guessed expense a commitment is
  worse than under-counting, because the user plans around it.
- `commitments` stays `null`, and the card stays hidden, until the current account's
  subscriptions have loaded. Before that, every subscription charge would read as flexible:
  unloaded data drawn as fact.
- Spent must stay the Total spent card's list. A second spend definition here would put two
  different "spent" figures on one screen.

## Known gaps

- Renewals carry no link to their subscription. Marking them at booking time would remove the
  matching heuristic.
- A user cannot mark a category (rent, utilities) as fixed; that needs a schema field and sync.
- Periods are calendar periods; the financial month is not applied (see [budgets](budgets.md)).

## History

ABA-763: both cards, phone and desktop.
