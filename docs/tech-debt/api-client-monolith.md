---
id: api-client-monolith
title: Mobile ApiClient is a 1,215-line monolith with all endpoints inlined
status: open
priority: P2
module: apps/mobile
created_at: 2026-05-11
---

# Mobile ApiClient is a 1,215-line monolith with all endpoints inlined

## What's wrong

`apps/mobile/src/services/api.ts` is a 1,215-line file where a single `ApiClient` class contains methods for every API domain: auth, accounts, expenses, incomes, budgets, categories, analytics, wallets, debts, investments, reports, backups, Telegram linking, encryption, and more. Every new endpoint adds another method to the same class and file.

## Why it matters

- Adding an endpoint for a new feature requires navigating a 1,200-line file — there is no obvious section boundary.
- The import at the top of the file (line 3) already lists ~40 DTO types in a single import statement; this will keep growing.
- Because the entire API surface lives in one file, a git conflict on `api.ts` is nearly guaranteed when two features are developed in parallel.
- The class is re-exported as a singleton (`export const apiClient`), making tree-shaking impossible even if parts of it are unused in web builds.

## Proposed fix

- Split the class into domain-specific service files: `auth.api.ts`, `expenses.api.ts`, `budgets.api.ts`, etc., each using the shared base `request()` method from a slim `HttpClient` class.
- Keep `api.ts` as a barrel that re-exports the individual services and the singleton `apiClient` for backwards compatibility during the migration.
- Migrate stores one at a time to import from the domain-specific service file rather than the monolith.
- No API contract changes needed; this is mobile-internal.

## Files involved

- `apps/mobile/src/services/api.ts`
- `apps/mobile/src/stores/` (import sites to be updated incrementally)
