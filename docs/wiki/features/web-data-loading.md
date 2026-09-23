# Web data loading

*Hub: [mobile-app](../mobile-app.md) · [offline-sync](../offline-sync.md) · related:
[desktop-dashboard](desktop-dashboard.md), [client-id-resolution](client-id-resolution.md)*

## What this is

How the web build gets its data when it has no local database, and the six defects that came from
code written for a phone that always has one. Every one of them looked correct on native, because
SQLite papered over it there.

## Entry points

- `apps/mobile/src/db/client.web.ts` — the in-memory no-op mock that makes every SQLite read empty
- `apps/mobile/src/stores/accountStore.ts` — `loadAccountsFromServer`, `ensureAccountsLoaded`,
  `lastAccountKey`, `clearAccountScopedCaches`
- `apps/mobile/src/stores/walletStore.ts` — `computeWalletSummary` (platform branch) and
  `computeWalletSummaryLocal`
- `apps/mobile/src/stores/categoryStore.ts` — `loadCategories`, `reset`
- `apps/mobile/src/stores/expenseSync.ts` — `resetExpenseSyncThrottle`
- `apps/mobile/src/stores/incomeStore.ts` — the income sync throttle, cleared in `reset()`
- `apps/mobile/src/hooks/useHomeScreenData.ts` — the focus-effect retries
- `apps/mobile/src/services/secureStorage.web.ts` — `localStorage`; survives a reload
- `docs/ops/api-rate-limit.md` — the proxy throttle runbook

## Key concepts

**On web, local reads are always empty.** `db/client.web.ts` is a mock, so code shaped
`if (localRows.length === 0) { fetchFromServer(); return; }` never reaches anything written after
that branch, and anything that counts local rows reads as an empty account. The in-memory stores
are the only data, they are rebuilt from the network on every page load, and nothing retries a
request that failed.

**Native short-circuits most of this.** SQLite holds the whole account and works offline, so a
failed pull there is invisible rather than absent. That asymmetry is why each of these bugs was
reported from web and why the phone "always looked right".

## Invariants

**A failed load and a successful empty load must never leave the same state.** This is the rule
behind three separate fixes (ABA-506, ABA-518, ABA-519):

- A failed `GET /accounts` used to leave `accounts: []` and `currentAccountId: null`. That null is
  not inert: `api.setAccountIdGetter` omits `X-Account-Id` for it, and `AccountContextGuard` then
  **falls back to the user's `defaultAccountId`**, so every later request silently answered for a
  different account. The `catch` now restores `currentAccountId` from `secureStorage` when (and only
  when) it is null, and `ensureAccountsLoaded()` — called by `AccountSwitcher` as the menu opens —
  re-fetches only when the list is empty and no load is in flight. Opening the empty menu is itself
  the retry.
- A failed wallet fetch returns the **current** summary, never `[]`, so the caller's `set` is a
  no-op and a dropped request leaves what is on screen.
- A failed `GET /categories` used to fall into the default-seeding loop and end with
  `isInitialized: true` on an empty list. That flag disables **all nine** retry points in the app
  (each shaped `if (!categoriesInitialized) loadCategories()`), so one dropped request left the whole
  app category-less for the session — surfacing as a budget card whose every allocation read
  "Uncategorized". On web an empty list at the tail now returns without marking the account seeded
  or the store initialized, and the fast path never trades a populated in-memory list for an empty
  local read.

**Read persisted state on the path that actually runs on web.** `loadAccounts` read the persisted
`currentAccountId` after a local-rows branch that web never passes, so the chosen account reset on
every refresh (ABA-498). `loadAccountsFromServer` resolves `currentAccountId ?? stored value` —
**in-memory first**, because its other callers (accepting an invitation, "Sync now") run with a live
selection a staler stored value must not override — and re-persists when the stored account is
gone.

**On web the wallet balance comes from the server, not a local sum (ABA-518).** The local
computation reconstructs each currency from four inputs (`initialAmount`, incomes, expenses,
exchanges, transfers); on web those are four independent network pulls and the figure was computed
inside the same batch that loads them, so it was built from `0 + incomes - 0` and never recomputed.
Measured live, the "balances" were exactly that account's `totalIncomes`. Patching one source cannot
make a four-source reconstruction reliable, so web now returns `api.getWalletSummary()`, which
already applies `EXCLUDE_SPLIT_RECEIVABLE`. Native keeps `computeWalletSummaryLocal`.

**Retry on "the server has never answered", not on "the list is empty".** `budgetStore` and
`walletStore` carry `lastPullAt`, set only on a successful pull and cleared in `reset()`, and the
dashboard's focus effect retries only when it is `null`. An account may legitimately have no
budgets; retrying on emptiness would be a request per visit forever. The same effect retries
`loadCategories()` on `!isInitialized`, because the dashboard renders category names but loads none
itself — the other retry points sit behind forms. Read through `.getState()` so the effect keeps
its dependencies.

**Clear module-scope caches from inside `reset()` (ABA-520).** Three markers live in module scope:
the expense and income 30-second "synced recently" throttles and `categoryStore`'s seeded-accounts
set. Sign out and back in within 30 seconds and the store was empty, the local DB was wiped by
`clearAllExpenses()`, and the throttle still said "fresh" — so the first pull returned without
requesting anything. This is **not web-only**: the wipe happens on every platform, web just has no
copy to mask it. Resetting from `reset()` rather than from the logout action means a future
teardown path cannot forget. The in-flight promise is deliberately **not** cleared; it has its own
account guards and dropping the reference would let a second pull run beside it.

**Every account-scoped store needs a `reset()` and a place in `clearAccountScopedCaches`.**
`categoryStore` had none, which also leaked the previous user's category names to whoever signed in
next on that browser. Adding a store to `clearAccountScopedCaches` breaks the suites that import
`accountStore` (the real store pulls in `authStore`, which wires `api.setLogoutHandler` at module
scope) — each needs a `jest.mock` exposing `reset`. The resulting `accountStore ↔ categoryStore`
cycle is fine: nothing is dereferenced at module scope.

**Remember the active account per user, and validate it (ABA-519).** Logout removes the live
`currentAccountId` on purpose — on a shared browser the next person must not inherit it — so a
multi-account user was moved to their default on every sign-in. The fix is `lastAccountKey(userId)`
(`lastAccountId:<userId>`), written by both `switchAccount` **and** `initialize` (so a user who never
touches the switcher is still remembered) and applied only after checking the id is still in that
user's account list. Namespacing by user is what lets both rules hold at once. The key survives
logout; an account id alone grants nothing. When the user id is unresolvable, `switchAccount` does
not remember, rather than write a key another user could pick up.

## The invisible `Failed to fetch` (ABA-522)

The startup failures behind the three bugs above were investigated three times and written up as
"not explained" each time, because the cause was outside the app. The dashboard's cold start is a
burst of ~30–40 requests; every account-scoped GET carries `Authorization` + `X-Account-Id`, so each
is a non-simple CORS request with an `OPTIONS` preflight, roughly doubling the count. Against the old
proxy limit of `10r/s` + `burst=20`, everything past the 20th was rejected — and **an
nginx-generated error carries no CORS headers**, so the browser may not show it and reports
`TypeError: Failed to fetch` with no status. A throttled request and a dead network are
indistinguishable from the client. Native makes no preflights and has SQLite, so it never showed.

Fixed on the VPS, not in this repo: `30r/s` + `burst=60`, preflights given an empty limit key so
they are skipped, and a JSON 429 carrying `Access-Control-Allow-Origin` from a named location only
(in `location /` it would duplicate the API's own header and break every successful response). The
runbook covers the traps in applying it: the config is a single-file bind mount, so `sed -i` leaves
the container reading the old inode; neither `nginx -s reload` nor `SIGHUP` cycled the workers; and
`nginx -t` passing proves nothing about whether an edit landed. **If an opaque `Failed to fetch`
reappears, check this first.**

## Known gaps

- The dashboard still fires more than twenty endpoints at once on a cold start. The raised ceiling
  makes it survivable, not reasonable; batching or staggering is the real fix.
- The 429 path is deployed but has never been observed firing.
- On web, the wallet figure after an add-exchange/transfer/initial-balance comes from the server and
  can lag one refresh behind a fire-and-forget write.

## History

ABA-498 (selection lost on refresh) · ABA-506 (failed account list) · ABA-518 (wallet
reconstruction, budget retry) · ABA-519 (remembered account, categories after a failed fetch) ·
ABA-520 (module-scope caches) · ABA-522 (proxy rate limit). The dashboard's own readiness rules
(ABA-521) are on [desktop-dashboard](desktop-dashboard.md).
