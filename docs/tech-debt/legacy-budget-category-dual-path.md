---
id: legacy-budget-category-dual-path
title: Budgets carry dead single-category legacy path alongside multi-category
status: open
priority: P2
module: apps/api
created_at: 2026-05-11
---

# Budgets carry dead single-category legacy path alongside multi-category

## What's wrong

`packages/shared-types/src/entities/index.ts` (line 397) and `apps/api/src/modules/budgets/budgets.service.ts` (lines 124, 239) retain a `categoryId` field and associated validation/clearing logic described as "legacy single-category mode":

```ts
// Validate categoryId for legacy single-category mode  (line 124)
// Clear legacy categoryId when using multi-category     (line 239)
categoryId?: string; // null = overall budget (legacy single-category) (entity line 397)
```

This means every budget create/update path must handle two mutually exclusive category-assignment strategies, and the entity type carries an optional field whose semantics depend on which path was used to create the budget.

## Why it matters

- Every new developer who reads the budget entity or service must understand both paths and when each applies — the comment is the only documentation.
- The clearing logic at line 239 (nulling `categoryId` when `categorySplits` are present) is a runtime invariant that is not enforced by the schema, so a malformed request could leave a budget with both fields set.
- The `categoryId` field on `Budget` leaks into the shared-types package, which means the mobile app's type model also carries the ambiguity.

## Proposed fix

- Audit whether any budget rows in production still use `categoryId` (non-null) without `categorySplits`. If none, the legacy field can be dropped via a migration.
- If some rows still rely on it, add a migration that backfills a `categorySplits` row for each legacy `categoryId` value and then nulls `categoryId`, keeping the DB clean.
- Remove the dual-path branching from `budgets.service.ts` once the backfill is verified.
- Remove `categoryId` from the shared `Budget` entity interface once the API no longer populates it.

## Files involved

- `packages/shared-types/src/entities/index.ts`
- `apps/api/src/modules/budgets/budgets.service.ts`
- `apps/api/prisma/schema.prisma` (migration needed)
