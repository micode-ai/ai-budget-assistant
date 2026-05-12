# Plan: Transaction Attribution in Shared Accounts

Feature: "Who added this?" — show creator name on expense/income entries in shared accounts.

## Decision log

- **No DB migration needed.** `expenses.userId` and `incomes.userId` are already set to the creator's `userId` at create time (from `request.userId`). The `User` relation already exists in Prisma schema (lines 312, 373). We just need to join user name in existing queries.
- **Flatten at service layer.** Return `createdByUserName: string | null` on expense/income objects; remove nested `user` sub-object. This keeps the mobile API contract clean.
- **Visibility.** Attribution visible to all roles (owner/editor/viewer). No reason to hide who created a transaction from someone who can see the transaction.
- **Display name used** (not email). `User.name` is a required field (non-nullable in schema). Falls back to `null` for rows where user was deleted.
- **List view initials chip deferred.** The detail screen ("Added by X") is the golden path. The list-view initials chip (only when >1 member) is a stretch goal deferred to a follow-up issue to keep scope tight.

## Checklist

- [x] Write plan file
- [x] Write module contracts
- [x] `packages/shared-types/src/entities/index.ts` — add `createdByUserName?: string | null` to `Expense` and `Income`
- [x] `apps/api/src/modules/expenses/expenses.service.ts` — include `user: { select: { name: true } }` in all Prisma queries (findAll select, findOne include, create inner query, update inner query, setSplits inner query); add `toExpenseResponse` helper; map all return values
- [x] `apps/api/src/modules/incomes/incomes.service.ts` — same pattern for incomes (findAll, findOne, create inner query, update inner query)
- [x] `apps/mobile/src/i18n/locales/en.ts` (and all 7 other locales) — add `addedBy: 'Added by {{name}}'`
- [x] `apps/mobile/app/expense/[id].tsx` — show "Added by X" label when `expense.createdByUserName` is set
- [x] `apps/mobile/app/income/[id].tsx` — show "Added by X" label when `income.createdByUserName` is set
- [x] Update product idea `status:` to `building`
- [x] Create GitHub issue ABA-98
- [x] Update CLAUDE.md

## Deferred / out of scope

- List-view initials chip (needs account member count check, more mobile work)
- Backfill for existing rows: `userId` is already set, so all historical rows already have creator info; no backfill needed
