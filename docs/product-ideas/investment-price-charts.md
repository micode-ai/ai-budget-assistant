---
id: investment-price-charts
title: Historical price charts for individual investment holdings
status: idea
priority: P1
created_at: 2026-05-11
jira_ticket:
---

# Historical price charts for individual investment holdings

## User story
As an investor tracking my portfolio, I want to see a historical price chart for each holding, so that I can evaluate performance trends without leaving the app.

## Value hypothesis
The app already fetches live prices via Twelve Data API. A chart turns a single number ("up 3%") into a story ("up 3% but down from a peak two months ago"). Users stay in-app instead of switching to Yahoo Finance or Google, which increases session depth and makes the investment feature feel complete rather than a stub.

## Sketch
- Add a line/area chart to the `app/investment/[holdingId].tsx` screen, replacing the current "Price chart coming soon" placeholder (`[holdingId].tsx:265`).
- Period selector tabs: 1W / 1M / 3M / 1Y — fetch OHLCV time series from Twelve Data `/time_series` endpoint.
- Overlay a horizontal dotted line at the user's average cost basis so they can immediately see if they're above or below water.
- Cache fetched series in memory for the session (same pattern as exchange rates) to avoid repeated API hits.
- On API error or unsupported ticker, gracefully fall back to the existing placeholder text rather than crashing.

## Open questions
- Does the current Twelve Data API plan include time series data, or only quotes? Check rate limits.
- Should chart data be persisted to SQLite for offline viewing, or memory-only?
- Is this a Pro-only feature or available to all? (Benchmark comparison is already Pro-gated.)

## Cost estimate
2–3 days: Twelve Data API integration for time series + `react-native-gifted-charts` or Victory Native line chart component + period selector UI.
