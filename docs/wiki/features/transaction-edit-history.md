# Transaction edit history

*Hub: [api](../api.md) · related: [expenses-service](expenses-service.md), [offline-first-sync](offline-first-sync.md)*

## What this is
On a shared account (2+ members) every edit that changes a tracked field of an expense or income
writes a `TransactionRevision` row with the editor and a `{field: {from, to}}` diff, so members can see
"edited by Anna, 12 → 15". Code: `apps/api/src/modules/transaction-revisions/`.

## Behaviour
- Tracked: amount, currencyCode, categoryId, description, merchant, date. Notes, tags, splits are not.
- Read: `GET /expenses/:id/revisions`, `GET /incomes/:id/revisions` (category ids returned as names).
- Retention: newest 20 per transaction.
- Mobile UI ("Edited by" line, History sheet) is **not built yet** — API only.

## Invariants
- Recorded inside the update `$transaction` (`ExpensesService.update`, `IncomesService.update`), never fire-and-forget.
- Both update paths must receive the editor id: controller `req.user.id` and the `/sync` handlers' `userId`. A new caller of `update()` that omits it records nothing, silently.
- A row with `encryptedPayload` on either side is skipped: its plaintext columns are zeroed, and plaintext history must never copy E2EE values.
- Single-member accounts record nothing.
- On an account at `encryptionTier >= 1`, `description` and `merchant` hold client-side ciphertext with no `encryptedPayload`, so `diffTransaction(..., { textEncrypted: true })` leaves them out; amount, currency, category and date are still recorded.
- The service is `@Optional()` in both services so specs constructing them positionally still compile.
