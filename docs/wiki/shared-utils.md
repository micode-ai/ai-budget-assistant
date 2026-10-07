# Shared Utils

*Hub: [index](index.md) · Related: [shared-types](shared-types.md), [api](api.md), [mobile-app](mobile-app.md)*

## What this is
`packages/shared-utils` — formatting helpers, constants and a set of pure calculation functions.
In practice it is a **mobile-side** package: the app imports it at runtime, the API only for types.
Its other job is to hold the mobile mirror of each pure function whose canonical copy lives in the
API, so the app can compute the same figure offline.

## Entry points
- `packages/shared-utils/src/index.ts` — barrel over the three folders below
- `packages/shared-utils/src/formatting/index.ts` — currency/date/number formatting, period
  boundaries (`getStartOfWeek`, `getEndOfMonth`, ...), `computeBudgetPeriod`,
  `computeSafeToSpend`, and re-exports of the mirrored modules in the same folder
- `packages/shared-utils/src/constants/index.ts` — `SUPPORTED_CURRENCIES`, default categories,
  `ENCRYPTION_FIELDS`/`ENCRYPTION_CONFIG`, sync/chat config, `generateUUID`, `debounce`/`retry`
- `packages/shared-utils/src/validation/index.ts` — Zod schemas (see Known gaps)
- `scripts/check-no-shared-utils-runtime-import.sh` and the `no-restricted-imports` rule in
  `apps/api/.eslintrc.js` — the two guards that keep the API off it at runtime

## Key concepts

**The API must never import a runtime value from it.** The API has no build step for workspace
packages, so a runtime import loads the TypeScript barrel and production Node crash-loops on
`ERR_UNSUPPORTED_DIR_IMPORT` (ABA-252/253, ABA-317). `import type` is fine. A value the API needs
is copied into an API-local util. `deploy.yml` runs the shell guard before deploying, and ESLint
enforces the same rule with `allowTypeImports`.

**Deliberately duplicated pairs.** Each of these exists twice — the API copy is canonical (it is
what the server runs), the shared-utils copy is the app's offline mirror. Change both together.

| Function(s) | API (canonical) | shared-utils (mirror) | Page |
|---|---|---|---|
| `financialMonth` & co. | `apps/api/src/common/utils/financial-month.ts` | `formatting/financial-month.ts` | [budgets](features/budgets.md) |
| `projectBudgetSpend` | `apps/api/src/common/utils/budget-projection.ts` | `formatting/budget-projection.ts` | [budgets](features/budgets.md) |
| `attributeToCategories` | `apps/api/src/common/utils/category-attribution.ts` | `formatting/category-attribution.ts` | [chat-spending-questions](features/chat-spending-questions.md) |
| `buildCategorySplits` | `apps/api/src/common/utils/receipt-category-split.ts` | `formatting/receipt-category-split.ts` | [receipt-category-split](features/receipt-category-split.md) |
| `resolveWalletCurrencies` | `apps/api/src/common/utils/wallet-currencies.ts` | `formatting/wallet-currencies.ts` | [wallet-currencies](features/wallet-currencies.md) |
| `computeSafeToSpend` | `apps/api/src/modules/insights/safe-to-spend.util.ts` | `formatting/index.ts` | [safe-to-spend](features/safe-to-spend.md) |
| `normalizeProductName` | `apps/api/src/modules/merchant-rules/product-rules.service.ts` | `formatting/product-name.ts` | [shopping-list](features/shopping-list.md) |

Check which copy a spec actually exercises: the `computeSafeToSpend` block in
`safe-to-spend.service.spec.ts` `require`s the shared-utils copy, not the one the service calls.

## Invariants
- No runtime `import` of `@budget/shared-utils` under `apps/api/src` — both guards fail otherwise.
- A change to one side of a duplicated pair lands with the same change to the other side.

## Known gaps
- **The Zod schemas in `validation/index.ts` are not used by anything.** No app imports any of
  them: the API cannot (runtime import), and validates with `class-validator` DTOs plus its own
  local Zod copies where it needs one (e.g. `ScanReceiptRequestSchema` in
  `apps/api/src/modules/ai/utils/sanitize.ts`); mobile does not import them either. They are dead
  code that can drift from the DTOs unnoticed. Found in the 2026-10-07 audit, not yet removed.

## History
- ABA-252/253 — a runtime shared-utils import crashed production; ABA-317 added the deploy guard
  and the ESLint rule.
- The pairs arrived with their features: ABA-383 (financial month), ABA-523 (projection), ABA-529
  (category attribution), ABA-398 (receipt split), ABA-431 (wallet currencies), ABA-293
  (safe-to-spend), ABA-531 (product names).
- 2026-10-07 audit — rewritten: the May bootstrap claimed the API consumed the Zod schemas in
  validation pipes, which the deploy guard makes impossible.
