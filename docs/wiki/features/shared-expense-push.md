# Shared expense push

## What this is
When a member adds an expense on a shared (non-personal) account, the other members get a push.

## Entry points
- `apps/api/src/modules/notifications/shared-activity.service.ts` — `notifyExpenseCreated`.

## Invariants
- Dedup is `CacheService.setIfAbsentStrict('shared-expense-push:{expenseId}', 600)`, so it survives deploys and is shared between instances.
- The stamp is deleted if anything after it throws, so an offline retry can still notify.
- A Redis outage fails open (send anyway): a duplicate push beats a lost one.

## History
- [ABA-817](https://github.com/micode-ai/ai-budget-assistant/issues/855) — replaced a process-local Map stamped before the send.
