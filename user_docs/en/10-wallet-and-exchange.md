# Wallet & Currency Exchange

> Track balances in multiple currencies and exchange between them with live exchange rates. The wallet automatically updates as you add expenses and income.

## Overview

The Wallet feature lets you track your actual balances in each supported currency. As you add expenses and income, the wallet updates automatically to reflect your current financial position.

## Wallet Balances

Access the Wallet from:
- **Dashboard** — tap **See All** next to the Wallet Balances section
- **Settings** — go to Wallet > **Balances**

For each currency, you'll see:

| Field | Description |
|---|---|
| **Current Balance** | Your real-time balance in this currency |
| **Initial Balance** | The starting balance you set |
| **Total Spent** | Sum of all expenses in this currency |
| **Exchanged In** | Amount received from currency exchanges |
| **Exchanged Out** | Amount spent on currency exchanges |

The formula: **Current Balance = Initial Balance - Total Spent + Total Income + Exchanged In - Exchanged Out**

## Setting Initial Balance

Set your starting balance for each currency:

1. Go to **Settings** > **Wallet** > **Set Balance**
2. Select the **Currency** (USD, EUR, PLN, GBP, UAH, or RUB)
3. Enter the **Amount** — your current real-world balance in that currency
4. Tap **Save**

You'll see a confirmation: "Balance set successfully."

> **Tip:** Set your initial balances when you first start using the app, so the wallet accurately reflects your finances from day one.

## Currency Exchange

![Currency Exchange screen](../img/exchange.jpg)

Exchange money between your currency wallets:

### Step-by-step

1. Tap **Exchange** from the Dashboard quick actions, or go to **Settings** > **Wallet**
2. Select the **From** currency (e.g., USD) — tap a currency chip to select
3. Select the **To** currency (e.g., EUR) — tap a currency chip to select
4. Enter the amount in either the "From" or "To" field — the other auto-calculates
5. The **Exchange Rate** is fetched automatically (e.g., "1 USD = 0.8407 EUR")
6. You can tap the **swap** button (center arrows) to reverse the currencies
7. Optionally edit the exchange rate manually if you got a different rate
8. Add optional **Notes** (e.g., "Airport exchange" or "Bank transfer")
9. Tap **Exchange** to complete

### Features

- **Live exchange rates** — automatically fetched and displayed
- **Swap button** — quickly reverse From and To currencies
- **Manual rate override** — edit the rate if your actual rate differs
- **Notes field** — add context to the exchange
- **Recent Exchanges** — view your exchange history

### Recent Exchanges

Below the exchange form, you'll find a list of your recent currency exchanges with:
- Currencies exchanged (From → To)
- Amounts
- Exchange rate used
- Date
- Notes (if added)

## Supported Currencies

| Code | Currency |
|---|---|
| USD | US Dollar |
| EUR | Euro |
| PLN | Polish Zloty |
| GBP | British Pound |
| UAH | Ukrainian Hryvnia |
| RUB | Russian Ruble |

## FAQ

- **Q: Where do exchange rates come from?**
  **A:** Exchange rates are fetched from an online service and updated regularly. They represent approximate market rates.

- **Q: Can I exchange currency if I don't have enough balance?**
  **A:** The app will warn you about insufficient balance, but you can still record the exchange to keep your records accurate.

- **Q: Does a currency exchange count as an expense?**
  **A:** No. Currency exchanges are separate from expenses — they move money between currency wallets without affecting your expense totals.

---

*See also: [Dashboard](./02-dashboard.md) | [Settings](./11-settings.md)*
