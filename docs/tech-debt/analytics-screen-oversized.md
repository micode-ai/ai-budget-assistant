---
id: analytics-screen-oversized
title: analytics.tsx screen is 1,091 lines mixing data prep and UI
status: closed
priority: P2
module: apps/mobile
created_at: 2026-05-11
orchestration_run: 85cad6a3-b40b-4245-8109-ac4039b481eb
---

# analytics.tsx screen is 1,091 lines mixing data prep and UI

## What's wrong

`apps/mobile/app/(tabs)/analytics.tsx` is 1,091 lines long and conflates four responsibilities: (1) date-range and filter state management, (2) data-transformation logic (aggregations, chart-series construction), (3) chart rendering (multiple chart types per section), and (4) list rendering (category rows, top expenses). The existing `src/features/analytics/useAnalytics.ts` hook was meant to centralise the computation layer but only partially extracts the logic — the screen component still contains significant inline derivation.

## Why it matters

- The 1,091-line file is the second-highest-churn screen in the app; every analytics improvement causes wide diffs that are hard to review.
- Chart-specific logic duplicated between `analytics.tsx` and `useAnalytics.ts` means fixing a calculation in one place does not automatically fix it in the other.
- The drill-down interaction (tap a category → see item breakdown) is wired directly in the screen rather than through the shared `interactive-charts/` infrastructure, so it cannot be reused elsewhere.

## Proposed fix

- Move all remaining aggregation/series-construction code from `analytics.tsx` into `useAnalytics.ts` (or new sibling hooks), so the screen consumes only typed, display-ready data.
- Extract each major chart section (trends, categories, top expenses, period comparison) into a dedicated component under `src/components/analytics/` that takes plain props and owns its own rendering.
- Replace the inline drill-down state with the `interactive-charts/` `ChartRenderer` pattern already used elsewhere in the app.
- Target: the screen component should be under 200 lines after extraction.

## Files involved

- `apps/mobile/app/(tabs)/analytics.tsx`
- `apps/mobile/src/features/analytics/useAnalytics.ts`
- `apps/mobile/src/components/interactive-charts/` (reference pattern)
