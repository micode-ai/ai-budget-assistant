# Wallet balance true-up

*Hub: [api](../api.md) · [mobile-app](../mobile-app.md) · related:
[wallet-currencies](wallet-currencies.md), [account-transfers](account-transfers.md)*

## What this is

"Correct balance" on each wallet currency card: the user types the money they really have, the
server records the difference as one signed adjustment, and the wallet matches reality.

## Entry points

- `apps/api/src/modules/wallet/wallet.service.ts` — `createAdjustment`, `listAdjustments`
- `apps/api/src/modules/wallet/wallet.controller.ts` — `POST/GET /wallet/adjustments`
- `apps/api/prisma/migrations/20261025000000_wallet_adjustments`
- `apps/mobile/src/components/wallet/CorrectBalanceSheet.tsx`, mounted by `app/wallet/index.tsx`
- `apps/mobile/src/stores/walletStore.ts` — `adjustmentTotals`, `refreshAdjustments`, `addAdjustment`

## Invariants

**An adjustment is its own table, not an Expense/Income.** Every spend, budget, analytics and
safe-to-spend figure reads `Expense`/`Income`, so adjustments are excluded from all of them by
construction. Only the wallet balance formula (`buildWalletBalanceRow`, mobile `buildWalletSummary`)
adds `totalAdjustments`. Do not "fix" this by turning it into a category row.

**Kept apart from transfers and exchanges** by being a separate table and a separate balance term.

**The server computes the difference** from its own `getSummary`, so a stale phone figure cannot
write a wrong correction. Hence writing is online-only; the native offline summary still includes
adjustments via totals cached in MMKV (`adjustments:<accountId>`).

**Writes are guarded** by `ViewerBlockGuard` and `TripArchivedGuard`. A zero difference writes
nothing. The currency must already be a wallet currency of the account.

## Known gaps

- No offline write queue for the correction itself.
- The monthly history API returns `adjustments` per month, but the chart does not yet draw them in
  their own colour.
- The "untracked this month" message appears in the sheet after saving; it is not persisted.

## History

- [ABA-692](https://github.com/micode-ai/ai-budget-assistant/issues/724) — built from the product idea `wallet-balance-true-up`.
