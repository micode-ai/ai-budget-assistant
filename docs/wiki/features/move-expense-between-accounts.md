# Move an expense between accounts

*Hub: [api](../api.md) · related: [expenses-service](expenses-service.md),
[client-id-resolution](client-id-resolution.md)*

## What this is

Re-homing an expense that was recorded in the wrong account (say, personal instead of the family
account). It reassigns the existing `accountId` column — no migration, no copy.

## Entry points

- `POST /expenses/:id/move { targetAccountId }` → `ExpenseCrossAccountService.moveToAccount`
  (`apps/api/src/modules/expenses/expense-cross-account.service.ts`); guarded by `ViewerBlockGuard`
  and `TripArchivedGuard` on the SOURCE account (via `AccountContextGuard`)
- DTOs: `MoveExpenseDto` / `MoveExpenseResponse` in `packages/shared-types/src/dto/expense.ts`
- Mobile: `expenseStore.moveExpense(id, targetAccountId)`, `moveExpenseAccountInDb` in
  `apps/mobile/src/db/expenseRepository.ts`; the swap-horizontal action and account-picker sheet in
  `apps/mobile/app/expense/[id].tsx`; `expenseDetail.move*` i18n keys
- Tests: `expense-cross-account.service.spec.ts`

## Key concepts

**What travels and what does not.** Amount, currency, description, merchant, notes, date, line items
and the receipt stay with the row. Account-scoped associations do not cross the boundary: the
category is **remapped by case-insensitive name** into the target account (cleared when there is no
match); tag links, the project link and category splits are soft-deleted; trip expense shares are
deleted. Both accounts' chat caches are invalidated, stale source-account anomaly alerts for the row
are dismissed, and the product rules the row's save taught the source account are unlearned
(ABA-602).

**The phone treats it as an online action.** Category remap and membership checks are
server-authoritative, so `moveExpense` removes the row from the current list optimistically, calls
the server, and restores the row if the call fails. Only on success does it re-home the local SQLite
row (`account_id` → target, `category_id` → NULL, `sync_status` synced — no push is queued), so the
row reappears under the target account on its next pull. The action is hidden for viewers and when
there is no other non-viewer account to move to.

## Invariants

**The caller must be a non-viewer member of the TARGET account**, checked in the service — the
guards only see the source. A non-member gets 403, a viewer of the target gets 403.

**End-to-end-encrypted expenses are rejected** (`BadRequestException`). Their `encryptedPayload` is
sealed with the source account's key and cannot decrypt under the target.

**On a `clientId` collision in the target, reassign a fresh `randomUUID()` — never `null`.**
`Expense.clientId` is non-nullable; `clientId: null` throws `PrismaClientValidationError`, and the
mocked-Prisma unit test hid it (ABA-351). The moving device self-heals: the target-account pull
soft-deletes the stale local row (its old clientId is no longer returned) and creates the new one.

## Known gaps

- Line items keep their own `categoryId`s, which still point at the source account's categories.
- The desktop transaction dialog has no move action; it exists only on the phone's detail screen.

## History

Introduced with the move endpoint; ABA-351 (clientId reassigned instead of nulled) · ABA-368
(moved to `ExpenseCrossAccountService`) · ABA-602 (source-account product rules unlearned).
