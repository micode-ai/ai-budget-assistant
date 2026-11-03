# Public API phase 2 — incomes, budgets, analytics

Status: draft for review · 2026-11-03 · builds on
[`2026-11-01-public-api-design.md`](2026-11-01-public-api-design.md) (phase 1) and
[`2026-11-02-public-api-multi-account-design.md`](2026-11-02-public-api-multi-account-design.md).
Current state of the platform: [`docs/wiki/features/public-api.md`](../../wiki/features/public-api.md).

## Intent and the why

Phase 1 opened expenses, which is enough for our own AI Accounting product. The product owner now
wants the API **open wider, for third-party developers in general**. No particular integrator is
waiting. The owner named the minimum a developer needs to build something useful:
**add an income, manage a budget, and get data for analytics**.

Success: a developer who has never talked to us can build a small budgeting tool (a dashboard, a
spreadsheet sync, a bot) from the public reference alone. Its numbers must match the numbers the
user sees in the app.

## Goals

1. **Incomes**: the same surface expenses have (list, read, create, update, delete, changes feed),
   with the same guarantees.
2. **Budgets**: read budgets with their progress for the current period; create, update and delete
   them, including per-category allocations.
3. **Analytics**: three server-computed summaries — period totals, spend by category, monthly
   trend — in one currency, computed by the same rules the app uses.
4. Everything rides on the existing platform: OAuth, consent, `X-Account-Id`, rate limits,
   encryption tiers, error format, docs. No redesign.

## Non-goals (this phase)

- Writing categories, tags or projects; goals; debts as their own resource; webhooks; receipt
  upload/OCR; AI features. They stay in the roadmap order of the phase 1 spec.
- Analytics by tag, project or merchant, item-level analytics, savings (deposits/discounts),
  safe-to-spend. Add on demand.
- Analytics across several accounts in one request. A request addresses one account, as
  everywhere else.
- Budget alert settings beyond `alert_threshold`, and budget history over past periods.

## Anti-goals

- **A public number that disagrees with the app.** This is the reason analytics is computed by us
  at all. A developer who sums raw rows in mixed currencies, or counts a planned expense or a
  friend's share of a split bill as spend, ships a dashboard that silently lies.
- Reimplementing write logic. Writes go through the existing services, exactly as expense writes
  do, so alerts, the family feed, gamification and cache busts fire as for an app write.
- Leaking end-to-end-encrypted text through a summary (category names at tier 1).

## Constraints

Everything in the phase 1 spec and the public-api wiki page's Invariants holds unchanged, in
particular: guard reads from the DB every request; deny-by-default scopes; grantor must still be
owner/editor of the addressed account; tier ≥2 account → `403 account_encrypted`; tier 1 →
read-only and tier-1 text fields `null` + listed in `encrypted_fields`; `Idempotency-Key`
scoped to app and account; keyset changes feed with a 10-second DB-clock lag; child edits bump the
parent's `updatedAt`; the OpenAPI document includes only the public modules and schema names are
frozen once published; no runtime import of `@budget/shared-utils` in the API.

## Scopes

New: `incomes:read`, `incomes:write`, `budgets:read`, `budgets:write`, `analytics:read`.
Each gets a plain-language consent line in all nine languages. The `analytics:read` line must say
that it reveals **totals of income and spending** — an app holding only `analytics:read` learns
income totals without `incomes:read`, and the user must see that on the consent screen.

`budgets:read` responses include the spent amount (that is what progress is). This is an
aggregate of expenses, accepted on the same reasoning; the consent line says "budgets and how much
of each is spent".

## Incomes

Routes under `/public/v1/incomes`, a mirror of the expense routes: `GET /incomes`,
`GET /incomes/{id}`, `POST /incomes`, `PATCH /incomes/{id}`, `DELETE /incomes/{id}`,
`GET /incomes/changes`. No receipt route (incomes have none), no line items.

- **Shape** (`PublicIncome`): `id`, `amount`, `currency`, `date`, `description`, `notes`,
  `category` (`{id, name}` or null), `tags`, `project`, `source`, `is_debt`,
  `is_debt_repayment`, `is_split_receivable`, `created_by_app`, `created_at`, `updated_at`,
  `encrypted_fields`. Same naming and conventions as `PublicExpense`.
- **Filters**: the expense list's date range, category, amount range, `search` (refused at tier 1
  like for expenses), pagination by cursor.
- **Writes** through `IncomesService` (`create`/`update`/`remove`), never reimplemented, plus
  whatever `IncomesController` adds on top (the builder checks for post-write side effects there,
  as the expense adapter did).
- **Attribution**: add `Income.createdByOAuthClientId` (migration in the same commit as the
  schema change, see CLAUDE.md) and `'api'` to `IncomeSource`. Set by the server only, as the
  service's extra argument, never a DTO field — the same forgery reason as for expenses. The app's
  income detail shows "Added via <app>" like an expense does; reuse the expense's string if its
  wording fits an income, otherwise a new key in all nine locales.
- **Categories**: `GET /public/v1/categories` gains `type=expense|income` (default `expense`, so
  phase 1 callers are unchanged). The shared predicate (`publicCategoryWhere`) takes the type, so
  the list and the income write's `category_id` check still agree; an expense category on an
  income is `422`.
- **Idempotency, tombstones, feed**: identical rules to expenses, a separate cursor per account
  and resource. A child edit to an income (tags, project) bumps the income's `updatedAt` — the
  builder applies the `touchExpenses` treatment to income child write paths.
- **Debts and transfers**: rows with `is_debt`/`is_debt_repayment` are readable and behave as debt
  expense rows do in phase 1: the debt fields (`is_debt`, `is_debt_repayment`, contact, due date,
  related debt) are not writable, while amount, date and the other fields are, and the row can be
  deleted. The guide warns that editing or deleting a repayment changes the debt's outstanding
  balance. A row linked to an account transfer is read-only (`422`), because editing one side would
  unbalance the transfer.
- **Tier 1**: `description`, `notes` nulled and listed; `debtContactName` not exposed.

## Budgets

Routes under `/public/v1/budgets`: `GET /budgets`, `GET /budgets/{id}`, `POST /budgets`,
`PATCH /budgets/{id}`, `DELETE /budgets/{id}`. No changes feed: budgets are few per account, and
a full list is cheap.

- **Shape** (`PublicBudget`): `id`, `name`, `amount`, `currency`, `period`
  (`daily|weekly|monthly|yearly|custom`), `start_date`, `end_date`, `alert_threshold`,
  `is_active`, `allocations` (`[{category_id, category_name, amount}]`), `progress`,
  `created_at`, `updated_at`, `encrypted_fields`.
- **Progress** comes from `BudgetsService.getProgress` for the **current** period, in the
  budget's own currency, with the account's financial-month anchor applied as the app does:
  `period_start`, `period_end`, `spent`, `remaining`, `percent_used`, `projected_total`. It is
  included on detail; on the list it is included too unless that proves too slow, in which case it
  is behind `include=progress` (builder's call, documented either way).
- **Writes** through `BudgetsService`. Allocations are written as the full set on create and on a
  `PATCH` that carries `allocations` (replace, not merge); every `category_id` must pass the
  expense-category predicate. A `Budget` has no `categoryId` — category scope exists only through
  allocations (CLAUDE.md, Budgets).
- **Idempotency**: `POST /budgets` takes `Idempotency-Key` with the expense rules (scoped to the
  app and the account; `409 idempotency_key_conflict` on a key of another origin or of a deleted
  row). The key becomes the budget's `clientId`, which `BudgetsService.create` already treats
  idempotently. To scope the key to the app, add `Budget.createdByOAuthClientId` (server-set only,
  migration in the same commit). The app does not display it — no "Added via" on budgets this
  phase.
- **Tier 1**: `name` and allocation `category_name` nulled and listed.

## Analytics

Routes under `/public/v1/analytics`, all `GET`, all `analytics:read`, all account-level:

| Route | Returns |
|---|---|
| `/analytics/summary?from&to` | `total_income`, `total_expenses`, `net`, `transaction_count` |
| `/analytics/by-category?from&to&type=expense\|income` | `[{category_id, category_name, amount, share}]`, sorted by amount |
| `/analytics/monthly?from&to` | `[{month: "YYYY-MM", income, expenses, net}]` |

Every response also carries `currency`, `from`, `to`, `fx_converted`, `fx_approximate`, and
`encrypted_fields` when relevant.

**Do not build on the internal `AnalyticsService.getSummary`/`getTrends`.** They sum raw amounts
across currencies (one number that cannot be converted afterwards) and do not exclude planned
expenses. Build on the pattern of the chat's `get_category_breakdown`
(`ai/services/ai-expense-tools.service.ts`): load the rows, convert each row with
`common/utils/fx.ts`, then aggregate; split-aware categories through `attributeToCategories`.

Counting rules — decided by the product owner on 2026-11-03: **the API follows these rules and the
app is not changed in this phase.** The app's Analytics tab differs in two places, both documented
in the guide as the reason a total may differ slightly from the phone: it adds an amount with no
known rate unconverted (the API excludes it and sets `fx_approximate`), and it converts with its
own cached rates fetched at a different time. Its currency picker filters to rows in that currency
instead of converting; the API's `currency` parameter always converts. The test pins the API's
rules, not parity with the app. Making the app count the same way is a separate task.

Rules:
- planned expenses (`isPlanned`) excluded;
- split receivables excluded (`EXCLUDE_SPLIT_RECEIVABLE`), never via `isDebt`;
- a split expense is attributed to its split categories, otherwise the whole amount to its own
  category; no category → `category_id: null`;
- debts and transfers: included or excluded as the app's Analytics tab does (this part of the tab's
  behaviour is mirrored); the builder reads the tab, mirrors it and pins it with a test.

**Currency.** Query parameter `currency` (ISO code), defaulting to the **grantor's display
currency** (`user.currencyCode` of the user who connected the app), so the default numbers are in
the currency the person sees on their phone. Every response states its `currency`, so the
integrator never has to know where the default came from. Every row is converted with the server's
rates; a row whose rate is unknown is excluded and sets `fx_approximate`, never summed unconverted.
Budget progress is in the budget's currency and is not converted.

**Dates.** `from` and `to` are calendar dates (inclusive), required. Maximum span 366 days for
`summary` and `by-category`, 24 months for `monthly`; beyond that `422 validation_failed`.
Monthly buckets are calendar months, not the financial month.

**Tier 1**: amounts are plaintext and served; `category_name` nulled and listed.

**Cost.** These read many rows. Cache each result briefly in Redis under a key carrying account,
route, parameters and currency (a converted result is valid only in its currency); invalidation can
be a short TTL rather than write-time busts. The existing per-grant rate limit applies.

## Docs and consent

- OpenAPI: new controllers in `PublicApiModule`, schema classes named `PublicIncome`,
  `PublicBudget`, `PublicBudgetProgress`, `PublicAnalytics*` (frozen once published).
- Swagger texts and guides in en/pl/ru: a section per resource; the analytics section states the
  counting rules above, so an integrator knows why our totals differ from a naive sum.
- Consent scope lines in nine languages; help section `45-connected-apps` mentions the new data an
  app can be granted, in nine locales.
- The developers page on ai-budget.pl lists the new resources.

## Left to the builder

- Splitting the work into plan tasks and their order (incomes first is natural: it is a mirror).
- Whether progress on the budget list is always included or behind `include=progress`.
- Cache TTL and key layout for analytics.
- Exact filter names, as long as they match the expense list's conventions.
- Whether the income write adapter shares code with the expense adapter or is a sibling.

## Calls made in this design (not discussed with the product owner)

- Budgets have no changes feed and no visible "Added via"; they do get an internal
  `createdByOAuthClientId` so `Idempotency-Key` can be scoped to the app.
- Debt incomes follow phase 1's debt expenses: debt fields read-only, amount/date editable, delete
  allowed. Transfer-linked incomes are fully read-only.
- Span limits (366 days, 24 months) and calendar-month buckets.
- The `analytics:read` consent line discloses income totals.
