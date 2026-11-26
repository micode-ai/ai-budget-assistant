# Recently deleted

*Hub: [expenses](../index.md) · related: [chat-undo-last-action](chat-undo-last-action.md), [expenses-service](expenses-service.md)*

## What this is
A 30-day window in which a soft-deleted expense or income can be listed and restored. Server side is live (`apps/api/src/modules/recently-deleted/`); the mobile list, the delete "Undo" snackbar and the desktop layout are not built yet (remaining work is tracked on the idea card).

## How it works
- `GET /recently-deleted` lists `isDeleted = true` rows of the header account, newest deletion first; `POST /recently-deleted/restore` flips them back (viewer-blocked).
- There is no `deletedAt` column: `updatedAt` is the deletion time. Do not write to a soft-deleted row, or its window restarts.
- There is deliberately NO purge. A hard delete of rows past 30 days would irreversibly remove every historical soft-deleted row on its first run (they are also sync tombstones) and aborts on Restrict FKs (`AccountTransfer.linkedIncome`, `PurchaseRequest.plannedExpense`). Rows older than 30 days just stop being listed or restorable and stay soft-deleted, as before.

## Invariants
- Ids resolve as `OR:[{id},{clientId}]` and the resolved server PK is written — device-created rows are addressed by clientId.
- Every query filters by `accountId`; restore is never behind the `:accountId`-path trap since the account comes from the guard.
- A debt repayment is not restored while its debt is still deleted (`debt_deleted`), or it would count against a debt that no longer exists.
- An income is not restored while the `AccountTransfer` linked to it is deleted (`transfer_deleted`), nor while the expense it repays is deleted (`debt_deleted`). Expenses have no transfer link.
- Restore bumps `syncVersion` so other devices pull the row back.

## Known gaps
- A restored split receivable does not revive its guest links (`expireForExpense` ran at delete).
- Restore writes no transaction revision; E2EE rows round-trip as opaque payloads.
