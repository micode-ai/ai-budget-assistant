# Fat Finder (Expense Audit)

> An AI-powered monthly audit that analyzes your spending, identifies waste — subscriptions, recurring splurges, unnecessary services — and suggests concrete cuts with estimated savings.

## Overview

The **Fat Finder** scans 3 months of your transaction history, detects spending patterns, and generates a report highlighting where you could save money. Each finding includes specific amounts, severity levels, and actionable suggestions.

## How to Access

- **Dashboard card** — the Fat Finder summary card appears on the home screen showing total potential savings and top 3 findings. Tap **View Full Report** to see details.
- **Direct navigation** — navigate to the Fat Finder screen from the dashboard card

## Requirements

- **Pro or Business subscription** required — Free plan users see an upgrade prompt
- Each report generation uses **3 AI requests** from your monthly allowance
- Reports are **cached for 30 days** per analysis period

## Report Summary

The top of the report shows:
- **Total Potential Monthly Savings** — the combined amount you could save
- **Analysis period** — the date range analyzed
- **Number of findings** — how many opportunities were identified

## Finding Types

The AI identifies these categories of spending waste:

| Type | Description |
|---|---|
| **Subscription** | Recurring charges at similar amounts monthly (streaming, gym, SaaS tools) |
| **Recurring Splurge** | Regular non-essential spending that adds up (frequent dining out, coffee runs) |
| **Large One-Off** | Individual expenses significantly higher than your average transaction |
| **Category Excess** | Categories where spending grew more than 20% month-over-month |
| **Service Overuse** | High usage of delivery, ride-hailing, or similar services |

## Finding Details

Each finding card includes:

- **Title** — short description of the issue
- **Severity badge** — Low, Medium, or High
  - **Low** — less than 5% of total spending
  - **Medium** — 5–10% of total spending
  - **High** — more than 10% of total spending
- **Description** — detailed explanation with specific amounts
- **Current vs Suggested** — your current monthly cost compared to the AI's recommendation
- **Potential savings** — how much you'd save per month
- **Action suggestion** — a concrete, one-sentence recommendation
- **Related expenses** — expandable list of specific transactions that triggered this finding

## Actions

- **Regenerate** — force a new analysis with the latest data (costs 3 AI requests)
- **Expand/collapse** — tap findings to show or hide descriptions and related expenses

## Dashboard Card

The compact Fat Finder card on the home screen shows:
- Total potential savings prominently displayed
- Top 3 findings with severity dots and savings amounts
- **View Full Report** button to see all details

If no findings are detected, you'll see a "Looking good!" message.

## FAQ

- **Q: How often should I check the Fat Finder?**
  **A:** The report covers the current month. Check it once a month for the most relevant insights. Tap **Regenerate** to get a fresh analysis.

- **Q: Why do I see different findings each month?**
  **A:** The AI analyzes your most recent 3 months of data. As your spending patterns change, the findings will update accordingly.

- **Q: The AI flagged a necessary expense. Can I dismiss it?**
  **A:** Currently, individual findings cannot be dismissed. The AI provides suggestions — you decide which ones to act on.

- **Q: Does it work with encrypted accounts?**
  **A:** For accounts with full encryption (Tier 2), the Fat Finder cannot analyze expense descriptions, so it may produce fewer or less specific findings.

---

*See also: [Savings Goals](./18-savings-goals.md) | [Spending Story](./08-spending-story.md) | [AI Chat](./07-ai-chat.md)*
