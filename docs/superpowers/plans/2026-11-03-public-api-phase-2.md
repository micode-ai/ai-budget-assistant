# Public API Phase 2 (Incomes, Budgets, Analytics) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open incomes, budgets and three analytics summaries on `/public/v1`, on the existing OAuth platform.

**Architecture:** New resources are siblings of the phase 1 expense files in
`apps/api/src/modules/public-api/` (query + mapper + DTO + write adapter + controller per
resource). Writes go through `IncomesService`/`BudgetsService`; analytics is a new
`PublicAnalyticsService` that converts each row with `common/utils/fx.ts` and attributes splits with
`attributeToCategories` — never the internal `AnalyticsService`.

**Tech Stack:** NestJS 10, Prisma 5, class-validator, @nestjs/swagger, Jest; Expo app for consent
labels and "Added via" on income detail.

**Spec:** `docs/superpowers/specs/2026-11-03-public-api-phase-2-design.md` — read it before any
task. Platform rules: `docs/wiki/features/public-api.md` (Invariants).

## Global Constraints

- Every `/public/v1` route: class-level `@UseGuards(PublicApiEnabledGuard, PublicApiAuthGuard)`,
  `@UseFilters(PublicApiExceptionFilter)`, `@ApiAccountHeader()`; method-level `@RequireScopes(...)`
  + `@ApiOAuth2([...], 'oauth2')` + `@ApiOperation({ operationId })` + `@ApiPublicErrors(...)`;
  every mutating route `@PublicWrite()`. Never `@TokenOnly()`/`@ConnectionLevel()` on new routes.
- Literal sub-paths (`changes`) are declared BEFORE `@Get(':id')`.
- Money is a string with 2 decimals (`Decimal.toFixed(2)`), dates `YYYY-MM-DD`, timestamps ISO,
  field names snake_case — same as `PublicExpense`.
- Errors are `PublicApiError(status, code, message, details?)`; validation is `422 validation_failed`
  with `details.fields.<field>: string[]`.
- No runtime import of `@budget/shared-utils` in `apps/api/src` (type imports only).
- A `schema.prisma` change lands with its migration in the same commit.
- Swagger schema class names are frozen once published: `PublicIncome`, `PublicIncomeList`,
  `PublicIncomeChanges`, `PublicBudget`, `PublicBudgetList`, `PublicBudgetProgress`,
  `PublicBudgetAllocation`, `PublicAnalyticsSummary`, `PublicAnalyticsByCategory`,
  `PublicAnalyticsMonthly`.
- New i18n keys in all 9 mobile locales (`en de es fr pl ru ua be nl`); API doc texts in en/pl/ru.
- Commit messages: English, prefix `ABA-{N}` (one issue for the whole phase, created in Task 9;
  until then use `Public API phase 2:`), squashed into one commit before push.
- Tests run from `apps/api`: `npx jest <path>`; e2e `npm run test:e2e -- public-api`.

## Review Focus

1. **Mixed currencies with an unknown rate** — the row is excluded from every analytics figure and
   `fx_approximate: true`; never summed raw. Test in Task 7.
2. **Date bounds** — `to` is inclusive for a `@db.Date` row dated exactly `to`; `from > to` is
   `422`. Tests in Task 4 (income list) and Task 7.
3. **An `Idempotency-Key` reused across resources or apps** — a key already used by another app's
   income is `409`; the same UUID used for an expense and an income is two independent rows (separate
   tables). Tests in Task 5 and Task 6 (budget).
4. **Tier-1 account** — analytics `category_name: null` + listed, income `search` refused `403`,
   income/budget writes `403 account_encrypted`, budget `name` null. Tests in Tasks 4, 5, 6, 7.
5. **Transfer-linked or debt-repayment income edited by an app** — transfer-linked: `422` on PATCH
   and DELETE; repayment: amount editable, `is_debt*` fields absent from the update DTO (unknown
   field → `422` via `forbidNonWhitelisted`). Test in Task 5.

---

### Task 1: Scopes and consent labels

**Files:**
- Modify: `apps/api/src/modules/oauth/oauth-scopes.ts:1`
- Modify: `apps/api/src/modules/oauth/oauth-scopes.spec.ts`
- Modify: `apps/api/src/modules/public-api/docs/texts.{en,pl,ru}.ts` (`scope.<name>` lines)
- Modify: `apps/mobile/src/features/oauth-consent/consentDisplay.ts:12-30` (`SCOPE_LABEL_KEYS`, `SCOPE_ICONS`)
- Modify: `apps/mobile/src/services/oauth.api.ts` (the scope union type, if it lists scopes)
- Modify: `apps/mobile/src/i18n/locales/*.ts` (9 files, `oauthConsent.scopes.*`)

**Interfaces:**
- Produces: `PublicScope` now includes `'incomes:read' | 'incomes:write' | 'budgets:read' | 'budgets:write' | 'analytics:read'`.

- [ ] **Step 1: Failing test** in `oauth-scopes.spec.ts`: `parseScopeParam('incomes:read incomes:write budgets:read budgets:write analytics:read')` returns those five in order; `parseScopeParam('analytics:write')` throws `InvalidScopeError`.
- [ ] **Step 2:** `npx jest src/modules/oauth/oauth-scopes.spec.ts` → FAIL (unknown scope).
- [ ] **Step 3:** Append the five scopes to `PUBLIC_SCOPES` (order: after `categories:read`, as listed).
- [ ] **Step 4:** Add `scope.<name>` doc texts in en/pl/ru; `texts.spec.ts` already checks every scope has a text — run it. The `analytics:read` text must say it reveals **totals of income and spending**; `budgets:read` says "budgets and how much of each is spent".
- [ ] **Step 5:** Mobile: label keys `incomesRead`, `incomesWrite`, `budgetsRead`, `budgetsWrite`, `analyticsRead`; icons `cash-plus`, `cash-plus`, `chart-donut`, `chart-donut`, `chart-bar` (MaterialCommunityIcons names already used in the app — pick existing `IconName`s if these are not). Copy in 9 locales (use the `i18n-add-strings` skill); same disclosure wording as Step 4.
- [ ] **Step 6:** `npx jest src/modules/oauth src/modules/public-api/docs` (api) and `npx jest src/features/oauth-consent` (mobile) → PASS; `npm run typecheck` → clean.
- [ ] **Step 7: Commit** `Public API phase 2: scopes and consent labels`.

### Task 2: Schema, attribution and income touch

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`Income`, `Budget`, `OAuthClient` back-relations)
- Create: `apps/api/prisma/migrations/20261103000000_public_api_phase2/migration.sql`
- Modify: `packages/shared-types/src/entities/primitives.ts:8` (`IncomeSource` += `'api'`)
- Modify: `apps/api/src/modules/incomes/incomes.service.ts:59` (create signature), its update paths at ~296/326
- Create: `apps/api/src/modules/incomes/income-touch.util.ts` + `.spec.ts`
- Modify: `apps/api/src/modules/tags/tags.service.ts:205,245`, `projects/projects.service.ts:281,323`, `sync/sync.service.ts:114-150` (income child writes)
- Modify: `apps/api/src/modules/budgets/budgets.service.ts` (create signature)
- Modify: `apps/api/src/modules/incomes/incomes.service.ts` `toIncomeResponse` (strip the scalar, expose `createdByApp`)

**Interfaces:**
- Produces:
  - `Income.createdByOAuthClientId String? @map("created_by_oauth_client_id")` + relation to `OAuthClient` (`onDelete: SetNull`); same on `Budget`.
  - Index `@@index([accountId, updatedAt, id])` on `Income` (feed keyset).
  - `IncomesService.create(accountId: string, userId: string, dto: CreateIncomeDto, opts?: { createdByOAuthClientId?: string })` — sets the column on the upsert's `create` branch only. Return value unchanged.
  - `BudgetsService.create(accountId: string, userId: string, dto: any, opts?: { createdByOAuthClientId?: string })` — same rule.
  - `touchIncomes(client: Pick<PrismaClient,'income'> | Pick<Prisma.TransactionClient,'income'>, accountId: string, where: Omit<Prisma.IncomeWhereInput,'accountId'>): Promise<void>` — identical contract to `touchExpenses` (account-filtered `updateMany`, refuses an `undefined` filter value, never touches `syncVersion`).
  - Income app response carries `createdByApp: { clientId: string; name: string } | null`, never `createdByOAuthClientId`.

- [ ] **Step 1: Failing tests:** `income-touch.util.spec.ts` mirrors `expense-touch.util.spec.ts` (filters by accountId; no-op on `{ id: undefined }`; data is only `updatedAt`). In `incomes.service.spec.ts`: `create(..., { createdByOAuthClientId: 'c1' })` passes `createdByOAuthClientId: 'c1'` in the upsert `create` data and not in `update`. Same for budgets in `budgets.service.spec.ts`.
- [ ] **Step 2:** Run them → FAIL.
- [ ] **Step 3:** Schema + migration SQL by hand (`ALTER TABLE incomes ADD COLUMN created_by_oauth_client_id TEXT REFERENCES oauth_clients(id) ON DELETE SET NULL`, same for `budgets`, `CREATE INDEX incomes_account_id_updated_at_id_idx ...`); then `npx prisma generate`. Check the generated names against `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url ...` if a shadow DB is available; otherwise compare to the expense migration `20261101000000_public_api_oauth`.
- [ ] **Step 4:** Implement the signatures above; call `touchIncomes` after every income tag/project write listed under Files (inside the transaction where there is one).
- [ ] **Step 5:** `npx jest src/modules/incomes src/modules/budgets src/modules/tags src/modules/projects src/modules/sync` → PASS; `npm run typecheck` → clean.
- [ ] **Step 6: Commit** `Public API phase 2: income/budget attribution and income touch`.

### Task 3: Income categories on the public categories route

**Files:**
- Modify: `apps/api/src/modules/public-api/public-categories.query.ts`, `.spec.ts`
- Modify: `apps/api/src/modules/public-api/controllers/public-categories.controller.ts`
- Modify: `apps/api/src/modules/public-api/dto/public-expense.dto.ts` (add `ListPublicCategoriesQueryDto { type?: 'expense' | 'income' }`)

**Interfaces:**
- Produces: `publicCategoryWhere(accountId: string, type: 'expense' | 'income' = 'expense')`, `listPublicCategories(prisma, accountId, type = 'expense')`, `isPublicCategory(prisma, accountId, categoryId, type = 'expense')`.

- [ ] **Step 1: Failing tests:** `publicCategoryWhere('a', 'income')` → `{ accountId: 'a', type: 'income', isDeleted: false }`; default stays `expense`. Controller (`public-read.controllers.spec.ts`): `GET ?type=income` lists income categories; `?type=foo` → `422`; no param → expense (phase 1 unchanged).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `Public API phase 2: income categories`.

### Task 4: Income reads (list, detail, changes)

**Files:**
- Create: `apps/api/src/modules/public-api/dto/public-income.dto.ts`
- Create: `apps/api/src/modules/public-api/mappers/public-income.mapper.ts`, `.spec.ts`
- Create: `apps/api/src/modules/public-api/public-incomes.query.ts`, `.spec.ts`
- Create: `apps/api/src/modules/public-api/controllers/public-incomes.controller.ts` (GET routes)
- Modify: `apps/api/src/modules/public-api/public-encryption-fields.ts`, `.spec.ts`
- Modify: `apps/api/src/modules/public-api/public-api.module.ts`
- Test: `apps/api/src/modules/public-api/controllers/public-read.controllers.spec.ts`

**Interfaces:**
- Consumes: `encodeCursor`/`decodeCursor` (`cursor.util.ts`), `PUBLIC_CHANGES_SAFETY_LAG_MS`, `PUBLIC_CHANGES_MAX_LIMIT` handling from `public-expenses.query.ts` (export what is needed rather than copy).
- Produces:
  - `PUBLIC_TIER1_FIELDS.income = { nulled: { description: 'description', notes: 'notes' }, notExposed: ['debtContactName'] }`, `INCOME_TIER1_ENCRYPTED_FIELDS`.
  - DTO classes `ListPublicIncomesQueryDto` (`from`, `to`, `category_id`, `min_amount`, `max_amount`, `search`, `cursor`, `limit` — same validators and names as `ListPublicExpensesQueryDto` minus merchant), `ListPublicIncomeChangesQueryDto`, `PublicIncome`, `PublicIncomeList`, `PublicIncomeChanges` (+ upsert/delete change classes `PublicIncomeUpsertChange`, `PublicIncomeDeleteChange`).
  - `PublicIncome` fields: `id, amount, currency, date, description, notes, category (PublicRef|null), tags (PublicRef[]), project (PublicRef|null), source, is_debt, is_debt_repayment, is_split_receivable, is_transfer, created_by_app (PublicCreatedByApp|null), created_at, updated_at, encrypted_fields`. `is_transfer` = has `linkedTransfer`.
  - `PublicIncomeRow` + `toPublicIncome(row: PublicIncomeRow, opts: { encryptionTier: number }): PublicIncome`.
  - `listPublicIncomes(prisma, accountId, q)`, `getPublicIncome(prisma, accountId, id)` (resolves `id` only — `404 not_found` for deleted/foreign), `listPublicIncomeChanges(prisma, accountId, q)` with `{type:'delete', id, deleted_at}` for deleted rows.
  - `PublicIncomesController` at `public/v1/incomes`, operationIds `listIncomes`, `listIncomeChanges`, `getIncome`, scope `incomes:read`, tag `Incomes`.

- [ ] **Step 1: Failing tests** (mirror the expense specs):
  - mapper: tier 0 maps every field, `amount` `'12.50'`, `date` `'2026-11-01'`; tier 1 → `description`/`notes` null and `encrypted_fields` equals `INCOME_TIER1_ENCRYPTED_FIELDS`, tag/project/category names null.
  - query: list is account-scoped, excludes `isDeleted`, keyset `(date desc, id desc)`; a row dated exactly `to` is included; `from > to` → `422 validation_failed`.
  - changes: same lag/horizon tests as `public-expenses.query.spec.ts` (copy the cases, swap the model).
  - controller: tier 1 + `search` → `403 account_encrypted` with `details.fields: ['search']`; missing `incomes:read` → `403 insufficient_scope`.
  - `public-encryption-fields.spec.ts`: extend the loop to `income` and `budget` (budget bucket is added in Task 6 — add `income` now).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; register controller in `PublicApiModule`.
- [ ] **Step 4:** `npx jest src/modules/public-api` → PASS.
- [ ] **Step 5: Commit** `Public API phase 2: income reads`.

### Task 5: Income writes, and "Added via" in the app

**Files:**
- Create: `apps/api/src/modules/public-api/public-income-write.adapter.ts`, `.spec.ts`
- Modify: `apps/api/src/modules/public-api/controllers/public-incomes.controller.ts` (POST/PATCH/DELETE)
- Modify: `apps/api/src/modules/public-api/dto/public-income.dto.ts` (`PublicIncomeCreateDto`, `PublicIncomeUpdateDto`)
- Modify: `apps/api/src/modules/public-api/public-api.module.ts` (import `IncomesModule`)
- Modify: `apps/mobile/app/income/[id].tsx` or `src/components/income/detail/IncomeDetailsCard.tsx` (where the expense detail renders its "Added via")
- Test: `apps/api/src/modules/public-api/controllers/public-write.controllers.spec.ts`

**Interfaces:**
- Consumes: `parseIdempotencyKey`, `PublicWriteContext` from `public-expense-write.adapter.ts`; `isPublicCategory(..., 'income')`; `IncomesService.create(..., { createdByOAuthClientId })`; `getPublicIncome`.
- Produces: `PublicIncomeWriteAdapter` with `create(ctx, rawKey, body): Promise<{ id: string; isNew: boolean }>`, `update(ctx, id, body): Promise<{ id: string }>`, `remove(ctx, id): Promise<void>`. Generalise `assertReferencesBelongToAccount` with a `categoryType` option rather than copying it.
- Create DTO fields: `amount` (required, positive decimal string), `currency?`, `date` (required), `category_id?`, `description?`, `notes?`, `tag_ids?`, `project_id?`. Update DTO: the same, all optional, `null` clears `description`/`notes`/`category_id`/`project_id`. No `is_debt*`, no `source`.
- operationIds `createIncome`, `updateIncome`, `deleteIncome`; scope `incomes:write`.

- [ ] **Step 1: Failing tests:**
  - create: new key → `IncomesService.create` called with `localId = key`, `source: 'api'`, opts `{ createdByOAuthClientId: ctx.clientDbId }`, result `isNew: true` → controller `201`; repeat from same app → `200`, service not called; key owned by another app or by an app-created income → `409 idempotency_key_conflict`; key of a deleted income → `409`; key equal to another income's server id → `409`.
  - references: an **expense** category id → `422` with `details.fields.category_id`.
  - transfer-linked income: PATCH and DELETE → `422 validation_failed`, message names the transfer.
  - group-linked income (`groupCashLink` present): read how `IncomesService.update` treats it; if it ignores amount/currency/date there, refuse those fields with `422` exactly as `assertNotMirrorOwned` does for expenses, and test it; if it does not, write a test that pins the pass-through.
  - debt repayment income: PATCH `{ amount: '5.00' }` → service `update` called with `amount: 5`; body `{ is_debt: false }` → `422` (whitelist).
  - tier 1 account → `403 account_encrypted` on all three (already enforced by `@PublicWrite()` — assert it is on each route via the existing placement test pattern).
  - side effects: after a new income the adapter calls nothing beyond the service (incomes controller adds nothing on top — verify by reading `incomes.controller.ts`; if that changes, mirror it).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run `npx jest src/modules/public-api` → PASS.
- [ ] **Step 5:** Mobile: render "Added via <app>" on the income detail from `createdByApp`, reusing the expense's i18n key if its text does not say "expense" in any locale; otherwise add `incomeDetail.addedVia` in 9 locales. Add `createdByApp` to the shared-types income entity. `npm run typecheck` → clean.
- [ ] **Step 6: Commit** `Public API phase 2: income writes`.

### Task 6: Budgets (read and write)

**Files:**
- Create: `apps/api/src/modules/public-api/dto/public-budget.dto.ts`
- Create: `apps/api/src/modules/public-api/mappers/public-budget.mapper.ts`, `.spec.ts`
- Create: `apps/api/src/modules/public-api/public-budgets.query.ts`, `.spec.ts`
- Create: `apps/api/src/modules/public-api/public-budget-write.adapter.ts`, `.spec.ts`
- Create: `apps/api/src/modules/public-api/controllers/public-budgets.controller.ts`
- Modify: `public-encryption-fields.ts`, `.spec.ts`; `public-api.module.ts`

**Interfaces:**
- Consumes: `BudgetsService.findAll/findOne/create/update/remove/getProgress/getAccountAnchorDay`; `isPublicCategory(..., 'expense')`; `parseIdempotencyKey`.
- Produces:
  - `PUBLIC_TIER1_FIELDS.budget = { nulled: { name: 'name' }, notExposed: [] }`; `BUDGET_TIER1_ENCRYPTED_FIELDS = ['name', 'allocations.category_name']`.
  - `PublicBudget { id, name, amount, currency, period, start_date, end_date, alert_threshold, is_active, allocations: PublicBudgetAllocation[], progress: PublicBudgetProgress, created_at, updated_at, encrypted_fields }`; `PublicBudgetAllocation { category_id, category_name, amount }`; `PublicBudgetProgress { period_start, period_end, spent, remaining, percent_used, projected_total }` (from `getProgress`: `spent`, `remaining`, `percentageUsed` rounded to 1 decimal, `projectedTotal`; period bounds from the same computation — expose them from `getProgress` if it does not return them).
  - `PublicBudgetCreateDto { name, amount, currency?, period, start_date, end_date?, alert_threshold? (1-100), allocations?: { category_id, amount }[] }`; `PublicBudgetUpdateDto` all optional, `allocations` replaces the set.
  - `PublicBudgetWriteAdapter.create(ctx, rawKey, body) → { id, isNew }`, `update(ctx, id, body) → { id }`, `remove(ctx, id)`; idempotency as expenses, ownership by `Budget.createdByOAuthClientId`.
  - Controller at `public/v1/budgets`; operationIds `listBudgets`, `getBudget`, `createBudget`, `updateBudget`, `deleteBudget`; scopes `budgets:read` / `budgets:write`; progress always included on list and detail (builder's call per spec — switch to `include=progress` only if a list of 20 budgets measures >500 ms locally, and record it).

- [ ] **Step 1: Failing tests:** mapper tier 0/1 (name and allocation names null at tier 1); `period` outside `daily|weekly|monthly|yearly|custom` → `422`; allocation with an income category → `422 details.fields['allocations[0].category_id']`; allocation totals are NOT validated beyond what `BudgetsService` already enforces (do not invent a rule the app lacks); PATCH with `allocations: []` clears them, without `allocations` keeps them; idempotency cases as in Task 5 (incl. key owned by another app → `409`); deleted budget → `404`; progress uses `getAccountAnchorDay(accountId)`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `npx jest src/modules/public-api src/modules/budgets` → PASS.
- [ ] **Step 5: Commit** `Public API phase 2: budgets`.

### Task 7: Analytics

**Files:**
- Create: `apps/api/src/modules/public-api/public-analytics.service.ts`, `.spec.ts`
- Create: `apps/api/src/modules/public-api/dto/public-analytics.dto.ts`
- Create: `apps/api/src/modules/public-api/controllers/public-analytics.controller.ts`
- Modify: `public-api.module.ts` (provider; `ExchangeRateService` from its existing module, not a new instance)

**Interfaces:**
- Consumes: `getRatesSafe`, `convertAmount` (`common/utils/fx.ts`); `attributeToCategories` (`common/utils/category-attribution.ts`); `EXCLUDE_SPLIT_RECEIVABLE`; `CacheService.get/set`.
- Produces:
  - `PublicAnalyticsService.summary(accountId, userId, q: { from: string; to: string; currency?: string }, tier: number): Promise<PublicAnalyticsSummary>`
  - `.byCategory(accountId, userId, q & { type: 'expense' | 'income' }, tier)`: `Promise<PublicAnalyticsByCategory>`
  - `.monthly(accountId, userId, q, tier)`: `Promise<PublicAnalyticsMonthly>`
  - Common response fields: `currency, from, to, fx_converted, fx_approximate, encrypted_fields`. Summary: `total_income, total_expenses, net, transaction_count`. By-category: `data: [{ category_id: string|null, category_name: string|null, amount, share }]` sorted by amount desc, `share` = amount / total rounded to 4 decimals. Monthly: `data: [{ month: 'YYYY-MM', income, expenses, net }]`, every month in range present (zeros included).
  - Controller at `public/v1/analytics`, routes `summary`, `by-category`, `monthly`; operationIds `getAnalyticsSummary`, `getAnalyticsByCategory`, `getAnalyticsMonthly`; scope `analytics:read`.
- Rules (from the spec): exclude `isPlanned`, `isDeleted`, split receivables; splits via `attributeToCategories`; debts and transfers as the app's Analytics tab — read `apps/mobile/src/features/analytics/useFilteredTransactions.ts` and `useAnalyticsScreenData.ts`, mirror, and name the rule in a test; default `currency` = the grantor's `user.currencyCode` (load by `userId`); `from`/`to` required, inclusive; span > 366 days (`summary`, `by-category`) or > 24 calendar months (`monthly`) → `422`; cache 60 s under `pa:an:{accountId}:{route}:{from}:{to}:{type|-}:{currency}`.

- [ ] **Step 1: Failing tests** (`public-analytics.service.spec.ts`, mocked Prisma + rates):
  - PLN 100 + EUR 10 with rate 1 PLN = 0.25 EUR, currency PLN → `total_expenses '140.00'`, `fx_converted: true`.
  - a GBP row with no rate → excluded, `fx_approximate: true`, `transaction_count` excludes it.
  - planned expense and split-receivable expense → not counted.
  - split expense 100 = 60 food + 40 home → by-category food `'60.00'`, home `'40.00'`.
  - no category → one row `category_id: null`.
  - tier 1 → every `category_name` null, `encrypted_fields: ['category_name']`.
  - row dated `to` included; `from > to` → `422`; 367-day span → `422`; 25-month monthly → `422`.
  - monthly fills empty months with `'0.00'`.
  - default currency comes from the grantor user, explicit `?currency=EUR` overrides; an unknown currency code → `422`.
  - debts/transfers rule as mirrored from the app (one test per row type).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `npx jest src/modules/public-api` → PASS.
- [ ] **Step 5: Commit** `Public API phase 2: analytics`.

### Task 8: OpenAPI, guides, e2e

**Files:**
- Modify: `apps/api/src/modules/public-api/docs/openapi.spec.ts` (new operationIds and frozen schema names present; no internal route leaks)
- Modify: `apps/api/src/modules/public-api/docs/texts.{en,pl,ru}.ts` (operation summaries/descriptions per new operationId — `texts.spec.ts` enforces completeness)
- Modify: `apps/api/src/modules/public-api/docs/guide.{en,pl,ru}.md` (sections Incomes, Budgets, Analytics; analytics counting rules and why totals may differ slightly from the app; repayment edit warning; transfer-linked read-only)
- Modify: `apps/api/test/public-api.e2e-spec.ts`

- [ ] **Step 1: Failing tests:** openapi spec lists the 14 new operationIds and the schema names from Global Constraints; e2e: token with `incomes:write budgets:write analytics:read` → create income (201) → repeat (200) → feed returns it → create budget with one allocation → summary for the day shows the income; a second account of the same connection sees none of it.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Write the texts and guides. **Step 4:** `npx jest src/modules/public-api/docs` and `npm run test:e2e -- public-api` → PASS.
- [ ] **Step 5: Commit** `Public API phase 2: docs and e2e`.

### Task 9: Close-out (finish-aba-task)

**Files:**
- Modify: `docs/wiki/features/public-api.md` (scopes, entry points, new invariants: analytics counting rules + currency default, income/budget idempotency, transfer-linked income read-only), `docs/wiki/log.md`
- Modify: `user_docs/*/45-connected-apps.md` (9 locales: the data an app can be granted), then `npm run generate:help`, `python docs/marketing/help/build_help.py`
- Modify: the developers page source (`docs/marketing/...`, find it via `build_landing.py`'s `receipts:read` list) and rebuild with `LANDING_BASE= ROBOTS="index,follow,max-image-preview:large" python docs/marketing/landing/build_landing.py`; `git add -f` new generated files.

- [ ] **Step 1:** Run the `finish-aba-task` skill: create the `ABA-{N}` issue (N = max title number + 1), ingest the wiki, user docs, regenerate help and site.
- [ ] **Step 2:** `npm run lint`, `npm run typecheck`, `npm run test` from the repo root → clean.
- [ ] **Step 3:** Squash the phase's commits into one `ABA-{N} Public API phase 2: incomes, budgets, analytics`. Do not push without the owner's OK.
