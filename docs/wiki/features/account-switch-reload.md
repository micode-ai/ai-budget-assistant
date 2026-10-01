# Account switch reload

*Hub: [mobile-app](../mobile-app.md) · related: [web-data-loading](web-data-loading.md),
[wallet-currencies](wallet-currencies.md)*

## What this is

What happens to the account-scoped stores when the user picks another account in the
`AccountSwitcher`, and the rules that keep the new account from showing the previous one's figures.
The bug this page exists for (ABA-627): the wallet and the investment portfolio sometimes kept the
previous account's amounts after a switch.

## Entry points

- `apps/mobile/src/components/AccountSwitcher.tsx` — `handleSwitch`: `switchAccount`, then
  `hydrateTransactions`, `loadCategories`, `loadWallet`, `loadBudgets` in parallel
- `apps/mobile/src/hooks/useHomeScreenData.ts` — the `[currentAccountId]` effect (hydrate, debts,
  gamification, investment summary for an investment account)
- `apps/mobile/src/stores/accountScopedInflight.ts` — the per-account re-entry guard
- `apps/mobile/src/stores/hydrateTransactions.ts`, `expenseSync.ts` (`pullAndMergeExpenses`),
  `incomeStore.ts` (`loadIncomes`) — its users
- `apps/mobile/src/stores/walletStore.ts` (`_walletAccountId`, `loadWallet`), `walletSync.ts`
- `apps/mobile/src/stores/investmentStore.ts` (`claimAccount`, `switchedAway`)

## Key concepts

Every load reads `currentAccountId` at its start and re-checks it after each `await`
(`if (useAccountStore.getState().currentAccountId !== accountId) return`). That guard alone is not
enough, for two reasons this page records.

**Coalescing must be per account.** The loaders coalesce concurrent callers because cold start and
tab effects call them many times at once. The original guard was `if (inflight) return inflight` —
so a call made right after a switch received the PREVIOUS account's running promise, which then hit
its own account guard and returned without writing anything. The new account was never loaded.
`createAccountScopedInflight()` joins a call only to a run for the same account; a call for another
account is chained after the running one, so the last-started run is also the last to write.

**A store that holds one account's data must drop it when asked for another.** The guard prevents a
late write; it does not remove what is already on screen. `walletStore` and `investmentStore` keep a
module-level "whose data is this" id and clear their account-scoped state on the first load for a
different account.

## Invariants

- **Never coalesce an account-scoped load across accounts.** Use `createAccountScopedInflight`, not
  a bare module-level promise.
- **Guard every `set` that follows an `await`**, including the summary computations
  (`computeWalletSummary` is a network call on web) — a late answer for the old account otherwise
  overwrites the new one.
- **Clear on account change, before loading.** The web wallet summary's failure path returns "the
  current figures" on purpose (a failed load must not look like an empty one,
  [web-data-loading](web-data-loading.md)); that is only safe because `loadWallet` has already
  emptied the figures when they belonged to another account. Clearing also resets `lastPullAt`, so
  the dashboard's focus retry fires for the new account.

## Known gaps

- Other account-scoped stores (debts, budgets, gamification, alerts …) were not audited for the same
  two patterns in ABA-627.
- A stale run that returns early on the account guard may leave its own `isLoading` flag set until
  the next load for the current account.

## History

ABA-627 — per-account coalescing in hydrate/expenses/incomes; wallet and investment stores clear on
account change and guard late writes.
