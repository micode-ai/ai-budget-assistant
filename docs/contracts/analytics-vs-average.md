# Contract: analytics vsAverage calculation

**Module**: `apps/api/src/modules/analytics/analytics.service.ts`
**Consumers**: Mobile analytics tab (via `/analytics/summary`), Admin dashboard

## Input

`getSummary(accountId: string, startDate: Date, endDate: Date)`

## Output — `trends` object

```ts
{
  vsLastPeriod: number; // % change vs. immediately preceding same-length period
  vsAverage: number;    // % change vs. 3-month trailing average
                        // Positive = spending more than average
                        // Negative = spending less than average
                        // 0 = no historical data (< 1 full calendar month before startDate)
}
```

## vsAverage calculation

1. Determine trailing window: the 3 full calendar months immediately before `startDate`.
   - E.g. if startDate = 2026-05-01, the window is Feb, Mar, Apr 2026.
2. For each month, fetch the sum of non-deleted expenses for `accountId`. Use Redis cache key `analytics:trailing-avg:{accountId}:{YYYY-MM}` (1 h TTL) to avoid re-querying.
3. Compute `rollingAverage = sum(monthlyTotals) / count(months with data)`.
   - Months with 0 expenses are included in the count.
   - If no months have any data (brand-new account), `rollingAverage = 0` and `vsAverage = 0`.
4. `vsAverage = (currentTotal - rollingAverage) / rollingAverage * 100` (rounded to 2 decimal places).
   - If `rollingAverage === 0` and `currentTotal > 0`: `vsAverage = 100` (treat as "100% above baseline of 0").

## Mobile-side (useAnalytics hook)

The same calculation runs client-side using the local SQLite expense store:
- Reads expenses from `useExpenseStore().expenses` (already in memory).
- Filters to trailing 3 full calendar months before `dateRange.startDate`.
- Produces `vsAverage: number` added to the `AnalyticsSummary` return shape.

## Cache key format

```
analytics:trailing-avg:{accountId}:{YYYY-MM}
```

Example: `analytics:trailing-avg:acc_abc123:2026-04`

TTL: 3600 seconds (1 hour).

## Error handling

- Redis failures are swallowed (fail-silent) — `vsAverage` falls back to freshly computed value.
- Encryption tier 2 accounts: `vsAverage` stays `0` (amounts are encrypted, cannot compute).
