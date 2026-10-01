# Bulk expense and income operations

*Hub: [api](../api.md) · related: [expenses-service](expenses-service.md),
[client-id-resolution](client-id-resolution.md), [categorize-uncategorized](categorize-uncategorized.md)*

## What this is

Changing many transactions at once: set a category, append tags, or delete. On the phone it is the
Expenses tab's multi-select mode; the same endpoints feed the categorize-uncategorized review's
Apply step.

## Entry points

- `PATCH /expenses/bulk` → `ExpenseBulkService.bulkUpdate`
  (`apps/api/src/modules/expenses/expense-bulk.service.ts`), DTO `BulkUpdateExpensesDto`
  (`ids` 1–500, optional `categoryId` / `tagIds` / `isDeleted`)
- `PATCH /incomes/bulk` → `IncomeBulkService.bulkUpdate`
  (`apps/api/src/modules/incomes/income-bulk.service.ts`), DTO `BulkUpdateIncomesDto` — category only
- Mobile: `expenseStore.bulkUpdateExpenses(ids, patch, { awaitServer? })`,
  `incomeStore.bulkUpdateIncomes`, `apps/mobile/src/hooks/useExpenseMultiSelect.ts` (the selection
  state machine), `apps/mobile/src/components/TransactionActionSheet.tsx`,
  `apps/mobile/src/components/BulkTagPickerSheet.tsx`, `apps/mobile/src/components/BulkActionBar.tsx`
- Tests: `expenses.controller.spec.ts` (routing), `expense-bulk.service.spec.ts`,
  `income-bulk.service.spec.ts`

## Key concepts

**Server.** Both endpoints are account-scoped and behind `ViewerBlockGuard` (the expense one also
`TripArchivedGuard`). Ownership is checked by fetching only the ids that match `accountId` and are
not deleted; then one `updateMany`. The expense side runs it in a `$transaction` together with a
per-expense `expenseTag.upsert` loop — tags are **appended**, never replaced, and each tag's
`usageCount` grows by the links the loop added — and then busts the chat cache. A bulk recategorization also teaches merchant → category rules, the same signal as a
single edit (see [merchant-category-rules](merchant-category-rules.md)).

**Phone.** Long-press on an expense row opens `TransactionActionSheet` (Edit / Duplicate / Delete /
**Select multiple**); multi-select shows checkboxes, a count + Cancel + Select All header, hides the
FAB, and a bottom bar with Set Category, Add Tag (append mode) and Delete (with confirmation).
`bulkUpdateExpenses` updates memory optimistically, persists to SQLite (including local
`expense_tags` links), then calls the server fire-and-forget — failures `console.warn` and the rows
stay `pending`. `awaitServer: true` is opt-in for a caller that must know the server write landed
before saying "done" (the categorize review; on web there is no SQLite to fall back on).

## Invariants

**`@Patch('bulk')` must be declared before `@Patch(':id')`** in both controllers. Express matches
in declaration order; a `:id` route first captures `/expenses/bulk` as `id="bulk"`, returns 400, and
the bulk op silently no-ops — the rows reappear after the next pull.

**Resolve every incoming id as `OR: [{ id }, { clientId }]` and write the resolved server PK.**
The phone addresses rows by their local id, which the server stores as `clientId`. Matching on `id`
alone silently no-ops every bulk op for device-created rows — for the expenses, for the incomes,
and for the tag ids written into the junction.

**A category that does not resolve is left out of the update, never written as `null`.** One
statement patches up to 500 rows; writing `null` would blank the existing category of every
selected row (ABA-566).

**The bulk tag append counts only the links it actually adds.** A live link is skipped, a
soft-deleted one is re-activated, and `Tag.usageCount` grows by the number created or re-activated
— the same rule as the single `TagsService.addToExpense`. Counting every pair would inflate the
count each time a selection that already carries the tag is tagged again (ABA-626).

## Known gaps

- The income endpoint is category-only (no tags, no delete, no merchant learning — incomes have no
  merchant field).

## History

ABA-173 (bulk ops) · ABA-166 (route ordering) · ABA-167 (clientId resolution, local tag links) ·
ABA-168 (long-press opens the action sheet instead of jumping straight into multi-select) · ABA-368
(moved to `ExpenseBulkService`) · ABA-566 (unresolvable category left out) · ABA-595
(`IncomeBulkService` for the categorize review).
