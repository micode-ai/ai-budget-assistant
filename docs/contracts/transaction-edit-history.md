# Contract: transaction edit history

Module `apps/api/src/modules/transaction-revisions/` (`TransactionRevisionsModule`, exports `TransactionRevisionsService`).

## Data — `TransactionRevision` (`transaction_revisions`)
`id, accountId, entityType ('expense'|'income'), entityId, userId?, changes JSON {field:{from,to}}, createdAt`.
Index `(entityType, entityId, createdAt desc)`. FK to account (cascade) and user (set null); none to the entity.

## Service
- `record(tx, {accountId, userId, entityType, entityId, before, after})` — called inside the update `$transaction`.
  No-op when: no `userId`, no tracked change, either row has `encryptedPayload`, or the account has < 2 members.
  Prunes to `MAX_REVISIONS_PER_ENTITY` (20).
- `list(accountId, entityType, entityId)` — newest first; `categoryId` from/to resolved to names (account-scoped).

## API (JwtAuthGuard + AccountContextGuard)
- `GET /expenses/:id/revisions`, `GET /incomes/:id/revisions` → `[{id,userId,userName,createdAt,changes}]`.
  Entity is resolved with `findOne(accountId, id)` first (404 for another account).

## Invariants
- Written in the same transaction as the update; never fire-and-forget.
- Editor id: controllers pass `req.user.id`; sync handlers pass their `userId`. `update()`'s 4th arg is optional so other callers record nothing.
- Never store E2EE values. Tracked fields are plaintext columns only.
