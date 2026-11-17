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
- `apps/api/src/modules/users/client-info.util.ts` — `parseClientInfo` (ABA-813); client side
  `apps/mobile/src/features/about/clientHeaders.ts`, added to every request by `http-client.ts`
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

**The app build rides the same write** ([ABA-813](https://github.com/micode-ai/ai-budget-assistant/issues/851)). The client sends `X-App-Version`
(the About screen's string: `1.42.0 (123)` native, `1.42.0+abc1234` web) and `X-App-Platform`
(`android`/`ios`/`web`); `JwtStrategy` (`passReqToCallback`) parses them and `touch` writes
`User.appVersion`/`appPlatform` together with `lastSyncAt` — no extra write, same throttle. The admin users
table shows them in its "App" column. A request without the headers leaves the stored values as they are.

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

**Headers are client input.** `parseClientInfo` keeps only a strict version shape and a known platform;
anything else is dropped, never stored.

**`touch` can neither delay nor fail a request.** It is `void`-ed with a swallowed rejection, and
the Prisma update itself is `.catch`-ed.

## Known gaps

- The app version shows only after a user opens a build that sends it, and a user on phone and web
  shows whichever client made the last stamped request (ABA-813).

- Bot traffic (Telegram, WhatsApp, Slack) does not authenticate via JWT, so bot-only usage is not
  counted as activity.
- No backfill for users whose stamp was stuck at `NULL` before ABA-389.
- `POST /sync/push` also writes the column, but nothing on mobile calls it (`pushChanges` in
  `subscriptions.api.ts` has no call sites).

## History

ABA-389 — moved the stamp from four routes into `JwtStrategy`, renamed the admin column from
"Last Login" to "Last Active".
[ABA-813](https://github.com/micode-ai/ai-budget-assistant/issues/851) added the app version and platform to the same stamp.
