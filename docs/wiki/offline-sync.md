# Offline-First Sync

## What this is
The two-layer data architecture in the mobile app: SQLite (Drizzle ORM) as the local truth, with background sync to the NestJS API. All writes are immediately durable on-device; the API acts as the canonical remote store.

## Entry points
- `apps/mobile/src/db/schema/index.ts` — Drizzle SQLite table definitions (independent from Prisma)
- `apps/mobile/src/db/client.native.ts` / `client.web.ts` — platform-specific SQLite driver setup
- `apps/mobile/src/db/DatabaseProvider.tsx` — initialises the DB connection at app boot
- `apps/mobile/src/db/*Repository.ts` — 14 repository files; each exposes CRUD via raw `executeSql()`
- `apps/api/src/modules/sync/sync.service.ts` — server-side sync conflict resolution
- `apps/api/src/modules/sync/sync.controller.ts` — `POST /sync` bulk-upsert endpoint

## Key concepts
- **Write path** — user action → `*Repository.ts` writes to SQLite → item added to `syncQueue` table with `SyncStatus = 'pending'`
- **Sync queue** — `syncMetadataRepository.ts` tracks per-table `lastSyncedAt`; a background job reads pending rows and POSTs them to `POST /sync`
- **Read path** — stores call `loadXxx()` which reads SQLite first (`isLoading = false` immediately), then fires an API call and merges the response back into SQLite and state
- **Conflict resolution** — server wins on conflict; server returns the canonical record, which overwrites the local pending version
- **`SyncStatus` enum** — `pending | synced | conflict | error` (defined in `shared-types`)
- **SQLite schema** — separate from Prisma; maintained manually in `src/db/schema/index.ts`; must be kept compatible with API responses

## Cross-references
- Talks to: `api` `sync` module via `POST /sync`
- Used by: all Zustand stores that manage entity lists (`expenseStore`, `incomeStore`, `budgetStore`, etc.)

## Where to look first
Sync failures → `apps/mobile/src/db/syncMetadataRepository.ts` and `apps/api/src/modules/sync/sync.service.ts`. Schema drift between SQLite and API → compare `apps/mobile/src/db/schema/index.ts` with `apps/api/prisma/schema.prisma`.
