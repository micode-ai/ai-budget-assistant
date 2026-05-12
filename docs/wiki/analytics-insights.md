# Analytics & Insights

## What this is
The spending analysis layer: server-side aggregations (`modules/analytics/`, `modules/insights/`), client-side computation hooks, and the analytics tab + dashboard charts in the mobile app.

## Entry points
- `apps/api/src/modules/analytics/` — endpoints for spending breakdowns, trends, category summaries
- `apps/api/src/modules/insights/` — AI-generated or rule-based financial insights
- `apps/mobile/app/(tabs)/analytics/` — analytics tab screens
- `apps/mobile/src/features/analytics/useAnalytics.ts` — client-side analytics computation hook (reads from stores, aggregates locally)
- `apps/mobile/src/stores/insightsStore.ts` — fetches and caches insight cards from API
- `apps/mobile/src/components/insights/` — `InsightCard`, `InsightCarousel`
- `apps/mobile/src/hooks/useCalendarData.ts` — calendar grid computation, date filtering, multi-currency category breakdowns; shared by `CalendarWidget` and `app/calendar/index.tsx`
- `apps/mobile/src/components/charts/` — `Bar`, `Donut`, `Pie`, `Weekday`, `GroupedBar` chart components
- `apps/mobile/src/components/interactive-charts/` — drill-down charts with `ChartRenderer`

## Key concepts
- **Dual computation** — heavy aggregations happen server-side via the `analytics` module; lightweight / offline aggregations happen client-side in `useAnalytics.ts` using data already in the Zustand stores
- **Calendar view** — `useCalendarData.ts` is a shared hook used in both the home widget and the full-screen calendar page; handles multi-currency conversion for per-day totals
- **Scenario simulator** — `src/features/scenario/useScenarioProjection.ts` is pure client-side; reads expense/income stores and projects savings over 3/6/12 months
- **Fat Finder** — `app/fat-finder.tsx` identifies large or recurring expenses; computation is client-side
- **Insights** — `insightsStore.ts` polls `GET /insights`; server generates rule-based tips (e.g., "you spent 30% more on dining this month")

## Cross-references
- Talks to: `api` analytics and insights endpoints for server-computed data
- Used by: home tab widgets (`CalendarWidget`, `NetProfitWidget`, `NetCapitalWidget`)
- Used by: `admin-dashboard` — registration trends and AI cost charts use Recharts with data from API

## Where to look first
Chart rendering bugs → `apps/mobile/src/components/charts/` and `interactive-charts/`. Server aggregation logic → `apps/api/src/modules/analytics/`. Insight generation → `apps/api/src/modules/insights/`.
