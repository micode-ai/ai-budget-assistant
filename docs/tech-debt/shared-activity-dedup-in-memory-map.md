---
id: shared-activity-dedup-in-memory-map
title: 'SharedActivityService dedups shared-expense pushes in a process-local Map that is marked before the send succeeds'
status: closed
priority: P3
module: 'apps/api'
created_at: 2026-10-05
orchestration_run: d937e456-0062-4460-afe6-5e8c4b0ed266
---

# SharedActivityService dedups shared-expense pushes in a process-local Map that is marked before the send succeeds

## What's wrong
`apps/api/src/modules/notifications/shared-activity.service.ts` (lines 9-10, 25-35) keeps `sentNotifications = new Map<string, number>()` as the only guard against pushing the same shared-account expense twice (10-minute TTL, swept only once the map passes 10,000 entries). The expense id is stamped into the map at the top of the `try`, before the account, member and `sendToUsers` calls run. If any of them throws, the catch at the bottom only logs, and the stamp stays. An offline-retry of the same expense within 10 minutes is then silently skipped, so members never get that notification.

## Why it matters
The map is wiped on every deploy and is not shared between API instances, so the dedup is weaker than it looks, and a transient failure permanently suppresses the push for 10 minutes. This is the same defect class as the in-memory rate-limit maps already filed (`auth-rate-limit-in-memory-maps`), and `CacheService.setIfAbsent` already exists for exactly this pattern (see the last-active throttle).

## Proposed fix
- Replace the Map with `CacheService.setIfAbsent('shared-expense-push:{expenseId}', ttl)`, inject `CacheService` (it is `@Global()`).
- Decide the failure semantics explicitly: on a send failure, delete the key so a retry can notify, or stamp only after `sendToUsers` resolves.
- Drop the manual size-based sweep.
- Add a spec covering duplicate suppression and retry-after-failure.

## Files involved
- `apps/api/src/modules/notifications/shared-activity.service.ts`
- `apps/api/src/common/cache/cache.service.ts`
