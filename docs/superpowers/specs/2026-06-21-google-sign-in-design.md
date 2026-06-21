# Google Sign-In / Sign-Up — Design Spec

**Date:** 2026-06-21
**Status:** Approved (design), pending implementation plan
**Scope:** Add "Continue with Google" login + registration to the existing email/password auth, on **mobile (iOS/Android)** and **web (app.ai-budget.pl)**. Admin dashboard is out of scope.

## Goal

Let users sign in and register with their Google account, alongside the existing
email + password flow. Reuse the existing JWT (access + refresh) session model so
the rest of the app is unchanged downstream of authentication.

## Key Decisions

| Decision | Choice |
|---|---|
| Platforms | Mobile (iOS/Android) + Web. **Not** admin. |
| Account linking | **Auto-link by verified email**: if Google `email_verified` matches an existing account, sign into that account and attach `googleId`. |
| Client OAuth library | `expo-auth-session` (pure JS, no new native module — avoids the Windows MAX_PATH / prebuild risk called out in CLAUDE.md). Works on both mobile and web. |
| New-user onboarding | Create immediately with defaults: name + email from Google, `language` from the app UI locale, `currencyCode` default `USD`, `isVerified = true`. User changes currency/name later in Settings. Terms acceptance shown as text next to the button. |
| Token verification | Backend verifies the Google **ID token** server-side via `google-auth-library`. Client claims are never trusted. |

## Architecture

Single thin backend endpoint shared by mobile and web. The client obtains a Google
ID token via `expo-auth-session`, posts it to the backend, the backend verifies it
and returns our normal JWTs.

```
[Mobile/Web]  --expo-auth-session-->  [Google]  --id_token-->  [Mobile/Web]
   --POST /auth/google { idToken }-->  [API: verifyIdToken]
   <--{ accessToken, refreshToken, user, accounts }--
```

The response shape is **identical** to `POST /auth/login`, so `authStore` /
`accountStore` hydration reuses the existing post-login path.

## Data Model Changes

`apps/api/prisma/schema.prisma` — `User` model:

- `googleId String? @unique @map("google_id")` — link to the Google account (`sub`).
- `passwordHash` becomes **nullable** (`String?`) — Google-only users have no password.
  Existing rows keep their hash; this is an additive, non-destructive change.

Migration: `add_google_auth` (add `google_id` unique nullable + make `password_hash` nullable),
then `npx prisma generate`.

Mobile SQLite / shared-types: no required schema change for v1. Add an optional
`googleId` to the shared `User` type only if the UI needs to display it (not required
for the core flow).

## Backend (`apps/api/src/modules/auth/`)

### New endpoint
`POST /auth/google` — public (`skipAuth`), under the existing throttler.

Body (`GoogleAuthDto`): `{ idToken: string, language?: string, currencyCode?: string, referralCode?: string }`.

### `AuthService.googleLogin(dto)`
1. Verify the ID token with `google-auth-library`
   `OAuth2Client.verifyIdToken({ idToken, audience: GOOGLE_OAUTH_CLIENT_IDS })`
   (multiple client IDs: web / iOS / Android). Reject invalid/expired tokens.
2. Require `payload.email_verified === true`. Extract `sub`, `email`, `name`, `locale`.
3. Resolve the user:
   - Find by `googleId` → sign in.
   - Else find by `email`:
     - **Found** → auto-link: set `googleId` (and `isVerified = true` if not), sign in.
     - **Not found** → create user: `name`/`email` from Google, `language` from
       `dto.language` ?? mapped `locale`, `currencyCode` from `dto.currencyCode` ?? `USD`,
       `isVerified = true`, **no password**. Create the default personal account (same as
       `register()`). Apply `referralCode` using the existing referral handling.
4. Issue tokens via the existing `generateTokens()` and return
   `{ accessToken, refreshToken, user, accounts }` — same shape as `login()`.

### `AuthService.login()` change
If a matched user has `passwordHash == null`, return a clear error directing them to
sign in with Google (instead of a generic "invalid credentials").

### New dependency / env
- Add `google-auth-library` to `apps/api/package.json`.
- New env var `GOOGLE_OAUTH_CLIENT_IDS` — comma-separated list of accepted audiences
  (web + iOS + Android client IDs). Document in `.env.example`.

## Client (Expo — mobile + web)

- `useGoogleAuth` hook wrapping `expo-auth-session/providers/google` `useAuthRequest`;
  exposes `promptAsync()` and extracts `idToken` on success.
- `auth.api.ts`: `loginWithGoogle(idToken, language?, currencyCode?, referralCode?)`
  → `POST /auth/google` (`skipAuth: true`).
- `authStore.googleLogin(...)`: reuse the shared post-login logic (store tokens in
  `secureStorage`, init `accountStore` from `response.accounts`, hydrate stores, set
  `isAuthenticated`). Enable biometric as for a verified user.
- "Continue with Google" button on both `app/(auth)/login.tsx` and
  `app/(auth)/register.tsx`, with terms-acceptance text next to it.
- Config via env baked at build time:
  `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`,
  `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`. Redirect: native app scheme for mobile,
  `https://app.ai-budget.pl` for web.

## i18n

New keys in **all 9 locales** (en/de/es/fr/pl/ru/ua/be/nl):
- `auth.continueWithGoogle` (button)
- `errors.googleEmailNotVerified`
- `errors.googleSignInFailed`
- `errors.usePasswordLogin` (shown when a Google-only account tries password login,
  or vice-versa)

## Security

- ID token verified **only on the server**: issuer (Google) + audience (our client IDs)
  + `email_verified`.
- `googleId` is unique.
- Endpoint is rate-limited via the existing throttler.
- Admin auth is untouched.

## Testing

Backend unit tests for `googleLogin` (mock the Google verifier):
- new user created;
- auto-link to an existing account by email;
- sign in by existing `googleId`;
- `email_verified === false` → rejected;
- invalid/expired token → rejected.

Plus a controller routing test for `POST /auth/google`.

## Out of Scope (v1)

- Native Google account picker (`@react-native-google-signin/google-signin`).
- Link / unlink Google from the profile settings screen.
- Storing the Google avatar.

## Prerequisite (manual, outside code)

In Google Cloud Console: configure the OAuth consent screen and create **OAuth Client
IDs** (Web + iOS + Android), with the correct redirect URIs / app scheme. The client
cannot function without these IDs and `GOOGLE_OAUTH_CLIENT_IDS` on the API. This can be
done in parallel with implementation.
