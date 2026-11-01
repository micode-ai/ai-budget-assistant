# Public API — phase 1: OAuth platform + expenses

Status: approved by the product owner · 2026-11-01

## Intent and why

AI Budget's functionality should be usable from other products, not only from our own app and bots.
Anyone who wants to should be able to build on it, with an open, self-explanatory Swagger
reference. The first real consumer is our own **AI Accounting** product (eksiegowyai.pl), which
wants to work with a user's AI Budget data from inside its own UI.

The long-term goal is "everything the backend can do" — expenses, incomes, budgets, goals,
analytics and so on. Phase 1 builds the platform every later phase rests on, and opens **expenses**
on it. Later phases add domains to the same platform without redesigning it.

## Decisions made with the product owner

- **Connection model:** a "Connect AI Budget" button in the third-party product opens our login
  plus a consent screen; the user approves and is sent back. Standard OAuth 2.0 authorization code
  flow. The third party never sees the user's password.
- **Who can register an app:** any AI Budget user, self-serve, no manual review. Keys are issued
  immediately.
- **Price:** API access is free. (Our call, below: the user's own tier still applies.)
- **Phase 1 scope:** expenses.
- **Who can connect an account:** its **owner or an editor**. Viewers can't (their accounts appear
  disabled on the consent screen with a reason).
- **AI Accounting** is treated as **our own app**: verified, with higher limits (see §10a).
  Incomes stay in a later phase.
- **Learning about new expenses:** the third party polls a "what changed since cursor X" feed.
  Push webhooks are a later phase; the feed is designed so they can be added without changing it.

## Goals

1. A third-party developer can, without contacting us: register an app, read the Swagger reference
   and guide, implement "Connect AI Budget", and list / read / create / update / delete a user's
   expenses, download receipt files, and incrementally sync changes including deletions.
2. A user can see every app connected to their data and revoke any of them in one action.
3. An admin can block an abusive app instantly.
4. AI Accounting can ship its integration on phase 1 alone.

## Non-goals (phase 1)

- Incomes, budgets, goals, analytics, debts, categories write, tags/projects write, AI features
  (chat, OCR, voice) — later phases on the same platform.
- Webhooks / push notifications to third parties.
- Personal API keys / `client_credentials` grant (machine access without a user).
- One grant spanning several accounts — a grant is for exactly one account (see below).
- Accounts with end-to-end encryption (see Constraints).
- Uploading receipt images through the public API.

## Anti-goals (a failure even if it "works")

- **Breaking the internal API or the app.** The public API is a separate, versioned layer; the
  internal `/api/v1` routes keep evolving with the app and must not be constrained by it, and the
  public layer must not change shape silently under integrators.
- **An app seeing data the user didn't grant** — another account, another user, or a scope not
  approved.
- **An app bypassing a rule the app enforces** — viewer role, archived trip, subscription tier.
- **Leaking credentials** — client secrets, access/refresh tokens stored or logged in plaintext.
- **Tokens that can't be revoked.** Revoking a connection or blocking an app must stop access on the
  next request, not when a 7-day JWT expires.

## Constraints and facts from the codebase

- No authorization server exists today. User auth is a stateless JWT (`{sub,email}`, 7 days) plus a
  stateless refresh JWT (30 days) with no revocation (`auth.service.ts:607-626`). This is why the
  public API must NOT reuse user JWTs.
- Account scoping is `AccountContextGuard` (`x-account-id` header or default account) and writes are
  protected with `ViewerBlockGuard` / `TripArchivedGuard`. The public layer must produce the same
  `req.accountId` / `req.accountRole` from the token instead of a header.
- Expenses: `ExpensesService` already offers create (idempotent upsert on `(accountId, clientId)`),
  findAll (offset pagination, `date desc`), findOne (by `id` or `clientId`), update, soft delete
  (`isDeleted` + `syncVersion`), line items, receipt image (bytea on the row, served as base64 JSON
  internally). Public endpoints call these services; they do not reimplement business logic, so
  side effects (anomaly checks, family feed, gamification, merchant rules, cache busts) fire exactly
  as for an app write.
- Tombstones exist: `/sync/pull` queries `updatedAt > since` including deleted rows. There is **no
  index on `expenses.updated_at`** — the changes feed needs one (migration in the same commit as the
  schema change, per CLAUDE.md).
- **E2EE:** encryption is client-side; the server cannot decrypt and neither can a third party.
  At `encryptionTier = 1` only the text fields (description, notes, merchant, location name, debt
  contact) are ciphertext; amounts, dates and categories are plaintext. At `encryptionTier >= 2`
  amounts are ciphertext too (the same `>= 2` gate analytics, insights and chat already use).
  Phase 1 (our call): tier 2 accounts are not offered on the consent screen (disabled with a
  reason) and return `403 account_encrypted` if encryption is raised after a grant exists. Tier 1
  accounts can be connected **read-only**: the encrypted text fields come back `null` and the
  response lists them in `encrypted_fields`; writes return `403 account_encrypted`, because a
  plaintext description written by a third party would silently break the user's E2EE promise.
  The consent screen says so for a tier 1 account.
- No global rate limit is enforced today (`ThrottlerModule` is configured but has no `APP_GUARD`).
  The public layer applies its own throttling explicitly.
- Global `ValidationPipe` is `whitelist + forbidNonWhitelisted`; public DTOs are separate classes so
  the internal DTOs can change freely.
- No `@nestjs/swagger` in the API today.
- Global prefix is `api/v1` with an exclusion list in `global-prefix-exclusions.ts` (wildcards as
  `(.*)`).
- Web app `app.ai-budget.pl` is an Expo SPA with the JWT in `localStorage`; it already has the
  full login UI (password, Google, passkeys).
- Every new screen ships phone + desktop-web (≥1024) layouts; i18n in all 9 locales; new mobile
  settings screens register in `settingsRegistry.ts` + route + `Stack.Screen` + phone hub row.

## Design

### 1. URL layout

| Purpose | URL |
|---|---|
| Public REST API | `https://api.ai-budget.pl/public/v1/...` |
| Token, revoke endpoints | `https://api.ai-budget.pl/oauth/token`, `/oauth/revoke` |
| Authorize (user-facing consent page) | `https://app.ai-budget.pl/authorize?...` (`app/oauth.tsx` is already the Google sign-in relay) |
| Swagger UI + OpenAPI JSON | `https://api.ai-budget.pl/public/docs`, `/public/docs/openapi.json` |

`public/(.*)` and `oauth/(.*)` are added to `GLOBAL_PREFIX_EXCLUDED_ROUTES`. The version lives in
the path (`v1`); a breaking change means `v2` alongside `v1`, never an edit of `v1`.

CORS on `/public/*` and `/oauth/token|revoke`: any origin, no credentials (bearer tokens, not
cookies), so a browser-only app using PKCE also works.

### 2. OAuth 2.0 authorization server

Standard RFC 6749 authorization code grant with **PKCE (S256) required for every client** (RFC 7636 /
OAuth 2.1 practice). Two client kinds:

- **Confidential** (has a server): `client_id` + `client_secret` at the token endpoint, plus PKCE.
- **Public** (SPA / mobile, no secret): PKCE only.

Flow:
1. Third party redirects the user to `app.ai-budget.pl/authorize?response_type=code&client_id=…&redirect_uri=…&scope=…&state=…&code_challenge=…&code_challenge_method=S256`.
2. The SPA route validates the request against the API (`GET /api/v1/oauth/authorize/preview` —
   returns app name, logo, homepage, the human-readable scopes, the user's eligible accounts, or an
   error). Invalid `client_id` or a `redirect_uri` not exactly registered → error page **without**
   redirecting (never redirect to an unverified URI).
3. Not signed in → the existing login screens, then back to the consent route (return-to param).
4. Consent screen: app logo, name, homepage domain, "made by <developer>" (not verified), the list
   of requested permissions in plain language, an account picker (encrypted accounts disabled with
   a reason), Allow / Deny.
5. Allow → `POST /api/v1/oauth/authorize/approve` (user JWT) → server stores a one-time code and
   returns the redirect URL → SPA navigates to `redirect_uri?code=…&state=…`. Deny →
   `redirect_uri?error=access_denied&state=…`.
6. Third party calls `POST /oauth/token` (`grant_type=authorization_code`, `code`, `code_verifier`,
   `redirect_uri`, client auth) → `{access_token, token_type:"Bearer", expires_in, refresh_token,
   scope, account_id}`.
7. Refresh: `grant_type=refresh_token` → new access token **and a new refresh token** (rotation);
   reuse of an already-rotated refresh token revokes the whole grant (theft detection).
8. `POST /oauth/revoke` (RFC 7009) lets the third party disconnect itself.

If the same user already has an active grant for the same app and account with a superset of the
requested scopes, the consent screen still shows (no silent re-approval in phase 1); approving
updates the existing grant rather than creating a second one.

Token lifetimes: authorization code 10 min, single use; access token 1 hour; refresh token 90 days
sliding (each rotation resets it). Tokens are **opaque random strings** (32 bytes, base64url,
prefixed `aba_at_` / `aba_rt_` so leaked tokens are recognisable by secret scanners), stored only
as SHA-256 hashes. Opaque, not JWT, so revocation and blocking take effect on the next request.

Clickjacking: the consent route must not be framable — `Content-Security-Policy: frame-ancestors
'none'` for `/authorize` in the web nginx config.

### 3. Scopes (phase 1)

| Scope | Grants |
|---|---|
| `expenses:read` | list, get, changes feed, line items |
| `expenses:write` | create, update, delete expenses (implies nothing else) |
| `receipts:read` | download receipt image/PDF of an expense |
| `categories:read` | list expense categories (needed to create an expense) |

Always granted with any scope: reading the connected account's basic info (`GET /public/v1/account`)
and the user's basic profile (id, name, base currency — **no email** in phase 1).
Scope names follow `<domain>:<read|write>` so later phases add `incomes:read`, `budgets:write`, etc.
Unknown scope in the request → `invalid_scope` error, no consent shown.

### 4. Request authorization in the public layer

`PublicApiAuthGuard` (new, `modules/public-api/`) on every `/public/v1` controller:
1. Bearer token → hash → look up the access token → its grant → its client.
2. Reject if token expired, grant revoked, client blocked/deleted, user inactive.
3. Re-check the user's **current** membership of the grant's account (a removed member loses
   access even with a valid token) and set `req.user`, `req.accountId`, `req.accountRole`,
   `req.monthAnchorDay` exactly as `AccountContextGuard` would, plus `req.oauth = {clientId,
   grantId, scopes}`.
4. Reject a tier 2 encrypted account with `403 account_encrypted`; on a tier 1 account reject
   writes the same way and null the encrypted text fields on reads (see Constraints).
5. `@RequireScopes('expenses:write')` decorator checked by the guard.
6. Existing `ViewerBlockGuard` / `TripArchivedGuard` reused unchanged on write routes.
7. Stamp `grant.lastUsedAt` with the same throttled pattern as `LastActiveService` (not every
   request).

Tier: the user's own subscription tier applies exactly as in the app. No expense endpoint is
tier-gated today; any future public endpoint whose internal twin has `@RequireTier` gets it too.

### 5. Expenses endpoints (`/public/v1`)

| Method & path | Scope | Notes |
|---|---|---|
| `GET /account` | any | the connected account: id, name, type, base currency, caller's role |
| `GET /categories` | `categories:read` | expense categories of the account (id, name, parent, icon, color) |
| `GET /expenses` | `expenses:read` | filters: `date_from`, `date_to`, `category_id`, `merchant` (case-insensitive contains), `project_id`, `search`; cursor pagination (`limit` ≤ 200, default 50; `cursor`); order `date desc, id desc` |
| `GET /expenses/{id}` | `expenses:read` | full expense incl. line items, tags, project, category splits |
| `POST /expenses` | `expenses:write` | idempotent via required `Idempotency-Key` header (UUID) → maps to `clientId`; same key → same expense, `200` instead of `201` |
| `PATCH /expenses/{id}` | `expenses:write` | partial update of the public fields |
| `DELETE /expenses/{id}` | `expenses:write` | soft delete, appears as a deletion in the changes feed |
| `GET /expenses/changes` | `expenses:read` | `cursor` (opaque; omitted = from the beginning), `limit` ≤ 500; returns `{changes:[{type:"upsert", expense} | {type:"delete", id, deleted_at}], next_cursor, has_more}`; ordered by `(updated_at, id)` |
| `GET /expenses/{id}/receipt` | `receipts:read` | streams the original bytes with the sniffed `Content-Type`; `404` if none |

Rules:
- `{id}` is always the server id. The public API never exposes `clientId`/`localId`.
- Public response DTOs are their own classes and mapper (snake_case JSON, ISO dates, amounts as
  **decimal strings** `"12.50"` to avoid float rounding, ISO currency code). Internal-only columns
  (`encryptedPayload`, `syncVersion`, `receiptFingerprint`, group-ledger fields, `externalRef`) are
  never exposed. `has_receipt: boolean` instead of image bytes.
- Planned expenses (`isPlanned`) are excluded from list and feed — they are not spend. Split
  receivables and debts are included, with `is_debt`, `is_split_receivable` flags so an accountant
  can treat them correctly.
- Writable fields on create/update: amount, currency, date, time, category_id, description,
  merchant, notes, location (lat/lng/name), tag_ids, project_id, line items. Debt, recurring, trip
  payer and split fields are read-only in phase 1.
- A new `ExpenseSource` value **`api`** marks expenses created through the public API, and the
  expense stores which app created it (`createdByOAuthClientId`), so the app can show "added via
  AI Accounting".
- Changes feed cursor encodes `(updated_at, id)`; requires a new index
  `expenses (account_id, updated_at, id)`. Line-item edits must bump the parent expense's
  `updated_at` so they surface in the feed (verify; add if missing).
- Errors use one JSON shape: `{error: {code, message, details?}}` with stable machine codes
  (`invalid_token`, `insufficient_scope`, `account_encrypted`, `not_found`, `validation_failed`,
  `rate_limited`, `viewer_read_only`, …). Documented in Swagger.

### 6. Rate limits

Redis-backed (existing `RedisThrottlerStorage` / `CacheService.incrementWindow`):
- per grant: 120 requests/min; per client across all grants: 1,200 requests/min;
- `POST /oauth/token`: 30/min per client;
- responses carry `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After` on `429`.
Numbers are starting values, kept in one config object.

**nginx (devops step, our call):** today `shared-nginx` applies the `budget_api` per-IP zone
(30 r/s, burst 60, `docs/ops/api-rate-limit.md`) to every path of `api.ai-budget.pl`. Server-to-server
integrators sit behind few IPs, so `/public/` and `/oauth/` get their own `location` blocks with a
separate, larger per-IP zone; the per-grant/per-client limits above are the real control. The
nginx config lives on the shared VPS, so this change is applied in a planned window and recorded
in `docs/ops/api-rate-limit.md`.

### 6a. Rollout (our call)

An env flag `PUBLIC_API_ENABLED`, default **off** (the repo's pattern for risky surfaces): when off,
`/public/*`, `/oauth/*` and the authorize/approve endpoints return 404 and the "Developers" and
"Connected apps" settings entries are hidden. Turned on after the security review and a pilot with
AI Accounting on production. Once on, the portal is open to every user, as decided.

### 7. Data model (Prisma, one migration)

- `OAuthClient`: id, `clientId` (public, `aba_ci_…`), `secretHash` (null for public clients),
  `isConfidential`, `ownerUserId`, name, description, `logoUrl`, `homepageUrl`,
  `privacyPolicyUrl`, `redirectUris String[]`, `status` (`active` | `blocked`), `blockedReason`,
  createdAt, updatedAt, deletedAt.
- `OAuthGrant`: id, clientId, userId, accountId, `scopes String[]`, createdAt, updatedAt,
  `lastUsedAt`, `revokedAt`, `revokedBy` (`user` | `client` | `admin` | `reuse_detected`).
  Unique active grant per (client, user, account).
- `OAuthToken`: id, grantId, `kind` (`access` | `refresh`), `tokenHash` (unique), expiresAt,
  `rotatedAt`, createdAt. Expired rows cleaned by a daily cron (paginated, per `paginateById`).
- Authorization codes: Redis, `oauth:code:<sha256>` with 10-min TTL, consumed with GETDEL.
- `Expense.createdByOAuthClientId` (nullable FK) and the new index above.
- `ExpenseSource` gains `api` in `packages/shared-types/src/entities/primitives.ts` and wherever
  source is validated/rendered (mobile labels in 9 locales).

### 8. Developer portal (in the app, settings → "Developers")

Web phone + desktop layouts and native (it's a settings pane; native can show it too). Lets any
signed-in user:
- create an app: name, description, logo URL, homepage, privacy policy URL, redirect URIs (https
  only; `http://localhost` / `http://127.0.0.1` allowed for development), confidential or public;
- see `client_id`; see the `client_secret` **once** at creation, then only "regenerate secret"
  (old secret stops working immediately);
- edit, delete (deleting revokes all its grants);
- see number of connected users and last-used time;
- links to the Swagger reference and the getting-started guide.
Limit: 10 apps per user.

### 9. Connected apps (settings → "Connected apps")

Phone + desktop web + native. Lists the user's grants: app logo, name, homepage domain, account,
permissions, connected on, last used, "Disconnect" (revokes grant and all its tokens). An email is
sent to the user when a new app is connected ("AI Accounting was connected to your Business
account. If this wasn't you, disconnect it here."), localized via the existing mail module.

Shared accounts (our call): a grant gives the app every member's expenses, so the list is **per
account, not only per user** — every owner and editor of an account sees all apps connected to it
(with who connected each) and can disconnect any of them. When an editor connects an app, the
account's owner(s) also get the email. Viewers see nothing here. If the connecting user is later
demoted to viewer or removed from the account, the grant stops working (the guard re-checks the
role on every request: a grant requires the grantor to still be owner or editor).

### 10. Admin

New admin page "API apps": all clients with owner, created, grants count, request volume (last
24h from the rate-limit counters is enough), status; "Block" (with reason — revokes nothing but
refuses every request and every new consent while blocked) / "Unblock"; link to the owner user.

### 10a. First-party (verified) apps

`OAuthClient` gets `isVerified` (admin-only toggle) and nullable per-client rate-limit overrides
(`rateLimitPerGrant`, `rateLimitPerClient`). A verified app shows a "Verified by AI Budget" badge
on the consent screen and in Connected apps; an unverified one shows "Not verified by AI Budget".
The consent screen is still shown for verified apps (our call — the user must know what they
share). AI Accounting is registered by us, marked verified in admin, and given higher limits
(starting value 600/min per grant, 10,000/min per client). Its server traffic all comes from one
IP on the same VPS, which the separate nginx zone for `/public/` and `/oauth/` (§6) must allow for.

### 11. Documentation

- `@nestjs/swagger` added to the API; the OpenAPI document is generated **only from the public
  controllers** (`include: [PublicApiModule, OAuthModule]`) so internal routes are never published.
- Swagger UI at `/public/docs`, JSON at `/public/docs/openapi.json`, OAuth2 security scheme
  declared so "Authorize" in Swagger UI works.
- Every endpoint has a description, example request and response, and its error codes.
- A getting-started guide (in the OpenAPI `info.description` and as a page linked from the
  portal): register an app → implement the authorize redirect with PKCE → exchange the code →
  call `/public/v1/expenses` → refresh → incremental sync with `/expenses/changes` → handle
  revocation (`401 invalid_token`).
- Reference and guide in **English, Polish and Russian** (owner's decision). One OpenAPI document
  per language — `/public/docs/en`, `/public/docs/pl`, `/public/docs/ru` (JSON at
  `/public/docs/<lang>/openapi.json`), with a language switcher; `/public/docs` redirects by
  `Accept-Language`, falling back to English. The endpoint structure is generated once from the
  controllers; only the human-readable texts (summaries, descriptions, the guide, error-code
  explanations, scope descriptions) are translated, from one per-language text table keyed by
  operation and field, so the three documents can't drift structurally. A test fails when a key is
  missing in any of the three languages. Field names, codes and examples stay identical.
- Internal: wiki page `docs/wiki/features/public-api.md`; user docs section for "Connected apps"
  and "Developers" in `user_docs/` × 9 locales.

### 12. Security review

`aba-security` reviews before merge: redirect-URI exact match, PKCE enforcement, code single use,
refresh rotation + reuse detection, token hashing, no token/secret in logs or Sentry, scope checks
on every route, account isolation, viewer/trip guards, consent page non-framable, rate limits.

## Calls I made (the owner should check these)

1. Public layer is separate and versioned (`/public/v1`), calling the existing services — not the
   internal API exposed as is.
2. Consent page lives in the web app (reuses all login methods), not a server-rendered page.
3. Opaque, hashed, revocable tokens; access 1 h, refresh 90 days rotating.
4. One grant = one account, chosen by the user on the consent screen.
5. Encryption tier 2 accounts can't be connected; tier 1 accounts connect read-only with the
   encrypted text fields empty.
6. Four scopes listed above; user email is not shared.
7. User's own subscription tier applies through the API.
8. Planned expenses are hidden; debts and split receivables are shown with flags.
9. Receipt download yes, receipt upload no; debt/recurring/split fields read-only.
10. New `api` expense source + which app created it, visible in our app.
11. Email to the user on every new connection.
12. (Owner decided: docs in English, Polish and Russian.)
13. Rate limits 120/min per connection, 1,200/min per app.
14. No app review, but admin can block; 10 apps per user.
15. Ships dark behind `PUBLIC_API_ENABLED` until the security review and the AI Accounting pilot.
16. `/public/` and `/oauth/` get their own nginx location and per-IP limit on the shared VPS.
17. In a shared account every owner/editor sees and can disconnect all apps connected to it;
    owners are emailed when an editor connects one; a grant dies if its grantor loses edit rights.
18. Verified apps still show the consent screen, with a "Verified" badge.

## Left to the builder

Module/file layout inside `modules/public-api/` and `modules/oauth/`; exact cursor encoding;
Swagger UI theming; the exact wording of permission descriptions (must be plain-language and
translated into 9 locales); cleanup cron schedule; how request volume is shown in admin; test
structure (must include e2e tests of the full code → token → API → refresh → revoke flow and of
cross-account isolation).

## Later phases (for orientation, not designed here)

Incomes → categories/tags/projects write → budgets → goals → analytics/reports → debts →
webhooks (signed, retried, with a delivery log in the portal) → receipt upload / OCR (tier-gated,
costs OpenAI money) → multi-account grants.
