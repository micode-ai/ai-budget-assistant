# Product telemetry (web and native app)

*Hub: [mobile-app](../mobile-app.md) · [admin-dashboard](../admin-dashboard.md)*

## What this is

First-party product-usage analytics for the **web build** (since ABA-497) **and the native app**
(Android, iOS-safe; added on `feature/mobile-telemetry`), so the admin can see which screens are
opened — and which are not — and whether a key flow completed. No PostHog, no GA-in-app, no third
party, no SDK. The page path keeps its old `web-telemetry` name so existing links stay valid.

## Entry points

- `apps/api/src/modules/telemetry/` — ingest controller, `telemetry.validator.ts`, cleanup cron
- `apps/api/src/modules/telemetry/telemetry-admin.controller.ts` — kept physically apart from ingest
- `apps/mobile/src/services/telemetry.web.ts` — web implementation (in-memory buffer, `keepalive`)
- `apps/mobile/src/services/telemetry.native.ts` — native implementation (MMKV-persisted queue)
- `apps/mobile/src/services/telemetry.ts` — the platform-blind **no-op** stub; `telemetry.types.ts`
- `apps/mobile/src/services/telemetryPreference.ts` — the "Share usage statistics" switch (MMKV,
  default on), shown by `apps/mobile/src/components/settings/security/UsageStatisticsCard.tsx`
- `apps/mobile/src/hooks/useTelemetryScreenViews.ts` — one file for every platform
- Admin page `/telemetry`

Table `telemetry_events`; daily cleanup at 03:00 deletes rows older than 90 days.

## Key concepts

**Allow-listed, drop-don't-reject.** Three event names (`session_start`, `screen_view`, `action`),
the prop keys `flow` / `status` / `ms`, and the enumerated values of each. Anything unrecognised is
dropped; the endpoint answers **204** regardless, because the client has nothing useful to do with a
rejection and must never retry. `userId` comes from the JWT, never the payload.

**An amount has nowhere to land.** That is the reason a money-handling app can carry client
telemetry at all — not a convention that could be relaxed.

**`screen` is the route PATTERN** read off `navigationRef.getCurrentRoute()?.name` (`expense/[id]`),
never `usePathname()`'s resolved path.

**Flows are a closed list kept in two places** — mobile's `TelemetryFlow` union in
`telemetry.types.ts` and the API's `STRING_PROPS.flow` in `telemetry.validator.ts`; a flow missing
from the validator is silently dropped. `import_report` (ABA-643): `started` when the post-import
report is shown, `completed` when its suggestions are applied. `ios_install` (ABA-645): `started` when the
iPhone install card is shown, `completed` on a standalone iOS launch — the ratio is the install rate
of the guide. `capture_suggestion` (ABA-682): `started` when the one-time faster-capture suggestion appears,
`completed` when one of its options is chosen — see [faster-capture-suggestion](faster-capture-suggestion.md).

**The native transport.** Events queue in memory and are persisted in MMKV (`telemetry-queue`) —
debounced to one write per 2 s, and written synchronously on every flush and on background — so an
app killed in the background sends them on the next launch. Entries read back from storage are
filtered to well-formed ones (an object with a string `sid` and `name`). The queue is capped at 500,
dropping the oldest. It flushes every 15 s while active (the interval stops in the background and
restarts on return), on `AppState` → `background`, and when a session starts (the next launch).
Each request is bounded by a 10 s abort timeout, so a hung request cannot hold the flush lock. A flush sends at most five requests of at most 40 events
(the server's per-batch cap), each batch the leading run of ONE session's events, so the 30/min
ingest throttle holds while a backlog drains. Outcomes: 2xx removes the batch; a network error,
5xx, 408 or 429 keeps it for the next scheduled flush (never a tight retry loop); **401 drops it**
(expired token, the same deliberate loss as web); any other 4xx drops it too, because it would be
refused identically forever and block every event behind it. `platform` is `Platform.OS`.

**A native session** starts when the signed-in cold-start gate opens (`useTelemetryScreenViews`
calls `startTelemetrySession`) and again when the app returns to the foreground after **30 minutes
or more** in the background; the restarted session re-states the current screen. Before the gate
opens and after sign-out every event is dropped — there is no pre-login telemetry.

**The "Share usage statistics" switch** (Settings → Security & Encryption, phone and desktop pane)
is device-local and default on, and both implementations honour it: off clears whatever is queued
and stops queuing at once; on opens a fresh session that repeats the current screen (both
platforms keep the last reported screen for this). It **fails closed**: if the preference cannot be
read (MMKV — `localStorage` on web — throws), `isTelemetryEnabled()` answers false, so the web
client goes quiet as well as the native one rather than sending for a user who may have opted out. The copy never says "anonymous" — events are
linked to the signed-in account, as the privacy policy states. It is not viewer-gated: it is a
preference about this device, not a write to an account.

**Every event carries the device class (ABA-683).** `formFactor` (`phone` below 768 px, `tablet`
to 1023, `desktop` from `DESKTOP_MIN_WIDTH` = 1024, where the desktop shell starts) and `display`
(`standalone` for the installed PWA, else `browser`) ride in each event's `props`, read at push time.
The funnel classes a session by its LATEST stamped value, so a window resized across a breakpoint
counts once, where it ended; unstamped sessions read `unknown`. The native app stamps `formFactor` `phone` or `tablet` by the
screen's **shortest side** (600 dp and up is a tablet, so rotating does not reclassify) and
`display: 'app'`. `GET /admin/telemetry/funnel` takes `?formFactor=` to filter, and always returns
the `formFactors` breakdown unfiltered by device class (sessions, users, installed sessions) so the
reader sees how much each slice weighs.

**Platform filter and least-used screens.** The funnel also takes `?platform=web|android|ios`
(validated against `TELEMETRY_PLATFORMS` in the validator, the same list ingest uses; anything else
means no filter). It is a column filter in the query, so the row ceiling applies to that platform
alone, and it narrows every figure including the device breakdown. `screenUsage` lists every screen
opened in the window with its distinct users and views, **least-used first** (ties on views, then
name) — the admin page's "Screens, least used first" table. A screen nobody opened is absent, not a
zero row: there is no list of all routes to compare against.

**A `failed` can say why ([ABA-732](https://github.com/micode-ai/ai-budget-assistant/issues/770)).** `trackFailure(flow, reason)` sends the
same `failed` action plus `reason` from a closed list — `amount`, `categories`, `save` — mirrored by
`TelemetryFailReason` on mobile and `STRING_PROPS.reason` in the validator. Never an error message:
one could carry an amount or a name. First caller: `BudgetCreateForm`.

**`abandoned` is derived on read**, as `max(stored, started − completed − failed)`. A screen that
has been left cannot run code to report itself.

## Invariants

**`telemetry.ts` (extensionless) stays a no-op, never a re-export.** Until the native app sent
telemetry, that file WAS the native implementation and the rule was "no `.native.ts`". Now both
platforms have a real file — `telemetry.native.ts` and `telemetry.web.ts` — and Metro picks one at
bundle time (the Android export contains the native queue and the web export does not; checked by
grepping both bundles). The extensionless file is what a platform-blind resolver sees (TypeScript),
so it decides what a resolution surprise does: a re-export of either sibling would make that
surprise a live network send, while the empty bodies fail safe. `telemetry.stub.test.ts` pins the
empty bodies. **Note for tests:** jest-expo resolves with React Native's haste platforms (`ios`,
then `native`), so a bare `'../telemetry'` in Jest reaches `telemetry.native.ts`, not the stub; the
stub test requires `'../telemetry.ts'` by full name. Nothing in the native file runs at import time
(no timer, listener or storage read), which is why the rest of the suite is unaffected.

**`isSafeScreen`'s three per-segment checks are all load-bearing.** A segment must start like a
route segment, must not be 8+ characters of contiguous hex, and must not be a hyphenated UUID. The
UUID check is **not** redundant with the hex check: a UUID's hyphens break the contiguous-hex match,
leaving only the start gate, which catches just the ~62% of UUIDs beginning with a digit. Removing
it accepted **7 374 of 20 000** random UUIDs; that regression shipped once and had to be reverted,
masked by a digit-leading UUID in the spec passing via the start gate.

**It is a whitelist of shape, never a blacklist of known id forms.** The earlier blacklist let
`1234.56`, `-99.99` and `expense/8f3c1d2e4a5` through. Do not "tighten" it with an enumerated route
list (a new screen must report from the day it ships), an uppercase-initial ban (PascalCase files
exist under `app/`), or a general long-token-with-digits rule.

**Mobile's `TelemetryFlow` / `TelemetryStatus` unions must equal the validator's lists**, or a real
event vanishes with nothing failing anywhere.

**`started` and `completed` fire at most once per mount.** Four screens let a user submit
repeatedly without unmounting, so a ten-receipt batch reported 1 started against 10 completed —
putting completion above 100% and pinning derived `abandoned` at 0 for exactly the flows this was
built to measure. Each guards `completed` with a `useRef`. `failed` is deliberately **not**
deduplicated: repeated validation failures in one visit are a real error-rate signal.

**No unmount handler may ever emit `abandoned`.** An unmount also fires on a successful navigation
away, which would count completions as abandonments.

**The flush uses `fetch(..., { keepalive: true })`, not `sendBeacon`.** `sendBeacon` takes no custom
headers and the JWT lives in `secureStorage`, not a cookie, so it would have to go in the request
body — landing the bearer token in every access log.

**`send()` reads the token directly and does NOT go through `HttpClient`** — on both platforms. It therefore gets none
of the 401-refresh-and-retry machinery, and while the stored JWT is expired every batch is silently
lost. That is deliberate — telemetry must never force a refresh, still less trigger `HttpClient`'s
401 → logout — and it is the one place the loss is systematic rather than random. Do not "fix" it.
The native client keeps a batch on a network error (it persists anyway), but drops it on a 401 for
exactly this reason.

**The native queue has an owner and never sends another user's events.** The queue is stored
with the user id it was recorded for (`owner`); `useTelemetryScreenViews` passes the signed-in
user's id to `startTelemetrySession`, which clears the queue when the stored owner differs or
either is unknown. Sign-out alone was not enough: a biometric saved-session whose tokens turn out
invalid is dropped without a sign-out, and the next password login would otherwise have sent the
old user's backlog under the new token (that branch of `biometricLoginAction` now also calls
`resetTelemetry`). The session id lives on each queued event only to be lifted to the batch; it
never appears inside an event on the wire.

**A drain never outlives a sign-out.** `resetTelemetry` and an owner change bump a module
`generation`; a drain captures it at its start and gives up after every `await` once it differs,
and it reads the token per request rather than once per drain. Without both, a request in flight
across a sign-out was followed by the next user's events posted with the previous user's token.

**No device details beyond the two buckets.** Native sends no model, OS version or raw screen size —
the shortest-side bucket and `display: 'app'` only. Adding any of them would fingerprint, and the
validator would drop them anyway (`telemetry.validator.spec.ts` pins that).

**The funnel read has a hard row ceiling.** Aggregation happens in JS (grouping by a JSON field
would need raw SQL), so the query takes 200 000 rows newest-first and sets `truncated` when it hits
it. A date window bounds the range but not the row count, and ~100 daily users × ~200 navigations ×
90 days is ~1.8M objects against a 768 MB heap — the shape of failure that OOM-killed this container
once already.

**The funnel leaves internal accounts out by default.** `ADMIN_EMAILS` accounts (parsed by
`admin/admin-emails.util.ts`, the same list `AdminGuard` uses) are resolved to ids and filtered with
`userId notIn` before the row ceiling applies; `?includeInternal=true` and the admin page's toggle
restore them. The default exists because in the first six weeks (2026-09-04 → 10-17) one internal
account held 82% of all web sessions across 11 users, so the unfiltered funnel mostly measured the
team. An unset or unmatched list must add **no** filter — never a `notIn: []` that reads as a
deliberate clause. The response reports `internalExcluded`, `excludedAccounts` and `users`, so the
page always says which population it shows.

**Device fields go in `props`, never at the top level of the batch.** The global `ValidationPipe` is
`forbidNonWhitelisted`, and web and API deploy independently: a new top-level field reaching an API
one deploy behind is a 400 that loses the whole batch, while an unknown prop key is dropped by the
allow-list and the event kept. That is also why ABA-683 needed no migration. Only the three buckets
and the two display values exist — never the raw width or the user agent, which would fingerprint.

**Two privacy policies must be updated together.** The marketing one under
`docs/marketing/landing/legal/`, and the one the app actually links, which lives on the **`gh-pages`
branch** and is hand-maintained. Disclosing only in the marketing copy means a user accepts, at
registration, a policy omitting the data category being collected.

**Test "nothing extra is sent" field by field, never by substring.** The batch carries
epoch-millisecond timestamps, so asserting that its JSON does not *contain* a value (the mocked
window width `1280`) fails whenever a `ts` happens to include those digits — it turned CI red on
2026-11-15 (ABA-780). Assert the exact keys of each event and that no prop equals the value.

## Known gaps

- `ms` is reserved and allow-listed but **no call site passes it**; the column is always absent.
- `chat_message` never reports `failed` (`sendMessage` swallows its own errors), so `completed` only
  means a message was submitted.
- `expense_receipt`'s save failures report neither terminal event and land in derived `abandoned`.
- **`started` means different things per flow** — read the funnel with the call site open.
  `chat_message` fires `started` on chat-screen mount, so started→completed is "opened chat →
  sent a message", not a broken send. `import_bank` fires `started` only on the **preview** screen,
  so a user who opened `settings/import/index` but never got a parsed file reports nothing at all.
- **A session is one page load** (or a sign-out), not a visit. There is no reload in the app's own
  code, so a burst of one-screen sessions minutes apart is the browser reloading the tab — most
  likely a phone browser discarding it while the user switches apps. The device class (ABA-683) now
  makes that testable: such bursts should cluster under `phone`.
- **Event times are flush times**, quantized to the 15 s flush interval: the server's `createdAt`
  is used and the client `ts` is advisory. Order inside one batch is preserved, sub-15 s timing is not.
- **`budget_create` `failed` is a validation message, not a broken save (checked 2026-11-09).** Every
  `failed` in `BudgetCreateForm` but the last is one of the three form checks (no name, no or
  unparseable amount, by-category with no allocations), and the `catch` cannot fire in practice
  because `addBudget` persists fire-and-forget. All three prod `failed` events belonged to two users
  who saved a budget 3–15 s later (confirmed in `budgets`). Those events carried no reason;
  since [ABA-732](https://github.com/micode-ai/ai-budget-assistant/issues/770) they do (see `reason` above), and the name check is gone.
- **`started` sometimes lands while the last recorded screen is unrelated** (settings, account
  screens) — for `budget_create`, `expense_manual`, `expense_receipt` and `income_manual` alike,
  across several users, within ONE session id (so not two tabs). Unexplained as of 2026-11-09. The
  desktop dashboard opens these flows as dialogs, which emit no `screen_view`, and the dashboard tab
  stays mounted under pushed screens; do not read a flow's last screen as where it was opened from.
  **Ruled out in prod on 2026-11-09** (desktop, 1920 px, fetch hooked to log every sent event):
  walking settings → profile → accounts → data emits screen views only; opening the dashboard's
  expense dialog and leaving it with browser Back closes it (no hidden mount survives), and walking
  settings afterwards and returning to the dashboard emits no further `started`. Still open: the
  first-run `get-started` / `welcome` hosts and narrow-window layout switches.
- **Verified against real rows (2026-10-18):** for one user, `completed` counts for `expense_manual`
  and `income_manual` equalled the expense and income rows actually saved, exactly — the once-per-mount
  guard holds in practice.
- **Only `ADMIN_EMAILS` counts as internal.** A test account outside that list is still in the
  funnel.
- No pre-login telemetry (needs a public throttled endpoint with its own abuse design), no cohort
  breakdowns.
- **Native event times can be hours or days late.** A queue persisted while offline or killed is
  stored with the server's `createdAt` at the eventual flush, so an offline evening reads as the next
  morning. The client `ts` is sent but not stored.
- **A native session is not a web session.** Web: one page load. Native: one cold launch, or a
  return after 30+ minutes in the background. Compare session counts across platforms with that open.
- **Only instrumented flows report actions.** Native screens report screen views automatically, but
  flow events come only from the call sites already instrumented for web (`TelemetryFlow`).
- **Opted-out users are invisible**, not zero: the funnel cannot tell how many there are.
- **A queue recorded without a known user id is cleared on the next start**, so a cold start
  that opens the gate before the user object is loaded would lose that backlog — the safe
  direction, never sending it under the wrong account.
- **Not yet observed on a device** at the time of writing: the transport is covered by
  `telemetry.native.test.ts` and both bundles build, but no Android/iOS run has been watched sending
  a batch.

## History

ABA-497 · [ABA-732](https://github.com/micode-ai/ai-budget-assistant/issues/770) (`reason` on `failed`) · ABA-645 (`ios_install` flow) · ABA-643 (`import_report` flow) ·
[ABA-680](https://github.com/micode-ai/ai-budget-assistant/issues/710) (internal accounts excluded
from the funnel) · [ABA-683](https://github.com/micode-ai/ai-budget-assistant/issues/713) (device
class and display mode on every event) · native app telemetry, the "Share usage statistics" switch,
the admin platform filter and least-used screens table ([ABA-859](https://github.com/micode-ai/ai-budget-assistant/issues/897), 2026-11-28).
