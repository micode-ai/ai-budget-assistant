# Wallet currencies

*Hub: [api](../api.md) · [mobile-app](../mobile-app.md) · related:
[account-transfers](account-transfers.md), [web-data-loading](web-data-loading.md)*

## What this is

Which currencies the wallet shows a balance card for. Every currency an account actually holds
money in, not only the ones someone set an initial balance for.

## Entry points

- `apps/api/src/common/utils/wallet-currencies.ts` — `resolveWalletCurrencies` · mirror
  `packages/shared-utils/src/formatting/wallet-currencies.ts`, consumed by
  `apps/mobile/src/features/wallet/walletSummary.ts`
- `apps/api/src/modules/wallet/wallet-currency.service.ts` — `ensureCurrencies`, in its own
  `WalletCurrencyModule`
- `apps/api/src/modules/wallet/wallet.service.ts` — `getSummary`, `getSummariesForAccounts`
- Migration `20260821120000_backfill_wallet_currency_rows`

## Key concepts

**The bug was the normal state.** Cards rendered one per `wallet_balances` row, and that table is
written only by the "set balance" screen. A production shared account holding 124 484 USD of
income showed just its PLN card; 36 of the ~43 account+currency pairs holding money prod-wide had no
row at all. The monthly chart, which always derived currencies from transactions, showed USD on the
same screen.

**Three copies of the card list, all fixed**: `getSummary` (wallet screen),
`getSummariesForAccounts` (the transfer form's `Available:` line), and the mobile
`computeWalletSummary`, which computes its own summary locally — the one the phone actually renders.

## Invariants

**Visible = live rows ∪ currencies with movements that have NO row at all.** A currency whose only
row is **soft-deleted stays hidden even with movements** — that row is the user hiding it, and
hiding must survive the next transaction in that currency. That is why the set is not simply
re-derived from movements on every read, and why the existence lookup must **not** filter
`isDeleted`.

**A deliberately duplicated pair.** The API has no build step and must not import
`@budget/shared-utils` at runtime; the same rule table lives on both sides.

**`ensureCurrencies` never throws and runs outside any `$transaction`.** Every caller is
fire-and-forget, and a constraint violation would abort a surrounding Postgres transaction
(ABA-313/401). It is idempotent via `createMany({ skipDuplicates: true })`.

**The fallback user is the owner, filtered, not sorted.** `wallet_balances.user_id` is NOT NULL and
the read path does not always know who is asking (`SafeToSpendService` calls `getSummary` with no
user). Use `where: { role: 'owner' }`, never `orderBy: { role }` — alphabetically `editor` sorts
ahead of `owner`.

**Called from both write and read paths, on purpose.** On write from
`ExpenseCreatedHooksService.onExpenseCreated` and `IncomesService.create`; on read, fire-and-forget,
from `getSummary` itself — so a write path nobody instrumented (import commits, the subscription
auto-charge cron, debts, anything later) still displays correctly. Do not drop the read-side
derivation because the writes now cover it.

**The backfill does not resurrect a hidden currency** — its `NOT EXISTS` has no `isDeleted` filter.
It was verified against prod inside a rolled-back transaction (`INSERT 0 36`).

## History

ABA-431.
