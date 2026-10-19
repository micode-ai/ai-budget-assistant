# Web product telemetry

*Hub: [mobile-app](../mobile-app.md) · [admin-dashboard](../admin-dashboard.md)*

## What this is

First-party product-usage analytics for the **web build only**, so the admin can see which screens
are opened and whether a key flow completed. No PostHog, no GA-in-app, no third party.

## Entry points

- `apps/api/src/modules/telemetry/` — ingest controller, `telemetry.validator.ts`, cleanup cron
- `apps/api/src/modules/telemetry/telemetry-admin.controller.ts` — kept physically apart from ingest
- `apps/mobile/src/services/telemetry.{ts,web.ts,types.ts}` — `telemetry.ts` is a real native no-op
- `apps/mobile/src/hooks/useTelemetryScreenViews.ts`
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
of the guide.

**Every event carries the device class (ABA-683).** `formFactor` (`phone` below 768 px, `tablet`
to 1023, `desktop` from `DESKTOP_MIN_WIDTH` = 1024, where the desktop shell starts) and `display`
(`standalone` for the installed PWA, else `browser`) ride in each event's `props`, read at push time.
The funnel classes a session by its LATEST stamped value, so a window resized across a breakpoint
counts once, where it ended; unstamped sessions read `unknown`. `GET /admin/telemetry/funnel` takes
`?formFactor=` to filter, and always returns the unfiltered `formFactors` breakdown (sessions, users,
installed sessions) so the reader sees how much each slice weighs.

**`abandoned` is derived on read**, as `max(stored, started − completed − failed)`. A screen that
has been left cannot run code to report itself.

## Invariants

**`telemetry.ts` (extensionless) is a real native no-op, not a stub re-exporting `.web`.** The
`secureStorage` / `attribution` / `fileExport` trio each have a genuine `.native.ts` **and** a
`.web.ts`, so their extensionless stub's content is arbitrary. Telemetry has no `.native.ts` — and
must not gain one, which would make the extensionless file dead code and reopen the hole. A
re-exporting stub would pull `document`, `fetch` and a live network send into the native bundle;
the no-op fails safe, which is what makes "mobile sends nothing" structural rather than a promise.

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

**`send()` reads the token directly and does NOT go through `HttpClient`.** It therefore gets none
of the 401-refresh-and-retry machinery, and while the stored JWT is expired every batch is silently
lost. That is deliberate — telemetry must never force a refresh, still less trigger `HttpClient`'s
401 → logout — and it is the one place the loss is systematic rather than random. Do not "fix" it.

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
- **Verified against real rows (2026-10-18):** for one user, `completed` counts for `expense_manual`
  and `income_manual` equalled the expense and income rows actually saved, exactly — the once-per-mount
  guard holds in practice.
- **Only `ADMIN_EMAILS` counts as internal.** A test account outside that list is still in the
  funnel.
- No pre-login telemetry (needs a public throttled endpoint with its own abuse design), no mobile
  telemetry (needs a Play Data-safety decision), no cohort breakdowns.

## History

ABA-497 · ABA-645 (`ios_install` flow) · ABA-643 (`import_report` flow) ·
[ABA-680](https://github.com/micode-ai/ai-budget-assistant/issues/710) (internal accounts excluded
from the funnel) · [ABA-683](https://github.com/micode-ai/ai-budget-assistant/issues/713) (device
class and display mode on every event).
