# Wallet balance history

*Hub: [api](../api.md) · related: [wallet-currencies](wallet-currencies.md),
[account-transfers](account-transfers.md), [base-currency](base-currency.md)*

## What this is

The chart on the wallet screen: how much each currency's balance changed in each of the last 6 or
12 calendar months, shown as signed bars in a currency the user picks on that screen. Computed from
existing movement tables — there is no history table.

## Entry points

- `GET /wallet/balance-history/monthly?months=6` → `WalletService.getMonthlyBalanceHistory`
  (`apps/api/src/modules/wallet/wallet.service.ts`, clamped to 1–12)
- `GET /wallet/balance-history?days=30` → `WalletService.getBalanceHistory` (the older daily
  series, clamped to 1–90)
- DTOs in `packages/shared-types/src/dto/wallet.ts`: `WalletMonthlyHistoryResponse`
  (`months: WalletMonthlyDeltaPoint[]` of `{ month: 'YYYY-MM', deltas }`, `currencies`),
  `WalletBalanceHistoryResponse`
- Mobile: `walletStore.monthlyHistory` / `selectedMonths` / `loadMonthlyHistory(6 | 12)`;
  `apps/mobile/src/components/wallet/WalletBalanceCard.tsx`,
  `apps/mobile/src/components/wallet/WalletMonthlyChart.tsx`; the screen
  `apps/mobile/app/wallet/index.tsx`

## Key concepts

**Monthly net change per currency.** Incomes add, expenses subtract, currency exchanges move value
between their two currencies, outgoing transfers subtract, and incoming transfers add — only those
with `countAsIncome: false`, because a counted-as-income transfer is already present as its linked
income row. Split-receivable expense rows (`EXCLUDE_SPLIT_RECEIVABLE`) and planned expenses
(`isPlanned`) are excluded. Every month in
the window gets an entry, including empty ones.

**The daily series** derives per-currency daily snapshots by taking today's balances from
`getSummary()`, back-calculating the start as `currentBalance − rangeDelta`, and walking forward.
The current client does not call it.

**The chart.** `WalletBalanceCard` converts each month's deltas into its `displayCurrency` prop
with today's FX rates and renders a gifted-charts `BarChart` with signed bars — negatives below the
axis via `mostNegativeValue` / `noOfSectionsBelowXAxis`, green at or above zero and red below, the
value on tap and no per-bar labels (they overlapped) — plus a 6M/12M toggle and the latest month's
delta. The wallet screen's own currency chip row drives `displayCurrency` for the total card and
the chart; per-currency balance cards stay in their own currency.

## Invariants

**Keep `GET /wallet/balance-history` (daily) alive** — already-released app versions still call it.

**The wallet screen's currency toggle is local, unpersisted state** (default `user.currencyCode`,
reset on re-entry) and never writes the global base currency.

**Inbound transfers count only when `countAsIncome` is false.** Counting both would double the
inflow of every counted-as-income transfer.

**Every wallet expense aggregation excludes `isPlanned`** — `getSummary`, `getSummariesForAccounts`,
`getBalanceHistory` and `getMonthlyBalanceHistory` alike. A planned purchase from an approved
[purchase request](purchase-requests.md) has not been paid; counting it moved the balance before any
money left, and disagreed with the client-side `loadAllExpenses`, which already filtered it
(ABA-626).

**Month buckets are the stored calendar date; only "now" is timezone-aware.** Every movement `date`
(`Expense`, `Income`, `CurrencyExchange`, `AccountTransfer`) is `@db.Date` — a day at UTC midnight with
no time of day — so rows are bucketed with the UTC getters and must NOT be shifted by the user's
timezone (that would move a date-only value a day for everyone off UTC). The current month and the
N-month window come from `calendarPartsInTimezone(new Date(), req.user.timezone)` (`'UTC'` default,
unknown zone falls back to UTC), so a user already in the next month sees it. If a movement type ever
gains a real timestamp column, bucket that one with `yearMonthIdInTimezone`.

## Known gaps

- The daily series (`getBalanceHistory`) still builds its window from the server's local clock and
  keys days with `toISOString()`; it is unused by the current client and was not given the monthly
  series' timezone treatment.
- Past months are converted at today's rates, not the rates of that month.

## History

ABA-257 (daily sparkline) · ABA-258 (monthly signed bars, the wallet-local currency toggle;
`WalletBalanceCard` replaced `WalletSparklineCard`).
