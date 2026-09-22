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

## Invariants

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

## Known gaps

- `pullChanges`' merge writes `categoryId: serverCategoryId || localExpense?.categoryId`, so
  clearing a category on another device never propagates — the fallback keeps the local value.
- The queue is pumped by specific screens rather than a connectivity listener, so a queued write can
  wait for the next visit to the right screen (documented for account transfers in particular).

## History

ABA-152 (parallel batches of 10) · ABA-157 (warn, not error) · ABA-356 (the first real test
coverage for the handlers) · ABA-423 (budget/category changes reject instead of silently
succeeding) · ABA-468 (the 990-line service split into per-entity handler files).
