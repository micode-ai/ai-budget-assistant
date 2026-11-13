# Offline-first writes and the sync queue

*Hub: [offline-sync](../offline-sync.md) · id handling: [client-id-resolution](client-id-resolution.md)*

## What this is

The mobile app writes to SQLite first and reconciles with the server afterwards. This page covers
the write/push convention, how `SyncService` is structured, and which entity types actually travel
through it — which is fewer than the code suggests.

## Entry points

- `apps/api/src/modules/sync/sync.service.ts` — `pushChanges`, `pullChanges`, `processChange`
- `apps/api/src/modules/sync/handlers/` — one file per entity, plus `index.ts`'s
  `SYNC_ENTITY_HANDLERS` registry
- `apps/api/src/modules/sync/sync-types.ts` — `SyncHandlerContext`, `SyncResult`
- `apps/mobile/src/stores/expenseSync.ts` — the client side of the expense pull/merge
- `apps/mobile/src/stores/hydrateTransactions.ts` — `hydrateTransactions`, `useHydrationStore`

## Key concepts

**Write local, queue, push.** A write lands in SQLite immediately and is queued via the `syncQueue`
table; the push happens when the network allows. `SyncService.pushChanges()` processes the
`changes[]` array in parallel batches of 10 — enough to make a large resync fast without the
contention of unbounded parallelism.

**Handlers are plain functions, not providers.** Each `process<Entity>Change` is a standalone
exported function under `handlers/`, taking a uniform `(ctx, accountId, userId, change)` shape;
`SyncHandlerContext` bundles `prisma` and the domain services so nothing needs Nest injection.
`processChange` looks the entity up in `SYNC_ENTITY_HANDLERS` rather than growing a switch.
`processRelationChange` (the junction-table types) stays inline — its branches are thin,
near-identical upserts, not independently-evolving entities.

**Local-first tab hydration.** Every list-bearing surface (the home, expenses and analytics screen
hooks, the account switcher, `DatabaseProvider`, the auth session actions) calls
`hydrateTransactions()`. It runs `loadExpenses` then `loadIncomes` **sequentially** and exposes
`useHydrationStore.isHydrating`; its own in-flight promise collapses many parallel callers into one
cycle, except that a forced call never joins a non-forced one. Each load reads SQLite first and sets `isLoading: false` at once, so a tab paints from the
local copy, then pushes pending rows and pulls. The pull is skipped inside a 30-second per-account
window (`EXPENSES_SYNC_SKIP_WINDOW_MS`, `INCOMES_SYNC_SKIP_WINDOW_MS`) unless called with
`{ force: true }` — pull-to-refresh and Settings → Data "Sync now" force it. The expense merge runs
in phases: dedup the categories/projects to upsert, decrypt all rows in parallel, build entities in
JS, then ONE `withTransaction` for every write; the `loadCategories` + `loadProjects` refresh that
follows is awaited. `categoryStore` remembers seeded accounts in a module-level set so later loads
skip the seed-and-patch pass. On web, `hydrateTransactions` additionally refreshes the wallet
summary from the server. An empty list shows a spinner while loading and the "add your first…"
state only once loading has finished.

## Invariants

**Hydrate expenses and incomes one after the other, never in parallel.** Both block the JS thread
on the single SQLite connection; run together, local reads went from about 65 ms to a spiky 65–600
ms. The server calls inside each do not contend — only the local-read phase does.

**Await the post-merge category/project reload.** Fire-and-forget made it contend with the next
hydrate cycle in the background.

**An expense is `synced` only when the server acknowledged it (ABA-749).** `syncPendingExpenses`
used to mark the row synced on any error, so an expense whose create failed never reached the
server. Now a transport failure, timeout, 429 or 5xx leaves it `pending`; only a 4xx refusal (which
no retry would change) lets it go. A row the server never acknowledged (no `serverId`) resends its
receipt lines with it, and the API writes lines on the upsert's update branch only when the row has
none — the first push may have landed with only its response lost.

**An expense delete is `pending` until the server confirms it (ABA-749).** `deleteExpense` marks the
soft-deleted row synced on success; otherwise `syncPendingExpenseDeletes` resends it at the end of
every `syncPendingExpenses` (after the creates, at most 20 per pass), a 404 counting as done. The
pull skips server rows whose local copy is a pending delete — it used to re-insert an expense deleted
offline. A one-time migration (`expense_pending_deletes_baseline`) marked the pre-ABA-749 history
synced: back then a pull re-inserted anything the server still had, so those rows were settled.
**Incomes follow the same two rules since ABA-754:** `syncPendingIncomes` marks a row synced only on
an acknowledged push (the retry test is the shared `stores/syncRetry.ts`), and `syncPendingIncomeDeletes`
(`stores/incomeSync.ts`) resends pending income deletes at the end of every pass, the pull skipping
them, with its own baseline migration (`income_pending_deletes_baseline`). A transfer's linked income
is soft-deleted as already `synced`: the server deletes it with the transfer, whose own queue retries.

**A failed push while offline is logged with `console.warn`, never `console.error`.** It is an
*expected* outcome: the row stays `pending` and re-syncs later. RN's dev LogBox renders any
`console.error` as a blocking full-screen red overlay, which users perceive as an offline-add
crash. Only genuine local-SQLite failures stay `console.error`. The `no-console` ESLint rule allows
both, so nothing catches a regression here but review.

**`processBudgetChange` and `processCategoryChange` deliberately reject the change.** Budgets and
categories go through their own REST endpoints, not this queue, so such a `SyncChange` should never
be emitted. They log an error and return `status: 'error'` — the previous silent `status: 'success'`
no-op would have marked a real change synced on the client while the server discarded it. Do not
"fix" the error return by implementing persistence unless those entities genuinely need queue sync;
the REST endpoints are the source of truth.

**Add a new sync entity as its own file plus a registry entry**, not another private method on
`SyncService`.

**Keep in-memory rows when a server fetch throws; clear them only on a successful empty response.**
A throw means offline, or a fire-and-forget create that has not landed — a just-scanned receipt
404s for a moment. A genuine delete still propagates through the empty-success path.

**A `{ force: true }` call never collapses into a non-forced cycle.** Arriving while a non-forced
hydrate runs, it queues one forced follow-up cycle behind it, shared by every forced caller that
arrives meanwhile. Handing back the in-flight promise dropped the force, so pull-to-refresh or
"Sync now" during a background hydrate pulled nothing new (ABA-626).

- **Every push write is scoped through the caller's account.** Relation rows carry no `accountId`,
  so a link delete matches `{ id, <parent>: { accountId } }` and a link create first checks that
  every referenced expense, income, tag, project or category (or a system category) is in the
  account; an expense item is looked up through `expense: { accountId }`. A row outside the account
  answers `Entity not found` like a missing one and is never returned as conflict `serverData`
  (ABA-708).

## Pending-sync status chip (ABA-722)

`PendingSyncChip` (settings hub and Settings → Data, phone and desktop pane) shows "Waiting to sync: N"
from `db/pendingSyncRepository.ts`, which counts rows with `sync_status IN ('pending','error')` per entity
table (expenses, incomes, account transfers, currency exchanges, budgets, investment transactions).
The pure rule is `features/syncStatus/pendingSyncSummary.ts`. Tap offers "Sync now" via `runManualSync`.

- **The `sync_queue` table is declared but unused** — never count it; `sync_status` is the real marker.
- Failed (`error`) rows show at once; `pending` rows only after 5 minutes, so brief offline stays quiet.
- **Soft-deleted rows are never counted** (`is_deleted = 0` in `loadPendingRows`). A delete is sent once at delete time and its row is never marked synced afterwards, while the push loops skip `isDeleted` rows, so every deleted row stays `pending` forever — counting them showed "Waiting to sync: 52" right after a successful sync ([ABA-729](https://github.com/micode-ai/ai-budget-assistant/issues/766)). The count must equal what a sync would upload. Since ABA-749 a failed expense delete stays `pending` and is resent, but the chip still does not count it; the same holds for income deletes since ABA-754.
- Web renders nothing: the SQLite mock returns no rows. Contract: `docs/contracts/pending-sync-status-indicator.md`.

## Known gaps

- `pullChanges`' merge writes `categoryId: serverCategoryId || localExpense?.categoryId`, so
  clearing a category on another device never propagates — the fallback keeps the local value.
- The queue is pumped by specific screens rather than a connectivity listener, so a queued write can
  wait for the next visit to the right screen (documented for account transfers in particular).

**First consumer of `sync_queue`:** child writes drain through the device queue, pinned to the account by an explicit `X-Account-Id` — see [child-costs](child-costs.md).

## History

ABA-152 (parallel batches of 10) · ABA-157 (warn, not error) · ABA-356 (the first real test
coverage for the handlers) · ABA-423 (budget/category changes reject instead of silently
succeeding) · ABA-468 (the 990-line service split into per-entity handler files) · ABA-708 (account scoping on relation and line-item writes) · ABA-722 (pending-sync chip) · ABA-749 (expense push and delete retry) · [ABA-754](https://github.com/micode-ai/ai-budget-assistant/issues/792) (the same for incomes).
