# Expenses service structure

*Hub: [api](../api.md) · related: [expense-bulk-operations](expense-bulk-operations.md),
[move-expense-between-accounts](move-expense-between-accounts.md),
[client-id-resolution](client-id-resolution.md)*

## What this is

How the expenses module on the API is cut up: which service owns which write path, where the
"after a create" side effects live, and how a returned row says who created it. The incomes module
mirrors the shape on a smaller scale.

## Entry points

- `apps/api/src/modules/expenses/expenses.service.ts` — `ExpensesService`: create / update / remove,
  `findOne` / `findAll`, items, receipt image, category splits, `toExpenseResponse`
- `apps/api/src/modules/expenses/expense-created-hooks.service.ts` — `ExpenseCreatedHooksService.onExpenseCreated`
- `apps/api/src/modules/expenses/expense-bulk.service.ts` — `ExpenseBulkService.bulkUpdate`
- `apps/api/src/modules/expenses/expense-cross-account.service.ts` — `ExpenseCrossAccountService`:
  `mergeExpenses`, `moveToAccount`
- `apps/api/src/modules/expenses/expense-cache.util.ts` — `invalidateExpenseChatCache`
- `apps/api/src/modules/expenses/expense-category-resolver.util.ts` — `resolveExpenseCategoryId`,
  `resolveCategoryIdForUpdate`
- `apps/api/src/modules/incomes/incomes.service.ts`, `incomes/income-bulk.service.ts`
- Tests split one spec per service: `expenses.service.spec.ts`, `expense-bulk.service.spec.ts`,
  `expense-cross-account.service.spec.ts`, `expense-created-hooks.service.spec.ts`

## Key concepts

**Four services, one controller.** `ExpensesController` injects `ExpensesService`,
`ExpenseBulkService` and `ExpenseCrossAccountService` directly and routes each endpoint to the one
that owns it — there is no facade. Logic the classes share (chat-cache busting, category-id
resolution) lives in standalone utils rather than on any one of them; `ExpensesService`'s private
`invalidateChatCache`/`resolveCategoryId` are thin wrappers over those.

**The create hook chain.** Everything that happens *because* an expense was created — notification
stub reconciliation, the anomaly check, the Family Feed event, community-price contribution,
Inflation Shield tracking, product-rule learning, wallet-currency backfill — is one call:
`ExpensesService.create()` calls `onExpenseCreated(accountId, userId, expense, learnableItems)`
exactly once, fire-and-forget, and that method never throws into the caller. Its collaborators are
`@Optional()` injections on the hooks service, not on `ExpensesService`. The ordering inside it is
load-bearing; see [bank-notification-capture](bank-notification-capture.md). Gamification is still
called from `create()` itself.

**Who created a transaction.** `Expense.userId` and `Income.userId` already hold the creator (set
from the request at create time). Every query includes `user: { select: { name: true } }` and maps
through `toExpenseResponse` / `toIncomeResponse`, which flattens it into
`createdByUserName: string | null`. No migration was needed — only the include and the mapper.
The incomes side is typed (`incomeInclude` const, `IncomeWithRelations`, `IncomeResponse`);
`toExpenseResponse(expense: any)` is not.

## Invariants

**A new "after create" side effect is a branch in `onExpenseCreated`, not a new constructor
parameter on `ExpensesService`.** The service regrew to over a thousand lines once already after
its first split, every feature adding another `@Optional()` sibling and inline fire-and-forget to
`create()`; the hooks service exists to stop that.

**Do not let `ExpensesService` re-absorb bulk or cross-account logic.** Extend `ExpenseBulkService`
or `ExpenseCrossAccountService`; mirror the spec split when adding tests.

**Always pass the `user` include and map through the response helper.** A query that skips either
returns a row without `createdByUserName`, and shared-account screens show it as created by nobody.

**When typing an income/expense `where`, build a date range in its own `Prisma.DateTimeFilter`.**
`Prisma.IncomeWhereInput['date']` can be a bare `Date`, so spreading `where.date` into
`{ ...where.date, gte }` stops typechecking once `where` is properly typed.

## Known gaps

- `toExpenseResponse(expense: any)` is still untyped (tech-debt
  `expense-service-response-typed-any`); the income side was fixed in ABA-359.
- `ExpensesService.update()` and `remove()` still swallow two fire-and-forget failures with a bare
  `.catch(() => undefined)` — the chat-cache invalidation and the merchant-rule learning — against
  the `logFireAndForget` convention.

## History

ABA-359 (incomes typed, `incomes.service.spec.ts`) · ABA-368 (the split into bulk and cross-account
services plus the shared utils) · `expenses-service-regrowth-after-split` tech-debt (the hook chain
extracted into `ExpenseCreatedHooksService`) · ABA-625 (`ocr` no longer runs notification-stub
reconciliation).
