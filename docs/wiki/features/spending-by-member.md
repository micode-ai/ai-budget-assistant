# Analytics tab: spending by member

*Hub: [analytics-insights](../analytics-insights.md) · related: [analytics-tab-breakdowns](analytics-tab-breakdowns.md)*

## What this is
A "By member" donut-plus-rows on the Analytics tab for shared accounts: who created how much of the period's spend. Computed on the device, no API change.

## Entry points
- `apps/mobile/src/features/analytics/memberGrouping.ts` (pure), `useMemberAnalytics.ts`
- `apps/mobile/src/components/analytics/MemberBreakdown.tsx` (phone), `desktop/BreakdownGrid.tsx` (secondary card)

## Invariants
- Hidden on personal accounts and with fewer than two creators — a single slice carries no information.
- Category splits move money between categories, never people, so member totals use the whole expense amount; `memberCategoryBreakdown` reuses the split-aware category rule.
- Grouping is by `userId`, never by name (two members can share a display name).

## Known gaps
Tap-to-filter the transactions list by creator, a member-within-category view and an owner visibility toggle are not built.

## History
Product idea `spending-by-member-analytics`.
