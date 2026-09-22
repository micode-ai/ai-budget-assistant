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

**Two privacy policies must be updated together.** The marketing one under
`docs/marketing/landing/legal/`, and the one the app actually links, which lives on the **`gh-pages`
branch** and is hand-maintained. Disclosing only in the marketing copy means a user accepts, at
registration, a policy omitting the data category being collected.

## Known gaps

- `ms` is reserved and allow-listed but **no call site passes it**; the column is always absent.
- `chat_message` never reports `failed` (`sendMessage` swallows its own errors), so `completed` only
  means a message was submitted.
- `expense_receipt`'s save failures report neither terminal event and land in derived `abandoned`.
- No pre-login telemetry (needs a public throttled endpoint with its own abuse design), no mobile
  telemetry (needs a Play Data-safety decision), no cohort breakdowns.

## History

ABA-497.
