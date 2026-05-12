# Shared Types

## What this is
A pure TypeScript package (`packages/shared-types`) that exports entity interfaces, request/response DTOs, and API endpoint types. It is the single source of truth for the data contract between the API and the mobile app.

## Entry points
- `packages/shared-types/src/entities/index.ts` — 30+ domain interfaces (e.g., `Expense`, `Budget`, `Wallet`, `Account`)
- `packages/shared-types/src/dto/index.ts` — API request/response shapes (e.g., `CreateExpenseDto`, `ExpenseResponse`)
- `packages/shared-types/src/api/index.ts` — API endpoint type definitions
- `packages/shared-types/src/index.ts` — barrel export

## Key concepts
- **Naming conventions** — interfaces use `PascalCase`; enums use string literal unions (not TypeScript `enum` keyword)
- **Key union types** — `Currency` (`USD|EUR|PLN|GBP|UAH|RUB`), `AccountRole` (`owner|editor|viewer`), `AccountType` (`personal|business|shared|investment`), `ExpenseSource` (`manual|voice|ocr|import`), `BudgetPeriod` (`daily|weekly|monthly|yearly|custom`), `SubscriptionTier` (`free|pro|business`), `SyncStatus` (`pending|synced|conflict|error`)
- **No runtime code** — this package is types-only; no functions, no classes, no imports from Node/React

## Cross-references
- Used by: `api` — controllers and services import DTOs and entity types
- Used by: `mobile-app` — stores and repositories import entity interfaces
- Depends on: nothing (zero runtime dependencies)

## Where to look first
When adding a new field to an entity, start at `packages/shared-types/src/entities/index.ts`, then update DTOs, then propagate to API and mobile.
