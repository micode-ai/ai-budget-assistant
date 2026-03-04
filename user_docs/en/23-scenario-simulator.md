# Scenario Simulator

> Drag sliders to adjust your spending and income categories — see exactly how much your savings could change over 3, 6, or 12 months.

## Overview

The **Scenario Simulator** lets you answer "what if?" questions about your finances without touching real data. Move a slider to cut food spending by 20%, add a side-job income of 1 000 zł, and instantly see how your cumulative savings would look 6 months from now.

All calculations are local — no data is sent anywhere, and nothing is changed in your actual expense history.

## How to Access

Open the **Analytics** tab and tap the **Scenario Simulator** banner at the top of the screen.

## How the Numbers Are Calculated

The simulator uses your **last 3 months of transactions** to estimate a monthly average for each category:

```
monthly average = total for category over last 3 months ÷ 3
```

All amounts are converted to your base currency using current exchange rates.

## Adjusting Expenses

Each expense category appears with its current monthly average and a slider ranging from **−100%** to **+100%** in steps of 5%.

- Drag **left** (negative) to model spending cuts — the track turns green
- Drag **right** (positive) to model spending increases — the track turns red
- The label below the slider shows the resulting amount

## Adjusting Income

Income categories work the same way. Drag right for a pay rise, drag left for a reduction.

### Adding Extra Income

Tap **Add extra income** inside the Income section to enter a one-off source (e.g. a side project or freelance work). Enter a description and a monthly amount. You can add multiple extra-income rows.

## Projection Chart

The chart shows cumulative savings over the selected horizon:

- **Gray line** — current path (no changes)
- **Colored line** — scenario path (with your adjustments)

Use the **3 / 6 / 12 months** chips above the chart to change the projection horizon.

## Summary Cards

Three cards below the chart show the scenario totals for 3, 6, and 12 months side by side. The currently selected horizon is highlighted. Each card shows:

- Scenario cumulative savings
- Current cumulative savings (for comparison)
- Difference vs. current path

## Summary Bar (top of screen)

The card at the very top of the screen updates in real time:

| Left side | Right side |
|---|---|
| Current monthly savings | Scenario monthly savings |
| (unchanged) | ↑ or ↓ difference |

## Resetting

Tap **Reset All** at the bottom to return every slider and extra income to zero.

## FAQ

- **Q: Does changing sliders affect my real data?**
  **A:** No. The simulator is read-only — it only reads your historical data to calculate averages. Nothing is saved or changed.

- **Q: Why do the category amounts look lower than expected?**
  **A:** The amounts are a 3-month average. If you had unusually low spending in one of those months (e.g. you were away), the average will be lower.

- **Q: My income category is missing.**
  **A:** Only categories that have at least one transaction in the last 3 months appear in the simulator.

- **Q: The projection looks wrong — my savings are shown as negative.**
  **A:** If your current expenses exceed income, the baseline is already negative. The simulator shows you by how much the scenario improves or worsens that gap.

---

*See also: [Analytics](./06-analytics.md) | [Fat Finder](./19-fat-finder.md) | [Savings Goals](./18-savings-goals.md)*
