---
id: budget-period-retrospective
title: Budget retrospective — month-by-month compliance history
status: building
priority: P1
created_at: 2026-05-11
jira_ticket:
github_issue: https://github.com/micode-ai/ai-budget-assistant/issues/114
orchestration_run: 352fdfd0-53f5-459b-b104-118d77c1edf7
---

# Budget retrospective — month-by-month compliance history

## User story
As someone managing monthly budgets, I want to see how each budget category performed over the past 3–6 months, so that I can spot which categories I consistently overspend and adjust my limits accordingly.

## Value hypothesis
Budgets currently show only the current period's progress. Once the period resets, the data is gone from the user's view. A retrospective dashboard closes the feedback loop — users can see "I've gone over Dining Out 4 months in a row" and either change behavior or adjust the budget. This is one of the highest-engagement patterns in personal finance apps (Mint, YNAB all have this). A feature plan for "budget period history" already exists in `docs/superpowers/plans/2026-04-16-budget-period-history.md`, suggesting the API work may already be scoped.

## Sketch
- New tab or bottom sheet within `app/budget/[id].tsx`: "History" tab alongside the current "Overview" tab.
- Bar chart showing actual spend vs. budget limit for the last 6 periods (months/weeks depending on `BudgetPeriod`).
- Summary line: "Over budget 3 of 6 months. Average overage: +$42."
- Tap any bar to drill into that period's expenses list (reuse the existing drill-down pattern from analytics).
- Backend: `GET /budgets/:id/history?periods=6` — aggregate `expenses` by period for the given budget's category, return `[{period, limit, actual}]`.
- Store fetched history in `budgetStore` keyed by `budgetId`.

## Open questions
- Is historical budget data currently queryable from the API, or does the schema only store the current period's limit?
- For custom-period budgets (BudgetPeriod.custom), how should "periods" be defined?
- Should this be a Pro feature or available on all plans?

## Cost estimate
3–4 days: API aggregation endpoint + budget store extension + History tab UI with bar chart.
