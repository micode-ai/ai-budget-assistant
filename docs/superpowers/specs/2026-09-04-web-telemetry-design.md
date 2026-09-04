# Web Product Telemetry — Design

The web app is now a real acquisition channel, so it is worth investing in. The
first investment is knowing where its users fall out, because right now nothing
in the product measures itself.

What we already measure, and where the blind spot is:

- The **marketing site** has GA4 with a real event vocabulary since ABA-434 —
  `cta_click`, `plan_select`, `language_change`, and the rest, each carrying
  `page_type` and `language`.
- Every link into the app carries `?src=&loc=&lang=(&plan=)` (ABA-436), captured
  on first arrival and stored on the user as `acquisition{Source,Location,Language,Plan}`.
  `GET /admin/analytics/acquisition` groups signups by all four (ABA-452).
- The **server** knows registrations, activation (a first expense or income
  within a 3-day window), weekly cohort retention, DAU/WAU/MAU, growth, MRR and
  churn — all of `AdminInvestorMetricsService`.

So both ends of the funnel are instrumented. The blind spot is the middle: **what
a signed-in user did before they wrote anything to the database.** A person who
opens the receipt scanner and abandons it, or who lands on the expense form three
times and never saves, is indistinguishable in our data from a person who never
opened the app. That is precisely the population we lose on web, and it is the
population this spec exists to make visible.

This is sub-project **D** of four (D → A → B → C): measure first, then real local
persistence on web, then web push, then the PWA offline shell. Measuring first is
what makes the other three decisions rather than guesses.

## Hard constraint: mobile must not be touched

Stated by the product owner and treated as binding. It rules out the obvious
implementation — an analytics SDK in the shared bundle — because that would mean
a new dependency in the AAB, a change to the Play **Data safety** declaration,
and a privacy surface on a platform we were not asked to instrument.

The constraint is met structurally rather than by discipline: see decision 3.

## What already exists

- **Platform-extension convention, 13 files deep**: `secureStorage.{native,web}.ts`,
  `fileExport.{ts,native.ts,web.ts}`, `attribution.web.ts`, `db/client.web.ts`,
  `DatePicker.web.tsx`, `ShareImageCard.web.tsx` and others. Metro resolves the
  platform file at bundle time, so a `.web.ts` implementation is never bundled
  into the native app.
- `src/features/analytics/` — the user-facing **spending** analytics (`useAnalytics`,
  `categoryGrouping`). This name is taken; see decision 1.
- `WebShell` / `DesktopShell` — `usePathname()` is subscribed **only inside
  `DesktopShell`**, which renders only on desktop web (`width >= 1024`). Native
  and narrow web pay nothing for it today, and narrow web is where most of this
  channel's users are.
- `useFirstRunOnboarding` documents why `usePathname()` was **removed** from
  `RootNavigator`: it renders 95 `<Stack.Screen>` elements with freshly allocated
  inline `options`, so a route subscription there re-renders all of them on every
  navigation, on the JS thread, during the transition animation.
- `expo-router` ~6.0.23 exports `useNavigationContainerRef` (via `./exports`).
- Retention-cron precedent: `ShoppingNotificationLedger.cleanupOldLogs()`,
  `@Cron('0 3 * * *')`, deletes rows older than 90 days; `insight_notification_log`
  mirrors it.
- Throttling precedent: this app registers **no** global `ThrottlerGuard`, so
  `@Throttle` alone is inert — it must be paired with `@UseGuards(ThrottlerGuard)`
  (`import-bank.controller.ts`, `guest.controller.ts`).
- Validator precedent: the AI-import mapping validator checks model output
  against a `Set` of real header cells and **drops** anything invented, never
  trusting it. The receipt category-split classifier does the same with category
  names.
- Admin app: `apps/admin/src/app/<page>/page.tsx` + a `use-<thing>.ts` hook, with
  `Stat`/`InfoHint` cards (`/metrics`, `/acquisition`).

## Locked decisions

1. **Called telemetry, not analytics.** `src/features/analytics/` is already the
   user-facing spending analytics, and `apps/admin` already has an "Analytics"
   page about AI usage. A third meaning of the word in one repo would make every
   future grep ambiguous. Module `modules/telemetry/`, table `telemetry_events`,
   endpoint `POST /telemetry/events`, client `src/services/telemetry.{ts,web.ts}`.

2. **First-party events into our own database, not GA4.** The deciding fact: the
   cookie policy covers `ai-budget.pl` only — `app.ai-budget.pl` appears in it
   solely as the target of "Log in" links — and there is no consent mechanism
   anywhere inside the app. Putting GA4 in the logged-in product would mean
   third-party identifiers on a domain with no policy coverage, for a primarily
   Polish/EU audience, so it would require an in-app consent banner and a policy
   extension before the first event could be sent. First-party events for an
   already-authenticated user need a privacy-policy line, not a banner.
   The second reason is containment: with GA4, keeping a user's money out of the
   payload is a promise that has to hold at every call site for ever. With our
   own endpoint, the worst case of a bad call site is data sitting in a table we
   already own.

3. **The client is a platform-split no-op: `telemetry.ts` (native) and
   `telemetry.web.ts` (web).** The native file exports the same functions and
   does nothing. This is what makes "mobile is not touched" a property of the
   bundler rather than a claim: `fetch`/`window` are named only in the web
   file, **no dependency is added, no native config changes, and the Play Data
   safety declaration is unaffected**. Call sites live in shared code and are
   inert on native — but note Metro does not tree-shake, so the five no-ops and
   the ~35 call sites do ship in the AAB; it is roughly a kilobyte of dead code,
   not zero. When mobile telemetry is wanted later, implementing `telemetry.ts`
   lights up every existing call site.

4. **Screen tracking subscribes through the navigation ref, never `usePathname()`.**
   `useNavigationContainerRef()` plus `ref.addListener('state', …)` inside an
   effect observes navigation **without re-rendering the host**, which is the only
   shape allowed near `RootNavigator` (see `useFirstRunOnboarding`'s note). The
   hook is itself a platform split — `useTelemetryScreenViews.{ts,web.ts}`, native
   being an empty function — so native adds neither a listener nor a hook call.

5. **The screen name is the route pattern, not the resolved path.** `getCurrentRoute()?.name`
   yields `expense/[id]`; `usePathname()` would yield `/expense/8f3c…`. Storing the
   latter would put an expense id in a telemetry row — a leak — and would make the
   column useless by cardinality. Route patterns only.

6. **`screen` is validated by shape, not by an exhaustive list.** An enumerated
   list of all ~95 route patterns would go stale on the first new screen and drop
   its events silently — the failure mode is invisible, which is the worst kind.
   The actual risk is a resolved identifier reaching the column, so the rule
   targets exactly that: a `screen` is rejected if any segment looks like an id
   (a UUID, a hex run longer than 12, or an all-digit segment) or if the value
   contains a query string. `expense/[id]` passes; `/expense/8f3c…` does not. A
   new screen therefore reports from the day it ships, and an id can never land.

7. **Event names and prop keys are validated against an allow-list and the rest
   is silently dropped.** Not "we agreed not to send amounts" but "an amount
   has nowhere to land". Prop **values** are additionally constrained: a string
   must be one of the enumerated values for that key, and a number must be finite;
   anything else is dropped. This follows the AI-import validator's posture, and
   it is the only reason a money-handling app can carry client telemetry at all.

8. **Authenticated only. No public endpoint in v1.** A pre-login event has no JWT,
   and a public ingest endpoint is an abuse surface needing its own throttling and
   anti-fraud design. The pre-signup drop-off is already measured from both sides
   (GA4 on the landing, `acquisition*` on the user), so v1 covers the funnel
   **after** sign-in. This is a deliberate limit, not an oversight.

9. **`userId` comes from the JWT, never from the payload.** The client cannot
   attribute an event to another user even by accident.

10. **`sessionId` is random per app load and lives in memory only.** Nothing is
   persisted, so no cross-session identifier exists — which is a large part of why
   no consent banner is required. It is enough to order events within one visit,
   which is all the funnel needs.

11. **Telemetry may never degrade the product.** Every exported function returns
    `void`, never throws, and swallows its own failures. A flush that fails drops
    its batch. There is no retry queue: a lost batch is a lost statistic, and that
    is strictly preferable to a retry loop competing with the app's own requests.

12. **Events are batched and flushed on `visibilitychange` via `fetch` with
    `keepalive: true` — NOT `sendBeacon`.** A per-event request would multiply the
    request count on the platform we are trying to make faster, so a flush has to
    survive page unload. The obvious primitive for that is `sendBeacon`, and it
    cannot be used here: it accepts no custom headers, so it cannot carry
    `Authorization`, and this app keeps its JWT in localStorage rather than a
    cookie. Putting the token in the body instead would write a bearer token into
    every request log. `fetch(..., { keepalive: true })` sets headers normally and
    is explicitly specified to outlive the document.

## Data

New table, no change to any existing one:

```prisma
model TelemetryEvent {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  name      String                          // allow-listed
  screen    String?                         // route pattern, shape-validated
  platform  String                          // 'web' in v1
  sessionId String   @map("session_id")     // per app load, client-generated
  props     Json?                           // allow-listed keys and values only
  createdAt DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([createdAt])
  @@index([name, createdAt])
  @@index([userId, sessionId])
  @@map("telemetry_events")
}
```

This adds a back-relation `telemetryEvents TelemetryEvent[]` to `User`, which is
the only edit to an existing model.

`onDelete: Cascade` matters: deleting an account must take its telemetry with it,
or we would keep behavioural rows about a user who asked to be forgotten.

Retention: a daily `@Cron('0 3 * * *')` deletes rows older than 90 days, mirroring
`shopping_notification_log`. Ninety days is enough for a funnel and short enough
that the table cannot become the largest thing in the database.

### The allow-list

Event names (v1):

| name | when |
|---|---|
| `session_start` | first event of an app load |
| `screen_view` | route changed |
| `action` | a key flow moved; `props.flow` and `props.status` say which and how |

`action` props:

- `flow`: `expense_manual`, `expense_voice`, `expense_receipt`, `income_manual`,
  `import_bank`, `budget_create`, `chat_message`, `rate_alert_create`
- `status`: `started`, `completed`, `failed`, `abandoned`
- `ms`: finite number, the flow's duration (bucketed on read, stored raw)

Nothing else is accepted. Adding a flow is a one-line change to the allow-list,
which is the point: the list is the contract, in one place, on the server.

## API surface

```http
POST /telemetry/events
Authorization: Bearer <token>
Content-Type: application/json

{ "platform": "web",
  "sessionId": "…",
  "events": [ { "name": "screen_view", "screen": "expense/new", "ts": 1757… } ] }
```

- `JwtAuthGuard` (no `AccountContextGuard`: telemetry is about the person using
  the app, not about an account's data, and a `screen_view` has no account).
- `@UseGuards(ThrottlerGuard)` + `@Throttle` — paired, because this app has no
  global throttler guard and `@Throttle` alone would be inert.
- Batch capped (`@ArrayMaxSize`), each event validated and **dropped** if it fails
  rather than failing the batch: one unknown event name must not cost the other
  nineteen.
- Responds `204` always, including when every event was dropped. The client has
  nothing useful to do with a rejection and must not retry.

Admin read surface: `GET /admin/telemetry/funnel?days=` returning, per flow,
the counts of `started`/`completed`/`abandoned`/`failed` plus the top screens and
the screens most often last in a session. Rendered on a new admin page in the
existing `Stat`/`InfoHint` idiom, behind `JwtAuthGuard + AdminGuard`.

## Edge cases

- **A user signs out mid-session.** The buffer is dropped on sign-out rather than
  flushed, since the token is gone and the events belong to a session that ended.
- **The page is closed with a full buffer.** `visibilitychange` → a `keepalive`
  flush. If the browser drops it (the keepalive body cap is 64 KB, and support is
  newer in Firefox), the batch is lost by design (decision 11) — which is also why
  the batch is capped well under that ceiling.
- **A new screen nobody added to any list** reports normally: `screen` is
  shape-validated, not enumerated (decision 6), so shipping a screen is enough to
  see it. What gets dropped is a value carrying an id or a query string.
- **Clock skew.** The client `ts` is advisory only; ordering and reporting use the
  server's `createdAt`.
- **A user with telemetry from two devices** shares a `userId` but not a
  `sessionId`, which is what makes per-visit funnels correct.
- **Native accidentally importing the web file** cannot happen through Metro, but
  a direct `import '…/telemetry.web'` would defeat it. The test below pins the
  native module's behaviour, not the resolution.

## Testing

- **Pure validator** (`telemetry.validator.spec.ts`): an unknown event name is
  dropped; an unknown prop key is dropped; a known key with an unenumerated value
  is dropped; a resolved path (`/expense/8f3c…`) as `screen` is dropped; a
  non-finite `ms` is dropped; one bad event does not drop the good ones in the
  same batch; a payload-supplied `userId` is ignored.
- **Service/controller**: `userId` comes from the request, the response is `204`
  even when everything was dropped, the batch cap is enforced.
- **Retention cron**: deletes older than 90 days, keeps newer.
- **Native no-op** (`telemetry.native.spec.ts`): imports the native module by
  explicit path, calls every exported function, asserts nothing throws and
  `fetch` was never called. This is the CI expression of the "mobile
  is not touched" constraint.
- **Web batching**: the buffer flushes on the interval and on `visibilitychange`;
  the flush passes `keepalive: true` and an `Authorization` header; a failing flush
  neither throws nor retries, and the buffer is cleared before the request so a
  rejection cannot resend it.
- Layout and screen rendering remain unverifiable in CI (no
  `react-test-renderer`/`@testing-library/react-native` in this repo), so the
  screen-view wiring is confirmed by hand on the deployed web app.

## What we do not know

- **How many web users there actually are, and on what.** The claim that the
  channel is worth investing in comes from the product owner, not from a number
  we can read: `app.ai-budget.pl` serves no analytics today, which is the whole
  reason for this sub-project. The first week of data may well redirect A/B/C.
- **Whether the drop is before or after sign-in.** v1 measures only after. If the
  funnel shows almost no post-login abandonment, the loss is upstream and the next
  measurement belongs on the signup screen, which needs the public-endpoint design
  decision 8 defers.
- **What share of unload flushes actually arrive.** `keepalive` is specified to
  outlive the document, but the real-world loss rate across the browsers this
  audience uses is unknown, and by decision 11 we will not retry to find out.

## Follow-ups

- Pre-login telemetry (a public, throttled ingest endpoint) if the post-login
  funnel shows the loss is not there.
- Mobile telemetry: implement `telemetry.ts` and every call site starts reporting.
  It needs its own decision on the Play Data safety declaration first.
- Funnel definitions in the admin beyond counts — cohorts, per-`acquisitionSource`
  breakdowns joining ABA-436's columns to behaviour.
- A privacy-policy line covering product telemetry, needed before the first event
  is sent in production.
