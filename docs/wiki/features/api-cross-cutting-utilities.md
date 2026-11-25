# API cross-cutting utilities: fire-and-forget, cron pagination, cache

*Hub: [api](../api.md)*

## What this is

Three small API utilities every module is expected to reuse rather than re-implement: logging a
fire-and-forget failure, streaming an unbounded table in a cron, and the Redis cache with its
rate-limit primitives.

## Entry points

- `apps/api/src/common/utils/fire-and-forget.ts` — `logFireAndForget`
- `apps/api/src/common/utils/paginate.ts` — `paginateById`
- `apps/api/src/common/cache/cache.service.ts`, `common/cache/redis-throttler-storage.ts`

## Key concepts

**Fire-and-forget logging convention (ABA-461).** any `void someCall().catch(...)` guarding a non-critical side effect (Family Feed events, anomaly checks, gamification, renewal/reminder pushes, wallet-currency backfills, community-price contributions, etc.) MUST log the rejection, never swallow it with `.catch(() => {})` — a silent failure there means the secondary effect never happened and there's no way to diagnose it. Use `logFireAndForget(this.logger, 'ClassName.whatItDoes')` from `common/utils/fire-and-forget.ts`, which returns a `.catch()` handler that calls `Logger.warn` (never `.error` — mirrors the mobile ABA-157 convention that a fire-and-forget failure is expected/transient, not exceptional). Every call site across the API (`subscriptions`, `expenses`, `incomes`, `wallet`, `budgets`, `purchase-requests`, `import-bank`, `import-wise`, `sync`, `referrals`, `telegram`, `community-prices`, `insights`, `shopping-list`, `trip-settle-up`, `debts`, `gamification`, `user-subscriptions`) was migrated to this helper; a new fire-and-forget call site should use it too, not a bare empty `.catch()`.

**Daily cron pagination.** (ABA-457): `common/utils/paginate.ts` — `paginateById(fetchPage, batchSize=500)`, a generic async generator that streams a Prisma `findMany`-shaped query in `id`-ordered batches (`orderBy:{id:'asc'}` + `cursor`/`skip`) instead of loading the whole eligible-row set in one call. Consumed by all 5 daily notification crons that used to `findMany` an entire table (tech-debt `daily-crons-full-table-scan`): `tracking-gap-reminder.cron.ts`, `debt-reminder.cron.ts` (both methods — the per-batch repayment lookup is scoped to that batch's debt ids, not the whole day's set), `expense-recurring.cron.ts` (see below — its recurringId-dedup switched from "first-seen wins" under a global `orderBy:date desc` to "latest-date wins" compared per row, since pagination is now by `id`), `subscription-renewal.cron.ts` (both crons), `trial-reminder.cron.ts`. New cron/batch-job code that scans an unbounded table should use this util rather than a bare `findMany`. Deliberately NOT changed: `NotificationsService.sendToUser`'s per-user `findUnique` re-fetch (N+1) — that method has many other callers and its signature was out of scope for this fix.

**Caching layer.** (ABA-151): `common/cache/cache.service.ts` — global `@Global()` ioredis wrapper; `delByPrefix` uses cursor-based `SCAN` (not blocking `KEYS`). `common/cache/redis-throttler-storage.ts` — `RedisThrottlerStorage` (`ThrottlerStorage` v5 interface, INCR+PEXPIRE NX+PTTL pipeline, `keyPrefix: 'throttle:'`); registered via `ThrottlerModule.forRootAsync` in `app.module.ts` so rate limits survive restarts. **`CacheService.incrementWindow(key, windowMs)`** (ABA-416) is the general-purpose version of the same INCR+PEXPIRE-NX pattern for any security-sensitive rate limit that needs to live outside `ThrottlerModule` — unlike every other `CacheService` method it does NOT swallow Redis errors (callers must fail closed, not silently allow unlimited attempts on a Redis outage). First consumer: `EncryptionService.checkRecoveryRateLimit` (`enc:recovery:{email}`, 5/15min) — replaced a plain in-memory `Map` that reset on every deploy, the same defect class as the `auth.service.ts` rate-limit Maps, which ABA-808 moved to Redis too (login fails open, code checks fail closed — `docs/wiki/auth.md`).

## Invariants

- A fire-and-forget `.catch` always logs, through `logFireAndForget` (`Logger.warn`), never an empty `.catch(() => {})`.
- New cron or batch code that scans an unbounded table uses `paginateById`, not a bare `findMany`.
- `CacheService.incrementWindow` is the only `CacheService` method that throws on a Redis error, so a
  security rate limit fails closed.

## History

ABA-151 (cache, throttler storage) · ABA-416 (`incrementWindow`) · ABA-457 (cron pagination) ·
ABA-461 (fire-and-forget) · ABA-808 (auth rate limits moved to Redis).
