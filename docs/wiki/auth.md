# Authentication

*Related: [restore-credentials](features/restore-credentials.md),
[last-active-tracking](features/last-active-tracking.md)*

## What this is
The end-to-end authentication system spanning the NestJS API (`modules/auth/`) and the mobile app (`app/(auth)/`). Handles registration, email verification, login, Google sign-in, JWT lifecycle, password reset, email change, and account context injection.

## Entry points
- `apps/api/src/modules/auth/auth.controller.ts` — public endpoints: `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `POST /auth/verify-email`, `POST /auth/resend-verification`, `POST /auth/google`; JWT-guarded: `POST /auth/change-email/request`, `POST /auth/change-email/confirm`
- `apps/api/src/modules/auth/auth.service.ts` — token generation, bcrypt hashing, the 6-digit code flows, `googleLogin`, `buildAuthResponse`
- `apps/api/src/modules/auth/google-token-verifier.ts` — `GoogleTokenVerifier`, the server-side ID-token check
- `apps/api/src/modules/auth/guards/jwt-auth.guard.ts` — `JwtAuthGuard` (validates Bearer token)
- `apps/api/src/modules/auth/strategies/jwt.strategy.ts` — Passport JWT strategy; also stamps last-activity (see [last-active-tracking](features/last-active-tracking.md))
- `apps/mobile/app/(auth)/` — login, register, forgot-password, reset-password screens
- `apps/mobile/src/features/auth/useGoogleAuth.ts` — the Google sign-in hook (web and native paths)
- `apps/mobile/app/oauth.tsx` — the native Google relay landing route
- `apps/mobile/app/settings/change-email.tsx` — the email-change screen
- `apps/mobile/src/stores/authStore.ts` — persists tokens, exposes `login()`, `googleLogin()`, `logout()`, `refreshToken()`
- `apps/mobile/src/services/http-client.ts` — base `HttpClient` used by every `*.api.ts` module; auto-injects `Authorization` header, catches 401 → calls `refreshToken()` → retries. Composed into the `api` singleton in `services/api.ts`.

Migration: `20260621000000_add_google_auth` (`User.googleId String? @unique`, `passwordHash` made nullable).

## Key concepts
- **JWT pair** — access token (`JWT_EXPIRES_IN`, 7 days in prod) + refresh token; refresh is transparent to the user via `HttpClient`.
- **Account context** — after auth, every account-scoped request carries an `X-Account-Id` header; `AccountContextGuard` resolves membership and injects `accountId` + `accountRole`.
- **6-digit code flows** — password reset (`forgot-password` → `reset-password`), email verification, and email change all send a random 6-digit code by email, store only its bcrypt hash plus an expiry on the user row, and compare with `bcrypt.compare`. `forgotPassword` rate-limits *before* the user lookup and always returns the same message, so neither timing nor response reveals whether an email is registered.
- **Email change** — `change-email/request` requires the current password and sends a code to the new address; `change-email/confirm` swaps the email and returns a fresh token pair (the old access token carries the old email).
- **Google sign-in (ABA-282)** — the client obtains a Google **ID token** via `expo-auth-session` (no native module) and posts it to `POST /auth/google`. `GoogleTokenVerifier` checks it against the audiences in `GOOGLE_OAUTH_CLIENT_IDS` (unset → 503 "not configured"), and `googleLogin` requires `email_verified === true`. Resolution order: by `googleId` → **auto-link by verified email** (sets `googleId`, marks the account verified; a deactivated account is rejected and not linked) → otherwise create a verified, passwordless user (name and email from Google, language and currency from the client, default USD) plus a default account. The response has the same shape as `/auth/login`, built by `buildAuthResponse`.
- **Two client paths for Google** — web uses the generic `useAuthRequest` with `responseType: IdToken`; native opens a browser on a URL it builds itself, redirecting through the `https://ai-budget.pl/oauth/callback/` relay, which bounces the token to `budget://oauth` → `app/oauth.tsx`.
- **Admin auth** — the admin dashboard uses the same `POST /auth/login` endpoint but stores tokens in localStorage under `admin_token` / `admin_refresh_token`.

## Invariants
- **A passwordless account must never reach a bcrypt compare.** `login()` rejects a null `passwordHash` with "Use Google sign-in for this account", and `changeEmailRequest()` rejects it too — there is no password to verify, and `bcrypt.compare` against `null` would throw rather than fail cleanly.
- **The web Google request must carry a `nonce` (ABA-291).** Google's OpenID implicit flow requires one; the generic `useAuthRequest` (unlike `providers/Google`) does not add it, and without it web sign-in failed with `Error 400: invalid_request / GeneralOAuthFlow`. `useGoogleAuth` generates it once with `useMemo` and passes `extraParams: { nonce }`; the native path adds its own in `signInNative()`.
- **The relay URI keeps its trailing slash.** `/oauth/callback` (no slash) 301-redirects with a scheme downgrade, and the `#id_token` fragment is lost across that hop.
- **Auto-link only on a Google-verified email.** Linking on an unverified address would let anyone who controls a Google account with that address string take over the password account.
- **`app/oauth.tsx` must exist as a route.** expo-router's linking captures the `budget://oauth` deep link before `WebBrowser.openAuthSessionAsync` can, and an unregistered path renders "Unmatched route".
- **Acquisition fields are written in `googleLogin` too.** A Google signup never passes through `register()`/`verifyEmail()`, so omitting them there makes every Google signup read as unattributed.

## Known gaps
- The code-flow rate limits (`resetRequestAttempts`, `emailChangeVerifyAttempts`, …) are in-memory `Map`s on `AuthService`, reset on every deploy and not shared between instances — tracked as tech-debt `auth-rate-limit-in-memory-maps` (`docs/tech-debt/auth-rate-limit-in-memory-maps.md`). The fix pattern exists: `CacheService.incrementWindow`.
- `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` is read nowhere — native sign-in uses the web OAuth client through the relay.

## Cross-references
- Talks to: `mail` module — the code flows send through `MailService`
- Guards: all non-public API routes use `JwtAuthGuard` then `AccountContextGuard`

## History
ABA-282 (Google sign-in) · ABA-291 (web nonce) · ABA-389 (last-activity stamping moved into `JwtStrategy`) · ABA-464/465 ([restore credentials](features/restore-credentials.md)).
