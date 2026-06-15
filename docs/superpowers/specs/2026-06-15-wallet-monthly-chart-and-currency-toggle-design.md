# Wallet Monthly-Change Chart + Currency Toggle — Design

**Date:** 2026-06-15
**Status:** Approved (design)
**Issue:** ABA-XXX (created at task finish)

## Problem

On the Wallet screen the "Balance history" chart is unreadable: `InteractiveLineChart`
renders a full currency value label on **every** data point (`dataPointText` +
`hideDataPoints={false}`), so ~10–23 daily labels overlap into garbled text. The daily
30/60/90-day granularity is also noisy. Users want to see **month-over-month change**
instead, and to **switch the display currency** directly on the Wallet screen (the total
is locked to `user.currencyCode`, e.g. PLN).

## Decisions (from brainstorm)

1. Chart shows **monthly change as signed bars** (green ≥0 / red <0), one bar per month,
   not a daily line and not monthly snapshots.
2. Currency switch is **wallet-local** — changes only the Wallet total + chart display,
   not the global `user.currencyCode`.
3. FX conversion uses **current rates** (consistent with the rest of the app; historical
   FX is out of scope — an accepted approximation).
4. The wallet currency toggle is **not persisted** — it resets to the base currency
   (`user.currencyCode`) on screen re-entry.

## A. API — monthly net-change endpoint

`apps/api/src/modules/wallet/`:

- New `WalletService.getMonthlyBalanceHistory(accountId, months)`:
  - Window = last N months (default 6, capped 1–12), starting at the first day of
    `(currentMonth − (N−1))`.
  - Sums **net delta per currency per calendar month** from the same sources as the
    daily `getBalanceHistory`: income (+), expense (−), currency exchange (− from / +
    to), transfers out (−) / in (+, `countAsIncome:false`).
  - Returns `{ months: Array<{ month: string /* 'YYYY-MM' */, deltas: Record<string, number> }>, currencies: string[] }`,
    one entry per month in the window (including months with zero activity → empty
    `deltas`).
- New endpoint `GET /wallet/balance-history/monthly?months=6` (class-level
  `JwtAuthGuard + AccountContextGuard`), parsing/clamping `months` like the daily route
  clamps `days`.
- **Keep** the existing daily `GET /wallet/balance-history` endpoint + service method —
  already-released app versions still call it.
- Add the response type to `packages/shared-types` (e.g. `WalletMonthlyHistoryResponse`
  with a `WalletMonthlyDeltaPoint` entry).
- Test: `wallet.service.spec.ts` (or new) — given seeded income/expense across two
  months, the per-month `deltas` are correct and the window length matches `months`.

## B. Mobile — data layer

- `apps/mobile/src/services/wallet.api.ts`: `getWalletMonthlyHistory(months: number)` →
  `GET /wallet/balance-history/monthly?months=`.
- `apps/mobile/src/stores/walletStore.ts`: **replace** the daily history state
  (`balanceHistory`, `selectedHistoryDays`, `loadBalanceHistory`) with:
  - `monthlyHistory: WalletMonthlyDeltaPoint[]`
  - `selectedMonths: 6 | 12` (default 6)
  - `isHistoryLoading: boolean` (kept)
  - `loadMonthlyHistory(months: 6 | 12): Promise<void>`
  - Update `reset()` accordingly.
  - The mobile client no longer calls the daily endpoint; remove
    `getWalletBalanceHistory` from `wallet.api.ts`.

## C. Mobile — monthly-delta bar chart

New focused component `apps/mobile/src/components/wallet/WalletMonthlyChart.tsx`:
- Wraps gifted-charts `BarChart` configured for **signed** values: negative bars below
  the x-axis (set `mostNegativeValue` / `noOfSectionsBelowXAxis` when any delta < 0).
- Per-bar `frontColor`: `success` for ≥0, `danger` for <0.
- X-axis labels = localized short month (e.g. "Jun"); value shown **only on tap**
  (tooltip), **no per-bar top label** — this removes the overlap.
- Props: `data: { month: string; value: number }[]`, `currency: string`, `height`.

Rework `WalletSparklineCard.tsx` (rename to `WalletBalanceCard.tsx`):
- Reads `monthlyHistory` from the store and a `displayCurrency` **prop** (no longer reads
  `user.currencyCode` internally).
- Converts each month's `deltas` to `displayCurrency` via `exchangeRateStore` rates
  (same `toBaseAmount` helper) → one signed bar value per month.
- Header: title `wallet.balanceHistory` + a **6М / 12М** chip toggle (replaces 30/60/90),
  calling `loadMonthlyHistory`.
- Summary row above the chart: the **latest month's** signed delta
  (`wallet.monthlyChange` style, e.g. "+3 468 zł") colored green/red.
- Renders `WalletMonthlyChart`.

## D. Mobile — wallet-local currency toggle

`apps/mobile/app/wallet/index.tsx`:
- Local state `displayCurrency` (default `user.currencyCode`); **not** persisted.
- Compact currency chip row (reusing the same `SUPPORTED_CURRENCIES` list the
  `AccountSwitcher` currency chips use) placed above the total-balance card.
- Total-balance card computes the converted total in `displayCurrency` (existing
  `totalBalanceInUserCurrency` logic, parameterized by `displayCurrency`); label uses
  `displayCurrency`.
- Pass `displayCurrency` into `WalletBalanceCard`.
- Per-currency balance cards stay in their **native** currency (unchanged).
- Show the toggle + total card when `hasRates && walletSummary.length > 0`; when
  `displayCurrency` equals the only currency and there's a single currency, the converted
  total simply mirrors it.

## E. i18n

Add to all 9 locales (`en/de/es/fr/pl/ru/ua/be/nl`):
- `wallet.monthlyChange` — label for the latest-month delta summary (with `{{month}}`).
- `wallet.monthsWindow` — toggle chip label with `{{count}}` (e.g. EN `"{{count}}M"`,
  RU `"{{count}} мес."`). Used for both the 6 and 12 chips.
- `wallet.displayCurrency` — accessible label / heading for the currency chip row.
Remove `wallet.historyDays` if it is no longer referenced after the daily chip toggle is
removed (verify with a repo search first).

## F. Out of scope (YAGNI)

- Changing the **global** display currency from the Wallet (that stays on the
  AccountSwitcher / CurrencyPill).
- Persisting the wallet-local currency choice across sessions.
- Historical FX rates — monthly deltas convert at **current** rates.
- Touching the shared `InteractiveBarChart` / `InteractiveLineChart` (the wallet gets its
  own focused chart so drill-down charts are untouched).

## Notes

- No DB schema change.
- The daily server endpoint remains for backward compatibility; only the mobile client
  switches to monthly.
