---
agent: aba-db-engineer
title: 'Fix soft-delete invariant — deletedAt does not exist in codebase'
status: proposed
conflict: false
created_at: 2026-05-12
---

## What's wrong

Invariant #4 in the agent file states: "existing tables use `isDeleted` (bool) + `deletedAt` (nullable timestamp). New tables that need soft-delete must follow the same shape."

However, `deletedAt` does not exist anywhere in the codebase:
- `grep deletedAt apps/api/prisma/schema.prisma` → no matches
- The full `apps/mobile/src/db/schema/index.ts` (159 lines) contains no `deletedAt` column in any table

The actual soft-delete pattern used across all 18+ Prisma models that have soft delete is `isDeleted Boolean @default(false) @map("is_deleted")` — no timestamp companion.

## Proposed change

- Replace invariant #4 with: "existing tables use `isDeleted` (bool) only — there is **no** `deletedAt` column in this codebase. New tables that need soft-delete must follow this shape."
- Remove any reference to `deletedAt` as a required companion field.
- Optionally add a note: "If a future table needs tombstone timestamps, introduce a migration to add `deletedAt` explicitly and update this invariant — do not assume it already exists."

## Rationale

Following the current invariant would cause a new db engineer to add a `deletedAt` column that no service or repository code reads, polluting the schema with a dead column and potentially failing NOT NULL constraints if the migration is written expecting the column to be backfilled by application code that does not exist.
