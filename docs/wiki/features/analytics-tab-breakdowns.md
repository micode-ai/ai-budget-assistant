# Analytics tab: merchant and income-category breakdowns

*Hub: [analytics-insights](../analytics-insights.md) · related: [merchants](merchants.md)*

## What this is

Two donut-plus-rows breakdowns on the Analytics tab, both computed on the device from data already
in the stores: where the money went by merchant, and where income came from by category.

## Entry points

- `apps/mobile/src/features/analytics/useMerchantAnalytics.ts` → `merchantSpending: MerchantSpending[]`
- `apps/mobile/src/features/analytics/useIncomeAnalytics.ts` → `incomeByCategory: IncomeCategorySpending[]`,
  `INCOME_CATEGORY_COLORS`
- Both composed by `useAnalytics` / `useAnalyticsScreenData`, filtered by `useFilteredTransactions`
- `apps/mobile/src/components/analytics/MerchantBreakdown.tsx`,
  `apps/mobile/src/components/analytics/IncomeCategoryBreakdown.tsx` — the shared
  `InteractiveDonutChart` + row-list pattern also used by `TagBreakdown`
- Phone layout: `apps/mobile/src/components/analytics/AnalyticsMobile.tsx`; desktop:
  `apps/mobile/src/components/analytics/desktop/BreakdownGrid.tsx`

## Key concepts

**Merchants.** Expenses with a null or blank merchant are excluded; the rest are grouped by trimmed
merchant, sorted by amount, and cut to the top eight plus an "Other" remainder
(`analytics.merchantOther`). Percentages are of merchant-tagged spending only, not of all spending.

**Income categories.** Incomes in the same date and currency filter as the expense views, grouped by
`categoryId`; uncategorized income is labelled `analytics.incomeCategoryOther`. Its palette is the
green/teal `INCOME_CATEGORY_COLORS`, distinct from the expense `CATEGORY_COLORS`, and it has no
vs-average chip.

**Placement on the phone.** The income breakdown sits after the AI insights section and before the
spending trend; the merchant breakdown sits between the category and tag breakdowns. Each renders
only when it has at least one row.

## Known gaps

- Merchant grouping is case-sensitive (`Lidl` and `LIDL` are two slices); the merge tools on
  [merchants](merchants.md) are the remedy.
- Income-category colours are assigned before the sort, so a slice's colour follows first
  appearance, not rank.

## History

ABA-174 (merchant breakdown) · ABA-178 (income category breakdown).
