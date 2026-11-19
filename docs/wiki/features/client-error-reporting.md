# Client error reporting

*Hub: [mobile-app](../mobile-app.md) · [admin-dashboard](../admin-dashboard.md)*

## What this is

The app's own crash reporting: a render error caught by `ErrorBoundary`, or an uncaught JS error on
native, is sent to the API, stored for 90 days, and announced once a day per distinct bug in the
ops Telegram channel. There is no crash-reporting SDK — `@sentry/react-native` is not a dependency —
so before this (ABA-832) a user stuck on "Something went wrong" on every launch was invisible to us.

It covers **JS** errors only. A native crash before any JS runs (the class
[ABA-188's `super.onCreate(null)`](../../../CLAUDE.md) prevents) still shows up only in Play Console
Android vitals or `adb logcat`.

## Entry points

- `apps/mobile/src/components/ErrorBoundary.tsx` — reports from `componentDidCatch`, and shows the
  shortened error message under the subtitle so a user's screenshot is useful to support
- `apps/mobile/src/hooks/useClientErrorReporting.ts` — called from `RootNavigator` in
  `app/_layout.tsx`; wraps `ErrorUtils`' global handler and remembers the last route pattern
- `apps/mobile/src/services/clientErrors.ts` — `reportClientError({ error, componentStack, fatal })`
- `apps/mobile/src/services/clientErrorReport.ts` — the pure parts (truncation, dedupe key, payload)
- `apps/mobile/src/services/globalErrorHandler.ts` — the `ErrorUtils` wrapper, pure over its inputs
- `apps/mobile/src/services/clientErrors.api.ts` — `POST /telemetry/client-errors`, spread into `api`
- `apps/api/src/modules/telemetry/client-errors.service.ts` — store + ops alert
- `apps/api/src/modules/telemetry/client-error.util.ts` — redaction, fingerprint, limits
- `apps/api/src/modules/telemetry/telemetry.controller.ts` — the route; `telemetry-cleanup.cron.ts` — retention

Table `client_errors`. `ReportClientErrorRequest` in `packages/shared-types/src/dto/telemetry.ts`.

## Key concepts

**One bug, one fingerprint.** `sha1(message + "\n" + first stack frame)`, computed on the server from
the redacted values. The first frame skips the `Error: message` header — V8/Hermes frames start with
`at `, JSC frames are `fn@file:line:col`. Deeper frames are deliberately ignored, so the same crash
reached through two call paths groups together.

**One ops alert per fingerprint per 24 h.** `CacheService.setIfAbsent('client-error:{fp}', 86400)`.
The alert names platform, version (the About-screen string: `1.42.0 (310)` native,
`1.42.0+abc1234` web), the user **id** (never the e-mail), and the first 300 characters of the
message and of the first frame, HTML-escaped because the ops notifier sends `parse_mode: HTML` and a
React error message routinely contains `<View>`. Every report is stored regardless of the alert.

**Route is the last pattern seen, not a live lookup.** `useClientErrorReporting` listens on the
navigation ref (which never re-renders `RootNavigator`) and stores `getCurrentRoute()?.name` in a
module variable. By the time `ErrorBoundary.componentDidCatch` runs, the crash has already unmounted
the navigator it would ask.

**A fatal global error waits up to 1.5 s for its report.** In a release build RN's own fatal handler
kills the process, so calling it straight away would mean the one report we most need never leaves
the device. A non-fatal error calls the previous handler immediately.

## Invariants

**`reportClientError` never throws and never rejects.** It runs inside an error boundary and inside
the global error handler; a throw there would replace the real error with ours. Failures are
`console.warn`, never `console.error` (LogBox).

**Deduped per app session on the device as well as throttled on the server.** A render loop, or a
user pressing "Try Again" on a screen that crashes again, must send one report, not one per render:
the client lets each `message + first frame` key through once and at most 20 distinct keys per
session; the route is `@Throttle` 10/min (per IP — the default tracker) behind its own
`ThrottlerGuard`, because this app registers no global one.

**The DTO's `@MaxLength` is a transport ceiling, about twice the stored limit.** The global
`ValidationPipe` turns a violation into a hard 400 and the client never retries, so a bound at the
stored size (message 1000, stack and component stack 8000, route 200, locale 10) would silently drop
exactly the oversized stack we most need. The service truncates; the client truncates too.

**Redact before storing and before alerting.** Bearer tokens, bare JWTs and e-mail addresses are
replaced in message, stack, component stack and route. `userId` comes from the JWT, never the body,
and the DTO is a class, so `forbidNonWhitelisted` rejects any extra field.

**The global handler is installed once and never uninstalled.** A render crash unmounts the
component that installed it. `installGlobalErrorHandler` is idempotent and is a no-op without
`ErrorUtils` — web has none, and there `ErrorBoundary` is the only reporter.

**Nothing native-only is imported.** `clientErrors.ts` uses `Platform`, the already platform-split
`secureStorage`, `clientHeaders()` and `i18next`; the web bundle reports through the same path.

## Known gaps

- **Unlike web telemetry, this goes through `HttpClient`**, so an expired token triggers the
  ordinary refresh — and a failed refresh the ordinary logout. Acceptable for a report sent at most
  a few times a session; web telemetry's "never force a refresh" rule is about a 15-second batch.
- Not signed in → nothing is sent (the endpoint is authenticated). A crash on the sign-in screen is
  not reported.
- No admin page reads `client_errors` yet; query it on the database (`fingerprint`, `created_at`).
- Errors thrown before `RootNavigator`'s first effect (module initialisation) are not seen by the
  global handler.
- The privacy policies (see [web-telemetry](web-telemetry.md) — two copies, one on `gh-pages`) do not
  yet name crash reports as a data category.

## History

- ABA-832 — created: a user on Android 1.42.0 hit the error screen on every launch after hydration
  and nothing reached us.
