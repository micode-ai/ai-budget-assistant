---
id: analytics-vsaverage-unimplemented
title: analytics.service trends.vsAverage is hardcoded to 0
status: open
priority: P1
module: apps/api
created_at: 2026-05-11
---

# analytics.service trends.vsAverage is hardcoded to 0

## What's wrong

`apps/api/src/modules/analytics/analytics.service.ts` line 175 returns a hardcoded zero for the `vsAverage` trend field:

```ts
trends: {
  vsLastPeriod,
  vsAverage: 0, // TODO: Calculate average
},
```

Any consumer of `GET /analytics/summary` that renders a "vs. average" comparison — whether the mobile analytics tab or the admin dashboard — will always display 0, giving users misleading information.

## Why it matters

The field is already part of the public response shape and is surfaced to users as a performance indicator. Showing a permanent 0 erodes trust in the analytics feature. Because the calculation is a TODO inside an otherwise complete function, this is easy to miss during QA — the response is valid JSON, it just contains wrong data.

## Proposed fix

- Query expenses grouped by the same date range for the last N periods (e.g. prior 3 months) to compute a rolling average total spend.
- Calculate `vsAverage` as `(currentTotal - rollingAverage) / rollingAverage * 100`.
- Reuse the same Prisma query structure already used for `vsLastPeriod` — just extend the date range.
- Add a unit test that mocks historical expense data and asserts a non-zero `vsAverage` result.
- Remove the TODO comment once the calculation is wired in.

## Files involved

- `apps/api/src/modules/analytics/analytics.service.ts`
