# Net Worth across all accounts — design

Approved in conversation on 2026-11-16.

## Intent

One figure for "how much do I have in total" across every account the user belongs to, with its last
12 months, so the user sees whether they are getting richer. The existing home "Net Capital" widget is
the current account's wallet only — no investments, no debts, no history — and stays as it is.

## Goals

- Net worth = cash (all wallet balances) + investments (portfolio market value) + money owed to the
  user (lent debts, remaining) − the user's debts (borrowed, remaining), in the user's display currency.
- All accounts the user is a member of, each switchable off (shared accounts would otherwise count in
  every member's figure); default all on; the choice is stored on the device.
- History: the last 12 month-ends, available immediately — no waiting for snapshots to accumulate.
- Phone and desktop web.

## Non-goals (v1)

Manual assets (property, car), goal savings as a separate line, per-holding history charts, push
notifications.

## Approaches

1. **Compute on the server on demand, cache in Redis (chosen).** Month-end wallet balance = current
   balance − movements dated after the month end; holdings quantity at the date from
   `InvestmentTransaction` × the close on or before it from `AssetPriceHistory` (average cost when
   there is none, flagged approximate); debts remaining at the date from debt rows and repayments.
   No table, no migration, history from day one.
2. Monthly snapshot table + cron — rejected: history only after months pass, needs a migration.
3. Compute on the device — rejected: the device holds only the current account's data.

## Design

- `GET /net-worth?exclude=<accountId,…>` — user-scoped (enumerates `AccountMember` like
  `GET /wallet/summaries`, still behind `JwtAuthGuard`). Excluded ids are dropped from the sum;
  every membership is still listed so the toggles can show it.
- Accounts at `encryptionTier >= 2` are listed with `encrypted: true` and contribute nothing.
- Current value: wallet via `WalletService.getSummariesForAccounts`; investments via
  `PortfolioHolding.quantity × Asset.currentPrice` (no live price call — the portfolio screen
  refreshes prices); debts via debt rows minus linked repayments.
- Conversion: today with current rates (`common/utils/fx.ts`); a past month-end with that month's
  ECB rates (`HistoricalRateService.getMonthEndRates`), falling back to current rates. An amount with
  no rate is left out and flags `fxApproximate`.
- Response: `currencyCode`, `current { cash, investments, owedToMe, debts, net }`, `history[]`
  (`month`, same parts, `approximate`), `accounts[] { id, name, type, included, encrypted, net }`,
  `fxApproximate`. Cached 1 h per user + currency + exclusion set.
- App: `NetWorthScreen` (route `app/net-worth.tsx`, header + back), shared by phone and desktop:
  hero figure, change vs last month and vs 12 months ago, the four parts, a 12-month bar chart,
  account rows with switches. The Net Capital widget opens it.

## Left to the builder

Chart styling, exact copy, cache invalidation (TTL only in v1).
