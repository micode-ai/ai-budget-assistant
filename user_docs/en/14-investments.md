# Investment Portfolio

Track your investment portfolio with real-time market prices. Monitor stocks, ETFs, cryptocurrencies, bonds, and commodities all in one place.

## Overview

The Investment Portfolio feature allows you to:

- Track holdings across multiple asset types
- View real-time prices and portfolio value
- Analyze performance over different time periods
- Compare your returns against market benchmarks (SPY, QQQ, DIA, IWM)
- Record buy/sell transactions with fees

## Creating an Investment Account

Investment tracking requires a dedicated **Investment** account type:

1. Go to **Accounts** tab
2. Tap **Create Account**
3. Select **Investment** as the account type
4. Name your portfolio (e.g., "Main Portfolio", "Retirement")
5. Tap **Create**

## Adding Holdings

### Searching for Assets

1. Open your Investment account
2. Tap **Add Holding**
3. Search by ticker symbol (e.g., "AAPL") or company name (e.g., "Apple")
4. Select the correct asset from search results
5. Add optional notes
6. Tap **Save**

### Supported Asset Types

| Type | Examples |
|------|----------|
| Stocks | AAPL, MSFT, GOOGL |
| ETFs | SPY, QQQ, VTI |
| Crypto | BTC, ETH, SOL |
| Bonds | Government and corporate bonds |
| Commodities | Gold, Silver, Oil |

## Recording Transactions

After adding a holding, record your buy/sell transactions:

1. Open the holding details
2. Tap **Add Transaction**
3. Select transaction type: **Buy** or **Sell**
4. Enter:
   - **Quantity** — number of shares/units
   - **Price per Unit** — purchase/sale price
   - **Fee** — broker commission (optional)
   - **Date** — transaction date
   - **Notes** — any additional info (optional)
5. Tap **Save**

The app automatically calculates:
- **Average Cost Basis** — weighted average purchase price
- **Total Invested** — sum of all purchases minus sales
- **Current P&L** — profit/loss based on current price

## Portfolio Summary

The main investment screen shows:

- **Total Value** — current market value of all holdings
- **Total P&L** — overall profit/loss amount
- **Total P&L %** — percentage return
- **Day Change** — today's value change

Each holding displays:
- Current price and daily change
- Your quantity and average cost
- Individual P&L and allocation percentage

## Analytics

Access detailed portfolio analytics:

1. Tap **Analytics** button
2. Select time period: 1W, 1M, 3M, 1Y, or All

### Performance Chart

Shows portfolio value over time compared to invested amount. The area between represents your gains or losses.

### Allocation by Type

Visualizes how your portfolio is distributed across asset types (stocks, ETFs, crypto, etc.).

### Top Gainers & Losers

Lists your best and worst performing holdings by percentage return.

### AI Portfolio Insights (Pro+)

Get AI-powered analysis of your portfolio with actionable recommendations:

1. Open **Analytics** tab
2. Scroll to the **Insights** carousel at the top
3. Swipe left/right to view different insights
4. Tap the dismiss button to hide an insight

**Insight Types:**

| Type | Description |
|------|-------------|
| Concentration Risk | Warns when one asset dominates your portfolio |
| Sector Imbalance | Alerts when heavily weighted to one asset type |
| Underperformer | Identifies assets lagging the market |
| Overperformer | Highlights rebalancing opportunities |
| Benchmark Deviation | Shows when portfolio strays from benchmark |
| Diversification Gap | Suggests missing asset types |
| Cost Basis Alert | Tax-relevant unrealized gains/losses |
| Fee Impact | Warns when fees eat into returns |

Each insight includes a visualization (chart) and actionable suggestion.

**Note:** AI insights are cached for 24 hours and cost 2.5 AI credits per refresh.

### Benchmark Comparison (Pro+)

Compare your portfolio returns against market indices:

| Benchmark | Description |
|-----------|-------------|
| SPY | S&P 500 Index |
| QQQ | Nasdaq 100 Index |
| DIA | Dow Jones Industrial |
| IWM | Russell 2000 (Small Cap) |

**Understanding the comparison:**
- **Portfolio Return** — your actual percentage gain/loss
- **Benchmark Return** — index performance for the same period
- **Difference** — how much you outperformed or underperformed

## Understanding Calculations

Tap any analytics card to see the formula explanation:

### Performance
```
Return % = ((End Value - Start Value) / Start Value) x 100
```

### P&L (Profit & Loss)
```
P&L = Current Value - Total Invested
P&L % = (P&L / Total Invested) x 100
```

### Allocation
```
Allocation % = (Asset Value / Total Portfolio Value) x 100
```

## Price Updates

- Prices update automatically every 15 minutes
- Tap **Refresh** button to update immediately
- Historical prices are cached to minimize data usage

## Tips

1. **Diversify tracking** — Add all your investments for a complete picture
2. **Record fees** — Include broker commissions for accurate P&L
3. **Use benchmarks** — Compare against indices to measure performance
4. **Review regularly** — Check analytics weekly to spot trends

## Limitations

- Price data is provided by Twelve Data API
- Some exotic securities may not be available
- Historical data limited by market trading days
- Real-time prices may have a 15-minute delay

---

[Previous: Achievements & Gamification](./13-gamification.md) | [Back to Index](./00-index.md)
