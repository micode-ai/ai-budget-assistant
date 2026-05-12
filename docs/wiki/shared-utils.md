# Shared Utils

## What this is
A shared TypeScript utility package (`packages/shared-utils`) providing Zod validation schemas, formatting helpers, and constants used by both the API and the mobile app.

## Entry points
- `packages/shared-utils/src/validation/index.ts` — Zod schemas for auth, expenses, incomes, budgets, categories, tags, projects, sync
- `packages/shared-utils/src/formatting/index.ts` — currency/date/number formatting helpers
- `packages/shared-utils/src/constants/index.ts` — shared constants (e.g., supported currencies, default limits)
- `packages/shared-utils/src/index.ts` — barrel export

## Key concepts
- **Zod schemas** — the API uses these in NestJS pipes; the mobile app uses them for client-side validation before submitting forms
- **Formatting helpers** — thin wrappers for `Intl.NumberFormat` and `Intl.DateTimeFormat` with locale awareness
- **Constants** — things like `SUPPORTED_CURRENCIES`, `MAX_BUDGET_NAME_LENGTH`, shared between both sides to avoid drift

## Cross-references
- Used by: `api` — validation pipes consume Zod schemas in NestJS DTO validation
- Used by: `mobile-app` — form validation and display formatting

## Where to look first
For a validation bug, start at `packages/shared-utils/src/validation/index.ts`. For formatting inconsistencies between API and mobile, check `packages/shared-utils/src/formatting/index.ts`.
