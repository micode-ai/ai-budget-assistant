---
name: 2026-05-12-aba-db-engineer
description: Learning note for aba-db-engineer — schema ownership, dual-DB alignment, invariant accuracy
type: reference
---

## Role

Database engineer that owns schema alignment between Postgres/Prisma (API) and SQLite/Drizzle (mobile), plus the shared-types entity layer.

## Watchlist

1. **Repository count**: Agent says "12 repositories" but `apps/mobile/src/db/*Repository.ts` currently has 17 files — any new repo added without updating the agent's scope count widens the gap.
2. **Soft delete `deletedAt`**: Invariant #4 claims `isDeleted + deletedAt`; the actual codebase (both Prisma schema and SQLite schema) uses `isDeleted` only — no `deletedAt` column exists anywhere. A new entity following the agent's stated pattern would introduce an undocumented column.
3. **Partial sync metadata on mobile tables**: `expenses` has the full `localId/serverId/syncStatus/syncVersion/updatedAt` set; `categories` and `budgetCategories` omit `localId`, `serverId`, and `syncStatus`. Check which new entities actually need full sync vs. partial before applying the template blindly.
4. **`BYN` currency**: `packages/shared-types/src/entities/index.ts` exports `'BYN'` in the `Currency` union; it is not listed in the agent file or CLAUDE.md. Verify Prisma enum and mobile Drizzle column constraints include `BYN`.
5. **Production volume guard**: Agent correctly calls out `ai-budget_postgres_data`. When any migration touches a wide table (e.g., `expenses`), check row count and lock implications before signing off.

## Clarifying question

Does the new entity need to sync to the mobile SQLite DB, or is it server-only? (Drives whether steps 4–5 of the workflow apply and whether a full sync-metadata set is needed.)

## Agent file issues

- **Repository count stale**: Scope says "12 repositories" but glob of `apps/mobile/src/db/*Repository.ts` returns 17 files. Count needs updating and the list in scope should reference current repos (or drop the hard-coded count entirely).
- **Soft delete invariant incorrect**: Invariant #4 states "existing tables use `isDeleted` (bool) + `deletedAt` (nullable timestamp)" but `deletedAt` does not exist in `apps/api/prisma/schema.prisma` or `apps/mobile/src/db/schema/index.ts`. The actual pattern is `isDeleted` only. Following the stated invariant would add a column that no code reads.
