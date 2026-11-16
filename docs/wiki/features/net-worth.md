# Net worth

*Hub: [analytics-insights](../analytics-insights.md) · related: [wallet-balance-history](wallet-balance-history.md), [display-currency-conversion](display-currency-conversion.md)*

## What this is

"How much do I have in total": cash + investments + money owed to the user − the user's debts, across
every account the user belongs to, now and at the last 12 month-ends, in the display currency. The home
Net Capital widget (the current account's wallet only) stays and opens this screen.

## Entry points

- API: `apps/api/src/modules/insights/net-worth.service.ts`, `net-worth.controller.ts` (`GET /net-worth?exclude=`),
  pure `net-worth.util.ts`, tests `net-worth.spec.ts`
- App: `app/net-worth.tsx` → `src/components/net-worth/NetWorthView.tsx`; `src/features/net-worth/useNetWorth.ts`,
  `netWorthDisplay.ts`; entries: `NetCapitalWidget` (tap) and `discoveryItems.ts` (`net-worth`)
- Design: `docs/superpowers/specs/2026-11-16-net-worth-design.md`

## Key concepts

**History is rebuilt, not stored.** A month-end's wallet balance is today's balance minus every movement
dated after it — the same six sources as `buildWalletBalanceRow` (incomes, non-planned expenses, both legs
of exchanges, transfers out, transfers in without `countAsIncome`, adjustments by `createdAt`). Holdings are
rebuilt from `InvestmentTransaction`; a holding entered as a bare quantity counts from its `createdAt`. The
price is the last `AssetPriceHistory` close on or before the date, else average cost and the month is
`approximate`. Debts count from their date, minus repayments made by then, never below zero.

**Conversion per month.** A past month converts at that month's ECB closing rates
(`HistoricalRateService.getMonthEndRates`), today at current rates; an unknown rate leaves the amount out
and sets `fxApproximate`.

**Scope is the user, not the account.** The controller has no `AccountContextGuard`. `exclude` lists ids the
user switched off (stored per user in MMKV on the device); an id the caller is not a member of can never be
summed because only memberships are enumerated. Accounts at `encryptionTier >= 2` are listed, never summed.

## Invariants

- Never read `req.accountId` here, and never trust `exclude` as an allow-list — memberships are the scope.
- The movement sources must stay identical to `buildWalletBalanceRow`, or the history and today's figure
  stop meeting at the current month.
- Investments use the stored `Asset.currentPrice`; no Twelve Data call on this path (rate limits).

## Known gaps

- Cache is TTL-only (10 min); a write does not invalidate it.
- No manual assets (property, car) and no goal-savings line.
- A shared account counts in every member's figure unless switched off — by design, with the hint on screen.

## History

[ABA-799](https://github.com/micode-ai/ai-budget-assistant/issues/837) — the endpoint, the history, the screen.
