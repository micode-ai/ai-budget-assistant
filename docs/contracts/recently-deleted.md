# Contract: Recently deleted

Auth: `JwtAuthGuard` + `AccountContextGuard`. Retention: 30 days from deletion (`updatedAt` of the soft-deleted row).

## GET /recently-deleted?limit=100
Soft-deleted expenses and incomes of the current account, newest deletion first (limit 1–200). Viewers allowed.

```json
{ "retentionDays": 30,
  "data": [ { "entityType": "expense", "id": "uuid", "clientId": "uuid|null", "amount": "12.50",
              "currencyCode": "PLN", "description": "…", "date": "…", "categoryId": "…",
              "isDebt": false, "isDebtRepayment": false, "deletedAt": "…" } ] }
```

## POST /recently-deleted/restore
Viewers get 403 (`ViewerBlockGuard`). Body: `{ "items": [ { "entityType": "expense"|"income", "id": "<server id or clientId>" } ] }` (1–200 items).
Ids resolve as `OR:[{id},{clientId}]`; the resolved PK is written. Restoring sets `isDeleted=false` and bumps `syncVersion`.

Response: `{ "restored": [ {entityType,id} ], "skipped": [ {entityType,id,reason} ] }`
`reason`: `not_found` | `expired` | `debt_deleted` (a repayment whose debt is still deleted). Partial success is normal (HTTP 200).

## Purge
Daily 04:15 cron hard-deletes expenses and incomes with `isDeleted = true` and `updatedAt` older than 30 days.
