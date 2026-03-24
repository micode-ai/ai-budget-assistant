# Wallet & Currency Exchange

> Track balances in multiple currencies and exchange between them with live exchange rates. The wallet automatically updates as you add expenses and income.

## Overview

The Wallet feature lets you track your actual balances in each supported currency. As you add expenses and income, the wallet updates automatically to reflect your current financial position.

## Wallet Balances

Access the Wallet from:
- **Dashboard** — tap **See All** next to the Wallet Balances section
- **Dashboard** — tap the **Transfers** quick action button for quick access to transfers
- **Settings** — go to Wallet > **Balances**

For each currency, you'll see:

| Field | Description |
|---|---|
| **Current Balance** | Your real-time balance in this currency |
| **Initial Balance** | The starting balance you set |
| **Total Income** | Sum of all income in this currency |
| **Total Spent** | Sum of all expenses in this currency |
| **Exchanged In** | Amount received from currency exchanges |
| **Exchanged Out** | Amount spent on currency exchanges |
| **Transferred In** | Amount received from other accounts |
| **Transferred Out** | Amount sent to other accounts |

The formula: **Current Balance = Initial Balance + Total Income - Total Spent + Exchanged In - Exchanged Out + Transferred In - Transferred Out**

## Total Balance

If you hold balances in multiple currencies, the wallet displays a **Total Balance** card at the top. This card converts all your currency balances into your chosen settings currency (configured in **Settings** > **Currency**) using the latest exchange rates, giving you a single combined view of your finances.

## Setting Initial Balance

Set your starting balance for each currency:

1. Go to **Settings** > **Wallet** > **Set Balance**
2. Select the **Currency** (USD, EUR, PLN, GBP, UAH, RUB, or BYN)
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

Below the exchange form, you'll find the 5 most recent currency exchanges with:
- Currencies exchanged (From → To)
- Amounts
- Exchange rate used
- Date
- Notes (if added)

Tap **Show all** to open the full Exchange History screen.

### Exchange History

The **Exchange History** screen displays a complete list of all your currency exchanges. Access it by tapping **Show all** in the Recent Exchanges section.

Available filters:
- **Currency** — filter by a specific currency pair
- **Period** — choose from **All time**, **This month**, **Last 3 months**, or **This year**

## Account Transfers

Account transfers let you move money between different accounts — for example, from your Business account to your Personal account. This is different from a currency exchange, which converts between currencies within the same account.

### Step-by-step

1. Go to **Settings** > **Wallet** > **Transfer**
2. Select the **From Account** (the source account)
3. Select the **To Account** (the destination account)
4. Choose the **Currency**
5. Enter the **Amount** to transfer
6. If the accounts use different currencies, an **Exchange Rate** field appears — adjust it if your actual rate differs
7. Add optional **Notes** (e.g., "Monthly savings" or "Reimbursement")
8. Tap **Transfer** to complete

### Recent Transfers

Below the transfer form, you'll find the 5 most recent account transfers with:
- Source and destination accounts (From → To)
- Amount and currency
- Exchange rate (if currencies differ)
- Date
- Notes (if added)

Tap **Show all** to open the full Transfer History screen.

### Transfer History

The **Transfer History** screen displays a complete list of all your account transfers. Access it by tapping **Show all** in the Recent Transfers section.

Available filters:
- **Account** — filter by a specific source or destination account
- **Period** — choose from **All time**, **This month**, **Last 3 months**, or **This year**

## Supported Currencies

| Code | Currency |
|---|---|
| USD | US Dollar |
| EUR | Euro |
| PLN | Polish Zloty |
| GBP | British Pound |
| UAH | Ukrainian Hryvnia |
| RUB | Russian Ruble |
| BYN | Belarusian Ruble |

## FAQ

- **Q: Where do exchange rates come from?**
  **A:** Exchange rates are fetched from an online service and updated regularly. They represent approximate market rates.

- **Q: Can I exchange currency if I don't have enough balance?**
  **A:** The app will warn you about insufficient balance, but you can still record the exchange to keep your records accurate.

- **Q: Does a currency exchange count as an expense?**
  **A:** No. Currency exchanges are separate from expenses — they move money between currency wallets without affecting your expense totals.

- **Q: What's the difference between a transfer and an exchange?**
  **A:** An exchange converts between currencies within the same account. A transfer moves money between different accounts (e.g., Business to Personal).

- **Q: Does a transfer affect my wallet balance?**
  **A:** Yes. The source account's wallet decreases and the destination account's wallet increases by the transferred amounts.

---

*See also: [Dashboard](./02-dashboard.md) | [Settings](./11-settings.md)*
