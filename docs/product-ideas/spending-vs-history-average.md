---
id: spending-vs-history-average
title: '"Spending vs. your average" — contextual comparison in analytics'
status: idea
priority: P2
created_at: 2026-05-11
jira_ticket:
---

# "Spending vs. your average" — contextual comparison in analytics

## User story
As a regular app user, I want to know whether this month's spending is higher or lower than my typical month, so that I can quickly judge if I need to cut back without manually comparing numbers.

## Value hypothesis
The analytics API already has a `vsAverage` field but it is hardcoded to `0` with a `// TODO: Calculate average` comment (`analytics.service.ts:175`, also tracked in `docs/tech-debt/analytics-vsaverage-unimplemented.md`). This means users see a stale/wrong number every time they open analytics. Fixing it unlocks a single powerful insight — "You spent 18% more than your 3-month average this month" — which is the kind of number that drives behavior change. It also makes the existing UI correct, which reduces trust erosion.

## Sketch
- In `analytics.service.ts`, implement the `vsAverage` calculation: fetch total expenses for the trailing 3 full months for the same account, compute the mean, compare to the current period's total, return as a signed percentage.
- Optionally also compute `vsAverageByCategory` so each category card in the analytics breakdown can show a small "+12% vs avg" chip.
- No mobile UI changes needed for the top-line number — the field already exists in the response and presumably already renders.
- For the per-category chip: add a small colored label to each category row in the analytics breakdown (green if below average, amber/red if above).
- Cache the 3-month aggregate in Redis with a 1-hour TTL (same key pattern as other analytics) to avoid recalculating on every page open.

## Open questions
- What happens for new users with <3 months of data? Show "Not enough history" or compute over available months?
- Should the comparison window be configurable (1M / 3M / 6M average), or is 3M the right default?
- Does the analytics summary card in the mobile UI already render the `vsAverage` field, or is it hidden until it's non-zero?

## Cost estimate
1–2 days: implement the calculation in `analytics.service.ts` + add Redis caching + optionally add per-category delta chips in mobile.
