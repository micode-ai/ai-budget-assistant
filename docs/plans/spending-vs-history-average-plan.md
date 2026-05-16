# Plan: "Spending vs. your average" — contextual comparison in analytics

**Feature ID**: `spending-vs-history-average`
**GitHub Issue**: https://github.com/micode-ai/ai-budget-assistant/issues/104
**Orchestration Run**: 11cbd2c7-1029-442c-bde7-261a9782b798

## Decisions

- **Comparison window**: 3 trailing full calendar months (not configurable in v1).
- **New users (<3 months)**: Compute average over however many full months exist; if 0 full months of history, return `vsAverage: 0` (no comparison).
- **Mobile computation**: Computed locally from SQLite expense store — no new network call needed; consistent with offline-first architecture.
- **Caching**: Redis per-month aggregates keyed `analytics:trailing-avg:{accountId}:{YYYY-MM}`, 1 h TTL, fail-silent.

## Checklist

- [x] Write plan document (`docs/plans/spending-vs-history-avverage-plan.md`)
- [x] Write module contract (`docs/contracts/analytics-vs-average.md`)
- [x] Implement `vsAverage` in `analytics.service.ts` — `getSummary` method
- [x] Implement `vsAverage` in `analytics.service.ts` — `getAggregatedSummary` method
- [x] Inject `CacheService` into `AnalyticsService` + `AnalyticsModule`
- [x] Add `vsAverage` to `AnalyticsSummary` return in `useAnalytics.ts` hook (mobile)
- [x] Render `vsAverage` chip in analytics summary card (`app/(tabs)/analytics.tsx`)
- [x] Mark tech-debt doc `analytics-vsaverage-unimplemented.md` as `resolved`
- [x] Set product-idea `spending-vs-history-average.md` status to `building`
- [x] Create GitHub issue ABA-105 via `finish-aba-task` skill
