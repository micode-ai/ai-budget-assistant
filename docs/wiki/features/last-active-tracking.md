# Last-active tracking

*Hub: [auth](../auth.md) · related: [admin-dashboard](../admin-dashboard.md),
[referral-program](referral-program.md)*

## What this is

`User.lastSyncAt` is the **last-activity** stamp. Despite its name it is not about sync: it is the
admin Users table's **"Last Active"** column, the source of the dashboard's active-today and
active-this-week counts, and the activity test that qualifies a referral.

## Entry points

- `apps/api/src/modules/users/last-active.service.ts` — `LastActiveService.touch(userId)`,
  `lastActiveKey`, `LAST_ACTIVE_THROTTLE_SEC`; provided and exported by `UsersModule`
- `apps/api/src/modules/auth/strategies/jwt.strategy.ts` — `JwtStrategy.validate()` calls `touch`
- `apps/api/src/common/cache/cache.service.ts` — `CacheService.setIfAbsent(key, ttlSec)`
- Readers: `AdminAnalyticsService.getDashboard` (active counts), `AdminService` users list (sortable
  column), `ReferralsService` (a referred user active within 7 days qualifies)

## Key concepts

**Stamped on every authenticated request.** `JwtStrategy.validate()` fires `touch` fire-and-forget,
so any JWT-authenticated route counts as activity.

**Throttled through Redis.** `touch` first does `setIfAbsent(lastactive:{userId}, 15 min)` — an
atomic `SET … EX … NX` — and writes the column only when it won the window. At most one write per
user per `LAST_ACTIVE_THROTTLE_SEC`.

**The public routes stamp themselves.** `login`, `googleLogin` and `refreshToken` in
`auth.service.ts` still call `UsersService.updateLastSync`, because those routes never reach
`JwtStrategy`. The restore-credential login deliberately does not: the restored client's next
authenticated request does it.

## Invariants

**Do not re-add a per-route `updateLastSync` call.** Before ABA-389 only login, Google login, refresh
and `GET /users/me` wrote the stamp, and the ordinary registration path hits none of them:
`register()`/`verifyEmail()` return tokens directly, `authStore.register` does not fetch the
profile, cold start restores the session from local storage, and the access token lives 7 days — so
an active user read as "Never" indefinitely, undercounting the dashboard and silently withholding
referral bonuses. One central stamp is what closes every path at once.

**A Redis outage skips the stamp; it never writes per request.** `setIfAbsent` returns `false` when
Redis is down. The alternative — treating a failure as "first in window" — would turn every request
into a DB write exactly when the system is already degraded.

**`touch` can neither delay nor fail a request.** It is `void`-ed with a swallowed rejection, and
the Prisma update itself is `.catch`-ed.

## Known gaps

- Bot traffic (Telegram, WhatsApp, Slack) does not authenticate via JWT, so bot-only usage is not
  counted as activity.
- No backfill for users whose stamp was stuck at `NULL` before ABA-389.
- `POST /sync/push` also writes the column, but nothing on mobile calls it (`pushChanges` in
  `subscriptions.api.ts` has no call sites).

## History

ABA-389 — moved the stamp from four routes into `JwtStrategy`, renamed the admin column from
"Last Login" to "Last Active".
