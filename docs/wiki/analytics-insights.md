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

## Feature pages
- [cash-flow-forecast](features/cash-flow-forecast.md) — the next 30 days of the balance, day by day
- [analytics-cash-flow](features/analytics-cash-flow.md) — income vs spending with the savings rate, and fixed vs flexible spending
- [analytics-period-comparisons](features/analytics-period-comparisons.md) — "vs last period", "vs 3-month average", avg per day, category chips and the anomaly list: same-days windows while a period is in progress
- [safe-to-spend](features/safe-to-spend.md) — the deterministic "safe to spend today" number and the chat affordability check
- [financial-wrapped](features/financial-wrapped.md) — the year-in-review card deck and its share image
- [child-costs](features/child-costs.md) — per-child spending, 800+ benefit coverage, share card and the Pro statement PDF
- [gazetka-match](features/gazetka-match.md) — promo leaflets matched to what the user buys, community promos and their daily push

## Key concepts
- **Dual computation** — heavy aggregations happen server-side via the `analytics` module; lightweight / offline aggregations happen client-side in `useAnalytics.ts` using data already in the Zustand stores
- **Calendar view** — `useCalendarData.ts` is a shared hook used in both the home widget and the full-screen calendar page; handles multi-currency conversion for per-day totals
- **Scenario simulator** — `src/features/scenario/useScenarioProjection.ts` is pure client-side; reads expense/income stores and projects savings over 3/6/12 months
- **Fat Finder** — `app/fat-finder.tsx` renders a report generated **server-side** by `modules/insights/fat-finder.service.ts` (LLM-written, Pro-gated), not computed on the client. Its month is the account's financial month ([ABA-790](https://github.com/micode-ai/ai-budget-assistant/issues/828)): `month`/`year` name the month the period starts in, the three-month history steps back by financial months, and the screen opens on the current financial month with its span under the name
- **Discover entries** — Spending Story, Scenario Simulator, yearly and monthly Wrapped and Real Salary are ONE list in `apps/mobile/src/components/analytics/discoveryItems.ts`: the phone renders it as a horizontal `DiscoveryStrip` under the summary cards (it replaced five full-width banners that pushed every chart a screen down, ABA-766), the desktop as `DiscoveryRow`. A new entry goes in that list, never as a hand-written banner
- **Trailing-average deltas** — `useAnalytics` returns `vsAverage` on the summary and per category, month view only, against the SAME days of the trailing three months while the month is in progress; deltas inside ±5% are treated as noise and not shown. The anomaly list is derived from these chips. See [analytics-period-comparisons](features/analytics-period-comparisons.md)
- **Insights** — `GET /insights` returns rule-based anomalies and budget predictions; the current Analytics tab uses only the predictions and builds its anomaly list locally (ABA-762); the server list stays for older app versions

## Cross-references
- Talks to: `api` analytics and insights endpoints for server-computed data
- Used by: home tab widgets (`CalendarWidget`, `NetProfitWidget`, `NetCapitalWidget`)
- Used by: `admin-dashboard` — registration trends and AI cost charts use Recharts with data from API

## Where to look first
Chart rendering bugs → `apps/mobile/src/components/charts/` and `interactive-charts/`. Server aggregation logic → `apps/api/src/modules/analytics/`. Insight generation → `apps/api/src/modules/insights/`.
