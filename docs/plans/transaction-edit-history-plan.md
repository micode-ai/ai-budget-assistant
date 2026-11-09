# Plan: transaction-edit-history

Idea: `docs/product-ideas/transaction-edit-history.md`. Contract: `docs/contracts/transaction-edit-history.md`.

## Decisions (open questions answered)
- One polymorphic table `TransactionRevision` (entityType + entityId) instead of two tables.
- Retention: newest 20 revisions per transaction, pruned in the same transaction.
- Sync path knows the editor: handlers already receive `userId`; passed as `update(..., editorUserId)`.
- E2EE: a row with `encryptedPayload` on either side is never diffed (plaintext columns are zeroed); nothing leaks.
- Only accounts with >= 2 members record revisions.
- Tracked fields: amount, currencyCode, categoryId, description, merchant, date.

## Tasks
- [x] Prisma model + migration `20261109000000_transaction_revisions`
- [x] Pure diff util + spec
- [x] `TransactionRevisionsService` (record in tx, list, retention)
- [x] Hook in `ExpensesService.update` / `IncomesService.update` (controller + sync handlers pass editor id)
- [x] `GET /expenses/:id/revisions`, `GET /incomes/:id/revisions`
- [x] Wiki page + log
- [ ] Follow-up: shared-types `TransactionRevision` + mobile "Edited by X" line and History sheet (desktop + phone, 9 locales)
- [ ] Follow-up: Family Feed event on large amount change
