# Offline-first and sync

*Hub. Audited 2026-09-22 — see the note at the bottom.*

## What this is

The mobile app's two-layer data architecture: SQLite as the local truth, the API as the canonical
remote store. Writes are durable on-device immediately; reconciliation happens afterwards.

## Entry points

- `apps/mobile/src/db/schema/index.ts` — Drizzle SQLite table definitions, independent from Prisma
- `apps/mobile/src/db/client.native.ts` / `client.web.ts` — the platform drivers
- `apps/mobile/src/db/DatabaseProvider.tsx` — opens the connection at app boot
- `apps/mobile/src/db/*Repository.ts` — one per entity, each exposing CRUD over raw `executeSql()`
- `apps/mobile/src/stores/*Sync.ts` and `*Actions.ts` — **where sync actually happens**
- `apps/api/src/modules/sync/` — the server side of the generic queue (see the warning below)

## Feature pages

- [offline-first-sync](features/offline-first-sync.md) — the push convention, `SyncService`'s
  per-entity handlers, which entity types the generic queue actually accepts
- [client-id-resolution](features/client-id-resolution.md) — local id vs server primary key
- [category-id-resolution](features/category-id-resolution.md) — the category-specific story

## Key concepts

**Read path.** A store calls `loadXxx()`, which reads SQLite first and sets `isLoading = false`
immediately, then fires an API call and merges the response back into SQLite and state. That is why
a tab paints instantly from cache.

**Write path.** The write lands in SQLite with `syncStatus: 'pending'` and is pushed afterwards.

**Each store owns its own sync.** `expenseSync.ts`, `budgetSync.ts`, `shoppingListSync.ts`,
`accountTransferActions.ts` and their siblings each push through ordinary REST endpoints for their
entity. There is no single background job.

**`SyncStatus`** is `pending | synced | conflict | error`, defined in `shared-types`.

**The SQLite schema is maintained by hand** and is separate from Prisma; it must stay compatible
with API responses.

## Invariants

**The generic `/sync` queue is NOT the mobile sync path.** `POST /sync/push` and `GET /sync/pull`
exist on the server and `api.pushChanges` / `api.pullChanges` exist in the client — with **zero call
sites**. Debugging a sync failure by reading `sync.service.ts` or `syncMetadataRepository.ts` will
explain nothing: start from the store's own `*Sync.ts` instead. The server module still matters for
whatever else reaches it, but the app does not.

**Web has no SQLite.** `client.web.ts` is an in-memory mock whose reads return `[]`, so any logic
gated on a local-row count behaves as though the account were empty. Several bugs have come from
code reading a persisted value on a path only native reaches.

## Known gaps

- Two consumers of one schema that are kept in step by hand — a Prisma field change with no matching
  SQLite change fails only at runtime.
- The generic queue's dead client methods are still exported, which is what made this page wrong.

## Where to look first

A sync failure → the store's own `*Sync.ts` or `*Actions.ts`. Schema drift → compare
`apps/mobile/src/db/schema/index.ts` against `apps/api/prisma/schema.prisma`. An id that resolves on
native but not on web → [client-id-resolution](features/client-id-resolution.md).

## Audit note

Read against the code on 2026-09-22. Three claims were wrong: the repository file count (stated 14,
actually 22 — now deleted rather than updated), the endpoint (`POST /sync`, actually `POST
/sync/push` and `GET /sync/pull`), and the central one — that "a background job reads pending rows
and POSTs them", which describes a mechanism with no call sites. The old "where to look first"
section pointed at exactly the two files that cannot explain a sync failure.
