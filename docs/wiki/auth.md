# Authentication

## What this is
The end-to-end authentication system spanning the NestJS API (`modules/auth/`) and the mobile app (`app/(auth)/`). Handles registration, login, JWT lifecycle, password reset, and account context injection.

## Entry points
- `apps/api/src/modules/auth/auth.controller.ts` — public endpoints: `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/forgot-password`, `POST /auth/reset-password`
- `apps/api/src/modules/auth/auth.service.ts` — token generation, bcrypt hashing, 6-digit reset-code logic
- `apps/api/src/modules/auth/guards/` — `JwtAuthGuard` (validates Bearer token), `JwtRefreshGuard`
- `apps/api/src/modules/auth/strategies/` — Passport JWT strategies
- `apps/mobile/app/(auth)/` — login, register, forgot-password, reset-password screens
- `apps/mobile/src/stores/authStore.ts` — persists tokens, exposes `login()`, `logout()`, `refreshToken()`
- `apps/mobile/src/services/api.ts` — auto-injects `Authorization` header; catches 401 → calls `refreshToken()` → retries

## Key concepts
- **JWT pair** — short-lived access token + long-lived refresh token; refresh is transparent to the user via `ApiClient`
- **Account context** — after auth, every request must include `X-Account-Id` header; `AccountContextGuard` resolves membership and injects `accountId` + `accountRole`
- **Password reset** — 6-digit code sent by email; in-memory rate limiting on API side; code stored bcrypt-hashed; endpoints: `POST /auth/forgot-password`, `POST /auth/reset-password`
- **Admin auth** — admin dashboard uses the same `POST /auth/login` endpoint but stores tokens in localStorage under `admin_token` / `admin_refresh_token`

## Cross-references
- Talks to: `mail` module — forgot-password triggers `MailService.sendResetCode()`
- Guards: all non-public API routes use `JwtAuthGuard` then `AccountContextGuard`

## Where to look first
Token lifecycle issues → `apps/mobile/src/services/api.ts` and `apps/mobile/src/stores/authStore.ts`. Server-side auth logic → `apps/api/src/modules/auth/auth.service.ts`.
