# Public API Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An OAuth 2.0 authorization server, a self-serve developer portal, a "Connected apps" screen, an admin page and a versioned `/public/v1` expenses API with Swagger docs in en/pl/ru — shipped dark behind `PUBLIC_API_ENABLED`.

**Architecture:** Two new API modules: `modules/oauth/` (clients, grants, tokens, authorize/token/revoke, developer + connected-apps endpoints) and `modules/public-api/` (bearer guard, scopes, rate limits, error shape, public DTOs/mappers, expense controllers that call the existing `ExpensesService`/`CategoriesService`). Tokens are opaque and stored as SHA-256 hashes; codes live in Redis and are consumed once. Mobile/web gets a consent route and two settings panes; admin gets one page.

**Tech Stack:** NestJS 10, Prisma 5, PostgreSQL, Redis (ioredis via `CacheService`), `@nestjs/swagger`, Jest (unit `*.spec.ts`, e2e `apps/api/test/*.e2e-spec.ts`), Expo Router + Zustand, Next.js 16 admin.

**Spec:** `docs/superpowers/specs/2026-11-01-public-api-design.md` — read it before any task.

## Global Constraints

- Public REST base `/public/v1`; token/revoke at `/oauth/token`, `/oauth/revoke`; Swagger at `/public/docs/{en,pl,ru}` and `/public/docs/{lang}/openapi.json`; consent page `app.ai-budget.pl/authorize`. `public/(.*)` and `oauth/(.*)` added to `GLOBAL_PREFIX_EXCLUDED_ROUTES`.
- `PUBLIC_API_ENABLED` must equal `true` (trimmed, case-insensitive) or every route of both modules returns 404 and both settings entries are hidden. Default off.
- PKCE `S256` required for every client. `redirect_uri` exact string match; registration allows `https://` only, plus `http://localhost[:port]` and `http://127.0.0.1[:port]`.
- Lifetimes: code 600 s single use; access 3600 s; refresh 90 days, reset on every rotation.
- Token formats: 32 random bytes base64url with prefix `aba_at_` (access), `aba_rt_` (refresh), `aba_cs_` (client secret), `aba_ci_` (client id, 16 bytes). Store SHA-256 hex only. Never log a token or secret.
- Scopes: `expenses:read`, `expenses:write`, `receipts:read`, `categories:read`. Unknown scope → `invalid_scope`.
- Only an account's `owner` or `editor` can grant; a grant works only while the grantor still is owner/editor of that account.
- Encryption: `encryptionTier >= 2` → `403 account_encrypted` and not selectable; `encryptionTier = 1` → read-only, encrypted text fields (`description`, `notes`, `merchant`, `location.name`, `debt_contact_name`) returned `null` and listed in `encrypted_fields`; writes → `403 account_encrypted`.
- Rate limits: 120/min per grant, 1,200/min per client, 30/min token endpoint per client; verified overrides via `OAuthClient.rateLimitPerGrant/PerClient` (AI Accounting: 600 / 10,000). Headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After` on 429.
- Error body `{ "error": { "code": string, "message": string, "details"?: object } }` on every `/public/*` response; OAuth endpoints use RFC 6749 `{error, error_description}`.
- JSON snake_case; amounts are decimal strings (`"12.50"`); dates `YYYY-MM-DD`; timestamps ISO-8601 UTC. Never expose `clientId`, `encryptedPayload`, `syncVersion`, `receiptFingerprint`, `externalRef`, group-ledger fields.
- `isPlanned` expenses are invisible to the public API (list, get, feed).
- 10 apps per developer. Docs (Swagger texts + guide) in English, Polish, Russian. App UI strings in all 9 locales.
- Every new screen: phone + desktop web (≥1024) + native. A `schema.prisma` change lands with its migration in the same commit. Never runtime-import `@budget/shared-utils` in `apps/api`. Fire-and-forget calls use `logFireAndForget`.
- Commits: step commits locally, squash into one `ABA-{N} …` commit before any push; never push without the owner's OK.

## Review Focus

1. **Grantor demoted to viewer or removed after consent** — the next API call must return `403 grant_inactive`; guard test in Task 6.
2. **Refresh token replay** (old refresh used after rotation) — the whole grant is revoked, both tokens dead; test in Task 5.
3. **Expense from another account requested by id** (id belongs to an account the grant does not cover) — `404 not_found`, never the row; e2e test in Task 15.
4. **Same `Idempotency-Key` sent twice with different bodies** — second call returns the first expense unchanged with `200`, not an update; test in Task 8.
5. **Changes feed with many rows sharing one `updated_at`** (bulk edit) — cursor `(updated_at, id)` must not skip or repeat rows across pages; test in Task 9.

---

### Task 1: Data model, migration, `api` expense source

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (new models; `Expense.createdByOAuthClientId`; index)
- Create: `apps/api/prisma/migrations/<timestamp>_public_api_oauth/migration.sql`
- Modify: `packages/shared-types/src/entities/primitives.ts:6` (`ExpenseSource` + `'api'`)
- Modify: mobile source label map(s) for `ExpenseSource` (grep `'notification'` under `apps/mobile/src` for the label switch) + 9 locales
- Test: `apps/api/src/modules/oauth/schema-guard.spec.ts`

**Interfaces — Produces:** Prisma models `OAuthClient`, `OAuthGrant`, `OAuthToken`; enums `OAuthClientStatus {active, blocked}`, `OAuthTokenKind {access, refresh}`, `OAuthRevokedBy {user, client, admin, reuse_detected, client_deleted}`.

- [ ] **Step 1: Add models to `schema.prisma`** (snake_case `@map`/`@@map` like every model)
  - `OAuthClient`: `id` uuid, `clientId` String @unique, `secretHash` String?, `isConfidential` Boolean, `ownerUserId` → User, `name` String (≤60), `description` String?, `logoUrl` String?, `homepageUrl` String, `privacyPolicyUrl` String?, `redirectUris` String[], `status` OAuthClientStatus @default(active), `blockedReason` String?, `isVerified` Boolean @default(false), `rateLimitPerGrant` Int?, `rateLimitPerClient` Int?, `createdAt`, `updatedAt`, `deletedAt` DateTime?. `@@index([ownerUserId])`.
  - `OAuthGrant`: `id`, `clientId` → OAuthClient.id, `userId` → User, `accountId` → Account, `scopes` String[], `createdAt`, `updatedAt`, `lastUsedAt` DateTime?, `revokedAt` DateTime?, `revokedBy` OAuthRevokedBy?. `@@index([accountId])`, `@@index([userId])`. Partial unique "one active grant per (client,user,account)" as raw SQL in the migration: `CREATE UNIQUE INDEX oauth_grants_active_key ON oauth_grants (client_id, user_id, account_id) WHERE revoked_at IS NULL;`
  - `OAuthToken`: `id`, `grantId` → OAuthGrant (onDelete Cascade), `kind` OAuthTokenKind, `tokenHash` String @unique, `expiresAt`, `rotatedAt` DateTime?, `createdAt`. `@@index([expiresAt])`.
  - `Expense.createdByOAuthClientId String? @map("created_by_oauth_client_id")` → OAuthClient (onDelete SetNull); `@@index([accountId, updatedAt, id])`.
- [ ] **Step 2: Generate migration** — `cd apps/api && npx prisma migrate dev --name public_api_oauth --create-only`, append the partial unique index SQL, then `npx prisma migrate dev` and `npx prisma generate`. Expected: migration applies on the dev DB.
- [ ] **Step 3: Write `schema-guard.spec.ts`** — reads the migration folder and asserts the SQL contains `oauth_grants_active_key` and `WHERE revoked_at IS NULL` (same idea as `category-system-key-index-guard.spec.ts`: a later `migrate dev` must not drop it). Also fails if any later migration contains `DROP INDEX` + `oauth_grants_active_key`. Run `npx jest schema-guard` → PASS.
- [ ] **Step 4: Add `'api'` to `ExpenseSource`**, the mobile source label (`expenses.source.api` → "API" / localized "Через API" etc.) in 9 locales; `npm run typecheck` → clean.
- [ ] **Step 5: Commit** `git commit -m "public-api: oauth data model and api expense source"`

---

### Task 2: Flag, prefix exclusions, scopes, token primitives, one-shot cache read

**Files:**
- Create: `apps/api/src/modules/oauth/oauth.config.ts`, `apps/api/src/modules/oauth/guards/public-api-enabled.guard.ts`, `apps/api/src/modules/oauth/oauth-scopes.ts`, `apps/api/src/modules/oauth/oauth-crypto.util.ts`
- Modify: `apps/api/src/global-prefix-exclusions.ts` (+ its spec), `apps/api/src/common/cache/cache.service.ts`, `.env.example`
- Test: `oauth-scopes.spec.ts`, `oauth-crypto.util.spec.ts`, `public-api-enabled.guard.spec.ts`, `cache.service.spec.ts` (extend)

**Interfaces — Produces:**
- `isPublicApiEnabled(config: ConfigService): boolean`; `PublicApiEnabledGuard` (throws `NotFoundException` when off) — pattern of `inbound-mail-enabled.guard.ts`.
- `PUBLIC_SCOPES = ['expenses:read','expenses:write','receipts:read','categories:read'] as const`; `type PublicScope`; `parseScopeParam(raw: string): PublicScope[]` (space-separated, dedup, throws `InvalidScopeError` on unknown or empty).
- `generateToken(prefix: 'aba_at_'|'aba_rt_'|'aba_cs_'): string`; `generateClientId(): string`; `sha256Hex(v: string): string`; `verifyPkceS256(verifier: string, challenge: string): boolean` (base64url SHA-256, constant-time compare; verifier must match `^[A-Za-z0-9\-._~]{43,128}$`); `safeEqualHex(a,b): boolean`.
- `CacheService.takeOnce<T>(key: string): Promise<T | null>` — Redis `GETDEL`, JSON-parse; **does not swallow errors** (same contract as `incrementWindow`).

- [ ] **Step 1: Tests** — `parseScopeParam('expenses:read  receipts:read expenses:read')` → `['expenses:read','receipts:read']`; `parseScopeParam('expenses:admin')` throws; `''` throws. `verifyPkceS256` with RFC 7636 Appendix B vector (`dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk` → `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM`) → true; wrong verifier → false; 42-char verifier → false. `generateToken('aba_at_')` matches `/^aba_at_[A-Za-z0-9_-]{43}$/`. Guard throws 404 when env unset, passes when `'TRUE '`. Exclusions spec: `public/v1/expenses/:id` and `oauth/token` match. `takeOnce` returns value then `null`; rejects when redis errors.
- [ ] **Step 2: Run** `cd apps/api && npx jest oauth-scopes oauth-crypto public-api-enabled global-prefix cache.service` → FAIL.
- [ ] **Step 3: Implement** the files above; add `'public/(.*)'` and `'oauth/(.*)'` to exclusions with a comment pointing at the spec; add `PUBLIC_API_ENABLED=false` to `.env.example`.
- [ ] **Step 4: Run** same command → PASS.
- [ ] **Step 5: Commit** `public-api: flag, scopes, token primitives`

---

### Task 3: Developer apps (client registry)

**Files:**
- Create: `apps/api/src/modules/oauth/oauth.module.ts`, `oauth-clients.service.ts`, `developer-apps.controller.ts`, `dto/developer-app.dto.ts`, `redirect-uri.util.ts`
- Modify: `apps/api/src/app.module.ts` (import `OAuthModule`)
- Test: `oauth-clients.service.spec.ts`, `redirect-uri.util.spec.ts`

**Interfaces — Produces:**
- Routes (prefix `/api/v1`, `JwtAuthGuard` + `PublicApiEnabledGuard`, **no** `AccountContextGuard` — apps belong to a user): `GET /developer/apps`, `POST /developer/apps` → `{app, clientSecret?}`, `PATCH /developer/apps/:id`, `POST /developer/apps/:id/rotate-secret` → `{clientSecret}`, `DELETE /developer/apps/:id`.
- `OAuthClientsService.findActiveByClientId(clientId: string): Promise<OAuthClient | null>` (null if deleted; caller checks `status`), `verifySecret(client: OAuthClient, secret: string): boolean`, `create(userId, dto)`, `update(userId, id, dto)`, `rotateSecret(userId, id)`, `remove(userId, id)` (sets `deletedAt`, revokes all grants with `revokedBy: client_deleted`, deletes their tokens), `listForOwner(userId)` (each with `connectedUsers` = active grants count, `lastUsedAt` = max grant `lastUsedAt`).
- `isAllowedRedirectUri(uri: string): boolean`.
- Response DTO never includes `secretHash`; `clientSecret` appears only in create/rotate responses.

- [ ] **Step 1: Tests** — redirect: `https://x.pl/cb` ok, `http://localhost:5173/cb` ok, `http://127.0.0.1/cb` ok, `http://x.pl/cb` rejected, `https://x.pl/cb#frag` rejected, `javascript:alert(1)` rejected, `budget://x` rejected. Service: 11th create for one user → `BadRequestException('app_limit_reached')`; public client (`isConfidential:false`) gets no secret; confidential create returns a secret whose sha256 equals stored hash; `update` on another user's app → 404; `rotateSecret` invalidates old (`verifySecret(old)` false); `remove` revokes grants and deletes tokens (mock prisma assertions).
- [ ] **Step 2: Run** `npx jest oauth-clients redirect-uri` → FAIL.
- [ ] **Step 3: Implement.** DTO validation: `name` 1–60, `redirectUris` 1–10 items each `isAllowedRedirectUri`, URLs `@IsUrl({require_protocol:true, protocols:['https']})` for logo/homepage/privacy. Write routes use `@Throttle` 20/min via `ThrottlerGuard`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `public-api: developer app registry`

---

### Task 4: Authorize — preview, approve, consent emails

**Files:**
- Create: `apps/api/src/modules/oauth/oauth-authorize.controller.ts`, `oauth-authorize.service.ts`, `oauth-grants.service.ts`, `dto/authorize.dto.ts`
- Modify: `apps/api/src/modules/mail/mail.service.ts` (`sendAppConnectedEmail`) + its i18n
- Test: `oauth-authorize.service.spec.ts`, `oauth-grants.service.spec.ts`

**Interfaces:**
- Consumes: Task 2 primitives, Task 3 `findActiveByClientId`, `isAllowedRedirectUri`.
- Produces:
  - `GET /api/v1/oauth/authorize/preview?client_id&redirect_uri&scope&code_challenge&code_challenge_method&response_type` (JwtAuthGuard) → `{ app:{name, logoUrl, homepageUrl, privacyPolicyUrl, isVerified, developerName}, scopes: PublicScope[], accounts: [{id, name, type, role, selectable: boolean, reason?: 'viewer'|'encrypted'|null, readOnly: boolean}] }`. Errors → `400 {error:'invalid_request'|'invalid_client'|'invalid_redirect_uri'|'invalid_scope'|'unsupported_response_type'}`; the SPA shows these WITHOUT redirecting.
  - `POST /api/v1/oauth/authorize/approve` body `{client_id, redirect_uri, scope, state?, code_challenge, code_challenge_method:'S256', account_id, decision:'allow'|'deny'}` → `{redirectTo: string}`. `deny` → `redirect_uri?error=access_denied&state=…`. `allow` → re-validates everything, checks role owner/editor and tier < 2, `OAuthGrantsService.upsertActive(...)`, stores code, returns `redirect_uri?code=…&state=…`.
  - Code: Redis key `oauth:code:<sha256(code)>`, TTL 600, value `{grantId, clientId, redirectUri, codeChallenge, scopes}`; code = `generateToken` without prefix semantics (prefix `aba_ac_` acceptable; add to the union).
  - `OAuthGrantsService.upsertActive(clientDbId, userId, accountId, scopes): Promise<{grant, isNew}>` — updates scopes on the existing active grant (replace, not union), else creates; catches P2002 on the partial index and re-fetches (CLAUDE.md upsert rule).
  - `OAuthGrantsService.revoke(grantId, by: OAuthRevokedBy)` — sets `revokedAt/revokedBy`, deletes tokens.
  - On `isNew`, fire-and-forget `MailService.sendAppConnectedEmail({to, lang, appName, accountName, connectedByName, manageUrl})` to the grantor; if grantor is `editor`, also to each `owner` of the account. `manageUrl = https://app.ai-budget.pl/settings/connected-apps`.
- Blocked client: preview → `invalid_client`.

- [ ] **Step 1: Tests** — preview with unregistered redirect → `invalid_redirect_uri`; `code_challenge_method=plain` → `invalid_request`; missing challenge → `invalid_request`; viewer account listed `selectable:false, reason:'viewer'`; tier 2 `reason:'encrypted'`; tier 1 `selectable:true, readOnly:true`. Approve as viewer → 403; approve with `account_id` user isn't a member of → 403; allow returns URL whose `code` param, hashed, is a Redis key with TTL 600 and correct payload; `state` echoed URL-encoded; deny returns `error=access_denied`. Second approve for same (client,user,account) reuses grant and replaces scopes. Editor grant emails grantor + owners; owner grant emails only owner; re-approval sends no email.
- [ ] **Step 2: Run** `npx jest oauth-authorize oauth-grants` → FAIL.
- [ ] **Step 3: Implement.** Approve is `@Throttle` 20/min.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `public-api: authorize preview, approve and connection emails`

---

### Task 5: Token and revoke endpoints

**Files:**
- Create: `apps/api/src/modules/oauth/oauth-token.controller.ts`, `oauth-token.service.ts`
- Test: `oauth-token.service.spec.ts`

**Interfaces:**
- Produces:
  - `POST /oauth/token` (no prefix; `application/x-www-form-urlencoded` and JSON both accepted; client auth by HTTP Basic or `client_id`/`client_secret` body). `grant_type=authorization_code` (`code`, `redirect_uri`, `code_verifier`, `client_id`) and `grant_type=refresh_token` (`refresh_token`, `client_id`, optional `scope` ⊆ grant scopes). Response `{access_token, token_type:'Bearer', expires_in:3600, refresh_token, scope, account_id}`; `Cache-Control: no-store`.
  - Errors per RFC 6749 §5.2: `invalid_request`, `invalid_client` (401), `invalid_grant`, `unsupported_grant_type`, `invalid_scope`.
  - `POST /oauth/revoke` (`token`, optional `token_type_hint`; client auth) → always `200 {}`; revokes the token's whole grant with `revokedBy: client` if the token belongs to this client.
  - `OAuthTokenService.issuePair(grantId): Promise<{accessToken, refreshToken}>`.
  - Rate limit: `incrementWindow('oauth:tok:<clientId>', 60000) > 30` → 429 `{error:'slow_down'}`.
- Rules: confidential client must authenticate with secret; public client must not send one. Code consumed with `takeOnce` (so a replayed code is `invalid_grant`); `redirect_uri` must equal stored; PKCE verified; client must be `active`; grant must be active. Refresh: look up by hash, `kind=refresh`; if `rotatedAt != null` → revoke grant `reuse_detected`, `invalid_grant`; else set `rotatedAt`, issue new pair (refresh `expiresAt = now+90d`). Redis down during code exchange → 503, not success.
- CORS: both routes respond with `Access-Control-Allow-Origin: *` and no credentials (route-level handling or a small middleware for `oauth/*` and `public/*`; the global CORS list stays as is).

- [ ] **Step 1: Tests** — full happy path code→pair; replayed code → `invalid_grant`; wrong verifier → `invalid_grant`; different redirect → `invalid_grant`; confidential without secret → 401 `invalid_client`; blocked client → `invalid_client`; refresh rotates (old refresh's `rotatedAt` set, new tokens differ); **reusing rotated refresh revokes grant and kills new access token too**; refresh with scope not in grant → `invalid_scope`; revoke with another client's token → 200 but nothing revoked; 31st token call in a minute → 429.
- [ ] **Step 2: Run** `npx jest oauth-token` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `public-api: token exchange, refresh rotation, revoke`

---

### Task 6: Public API guard, scopes, rate limits, error shape

**Files:**
- Create: `apps/api/src/modules/public-api/public-api.module.ts`, `guards/public-api-auth.guard.ts`, `decorators/require-scopes.decorator.ts`, `public-api-rate-limit.service.ts`, `filters/public-api-exception.filter.ts`, `public-api-error.ts`
- Test: `public-api-auth.guard.spec.ts`, `public-api-rate-limit.service.spec.ts`, `public-api-exception.filter.spec.ts`

**Interfaces:**
- Produces:
  - `@RequireScopes(...scopes: PublicScope[])`.
  - `PublicApiAuthGuard` sets `req.user` (same shape `JwtStrategy` sets), `req.accountId`, `req.accountRole`, `req.monthAnchorDay`, `req.oauth = {clientDbId, clientName, grantId, scopes, encryptionTier}`. Order: flag → bearer present (`401 invalid_token`) → token by hash, `kind=access`, not expired (`401 invalid_token`) → grant active, client active & not deleted (`401 invalid_token`) → user active → grantor membership role ∈ {owner, editor} (`403 grant_inactive`) → `encryptionTier >= 2` → `403 account_encrypted` → scopes (`403 insufficient_scope`, `details.required`) → rate limit → throttled `lastUsedAt` stamp via `CacheService.setIfAbsent('oauth:lu:<grantId>', 300)`.
  - `PublicApiError(status, code, message, details?)`; filter maps it, Nest `HttpException`s (incl. `ValidationPipe` → `validation_failed` with `details.fields`), `ViewerBlockGuard`'s 403 → `viewer_read_only`, `TripArchivedGuard` → `trip_archived`, 404 → `not_found`, else `internal_error` (and Sentry as usual) — into `{error:{code,message,details?}}`.
  - `PublicApiRateLimitService.check(grantId, clientDbId, overrides): Promise<{limit, remaining, retryAfterSec?}>` using `incrementWindow` on `pa:g:<grantId>` and `pa:c:<clientDbId>` (60 s window); Redis error → fail closed (`503 unavailable`).
  - `encryptionTier = 1` write rejection is a separate decorator/guard `@PublicWrite()` used by Task 8 (`403 account_encrypted`), composed with `new ViewerBlockGuard()` and `TripArchivedGuard`.

- [ ] **Step 1: Tests** — every rejection branch above with its code; **grantor demoted to viewer after consent → `403 grant_inactive`**; grantor removed from account → `grant_inactive`; scope missing → `insufficient_scope` with `details.required:['expenses:write']`; 121st request in a minute → 429 with `Retry-After`; verified override 600 honored; headers set on success; filter turns a class-validator error into `validation_failed`.
- [ ] **Step 2: Run** `npx jest public-api-auth public-api-rate public-api-exception` → FAIL.
- [ ] **Step 3: Implement.** Filter is applied with `@UseFilters` on public controllers only, never globally.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `public-api: bearer guard, scopes, rate limits, error shape`

---

### Task 7: Read endpoints — account, categories, expense list and detail

**Files:**
- Create: `apps/api/src/modules/public-api/dto/public-expense.dto.ts` (response + query classes), `mappers/public-expense.mapper.ts`, `public-expenses.query.ts`, `controllers/public-account.controller.ts`, `controllers/public-categories.controller.ts`, `controllers/public-expenses.controller.ts`, `cursor.util.ts`
- Test: `public-expense.mapper.spec.ts`, `public-expenses.query.spec.ts`, `cursor.util.spec.ts`

**Interfaces:**
- Produces:
  - `GET /public/v1/account` → `{id, name, type, base_currency, role, encryption: 'none'|'text'|'full', read_only: boolean, user: {id, name, base_currency}}` (no email).
  - `GET /public/v1/categories` (`categories:read`) → `{data:[{id, name, parent_id, icon, color, type}]}` from `CategoriesService.findAll(accountId)` filtered to expense categories.
  - `GET /public/v1/expenses` (`expenses:read`) query `date_from, date_to, category_id, merchant, project_id, search, limit(1–200, default 50), cursor` → `{data: PublicExpense[], next_cursor: string|null, has_more}`. Order `date desc, id desc`; keyset cursor over `(date, id)`; excludes `isDeleted`, `isPlanned`.
  - `GET /public/v1/expenses/:id` → `PublicExpense` with `items`; id matched on server `id` only; `isPlanned`/`isDeleted` → 404.
  - `PublicExpense`: `id, amount, currency, date, time, category_id, description, merchant, notes, location{lat,lng,name}|null, tags[{id,name}], project{id,name}|null, category_splits[{category_id, amount}], items[{id, description, quantity, unit_price, total_price, line_discount, category_id}]` (detail + changes feed only), `discount_amount, deposit_amount, is_debt, is_debt_repayment, is_split_receivable, is_recurring, source, created_by_app{id,name}|null, created_by_user{id,name}, has_receipt, encrypted_fields: string[], created_at, updated_at`.
  - `toPublicExpense(row, {encryptionTier, includeItems}): PublicExpense`.
  - `encodeCursor(parts: (string)[]): string` / `decodeCursor(c: string, arity: number): string[]` (base64url JSON; invalid → `PublicApiError(400,'invalid_cursor')`).
- Implementation: a dedicated Prisma query in `public-expenses.query.ts` (`listPublicExpenses(prisma, accountId, q)`, `getPublicExpense(prisma, accountId, id)`) — `ExpensesService.findAll` is offset-paginated and has no merchant/project filter, so reading goes direct to Prisma with an explicit `select` (no `receiptImage` bytes; `has_receipt` via `receiptMimeType != null`). Writes (Task 8) still go through `ExpensesService`.

- [ ] **Step 1: Tests** — mapper: `Decimal('12.5')` → `"12.50"`; tier 1 row → `description:null, merchant:null, notes:null, location.name:null`, `encrypted_fields` lists them while `amount` stays; tier 0 → `encrypted_fields:[]`; never emits keys `client_id`, `encrypted_payload`, `sync_version`. Query: `isPlanned` excluded; merchant filter is case-insensitive contains; keyset page 2 starts right after last `(date,id)` of page 1 with equal dates. Cursor: round-trip; garbage → `invalid_cursor`.
- [ ] **Step 2: Run** `npx jest public-expense public-expenses.query cursor.util` → FAIL.
- [ ] **Step 3: Implement** controllers: `@UseGuards(PublicApiEnabledGuard, PublicApiAuthGuard)`, `@UseFilters(PublicApiExceptionFilter)`, `@Controller('public/v1/...')`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `public-api: account, categories, expense list and detail`

---

### Task 8: Write endpoints — create, update, delete

**Files:**
- Modify: `apps/api/src/modules/public-api/controllers/public-expenses.controller.ts`, `dto/public-expense.dto.ts` (`PublicExpenseCreateDto`, `PublicExpenseUpdateDto`)
- Create: `apps/api/src/modules/public-api/public-expense-write.adapter.ts`
- Modify: `apps/api/src/modules/expenses/expenses.service.ts` (accept and persist `createdByOAuthClientId` on create; nothing else)
- Test: `public-expense-write.adapter.spec.ts`, extend `expenses.service.spec.ts`

**Interfaces:**
- Consumes: `ExpensesService.create(accountId, userId, dto) → {expense, isNew}`, `update(accountId, id, dto)`, `remove(accountId, id)`; Task 6 `@PublicWrite()`; Task 7 mapper.
- Produces:
  - `POST /public/v1/expenses` (`expenses:write`, header `Idempotency-Key` UUID required → `400 validation_failed` if missing/invalid) → `201 PublicExpense` if new, `200` with the existing expense if `isNew=false` (body ignored — Review Focus 4).
  - `PATCH /public/v1/expenses/:id`, `DELETE /public/v1/expenses/:id` (`204`). Both resolve the server id first (`getPublicExpense`, 404 otherwise) and pass the server id to the service.
  - Writable fields (create; all optional on update except none): `amount` (decimal string, > 0, ≤ 2 dp), `currency` (ISO 4217, default account base), `date` (required on create), `time`, `category_id`, `description`, `merchant`, `notes`, `location{lat,lng,name?}`, `tag_ids`, `project_id`, `items[]{description, quantity, unit_price, total_price}` (create only).
  - `toInternalCreateDto(body, {idempotencyKey, clientDbId}): CreateExpenseDto` — `localId = idempotencyKey`, `source='api'`, `createdByOAuthClientId`. Category/tag/project ids validated to belong to the account (`422 validation_failed` with field) before calling the service.
  - Project link via `expenseStore`'s server twin: use the same service method the app uses for `setExpenseProject` (grep `projectExpense` in `apps/api/src/modules/expenses` / `projects`), never a column write.
- Guards on these routes: `@PublicWrite()` (tier 1 → `account_encrypted`), `new ViewerBlockGuard()`, `TripArchivedGuard`.

- [ ] **Step 1: Tests** — adapter maps `amount:"12.50"` to the internal numeric form the DTO expects, sets `source:'api'`, `localId` = key; foreign `category_id` → `validation_failed` `details.fields.category_id`; same key twice with a different amount returns the first expense and `isNew:false` (no update); tier 1 account create → `account_encrypted`; `expenses.service.spec`: create stores `createdByOAuthClientId`.
- [ ] **Step 2: Run** `npx jest public-expense-write expenses.service` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; also run full `npx jest src/modules/expenses` → PASS (no regressions).
- [ ] **Step 5: Commit** `public-api: create, update and delete expenses`

---

### Task 9: Changes feed and receipt download

**Files:**
- Modify: `public-expenses.controller.ts`, `public-expenses.query.ts`
- Modify (if needed): `apps/api/src/modules/expenses/expenses.service.ts` `createItem/updateItem/removeItem` (`:835-890`) to touch the parent expense `updatedAt`
- Test: extend `public-expenses.query.spec.ts`, `expenses.service.spec.ts`

**Interfaces — Produces:**
- `GET /public/v1/expenses/changes?cursor&limit(1–500, default 200)` (`expenses:read`) → `{changes: ({type:'upsert', expense: PublicExpense /*with items*/} | {type:'delete', id, deleted_at})[], next_cursor: string, has_more}`. Query: `accountId`, `isPlanned=false` (a row that became planned emits `delete`), `(updatedAt, id) > cursor` ordered asc. `next_cursor` is always returned (also on an empty page, equal to the input) so the client can store it.
- `GET /public/v1/expenses/:id/receipt` (`receipts:read`) → streams bytes (`StreamableFile`), `Content-Type` from `receiptMimeType` or sniffed (reuse `sniffReceiptContentType` from receipt-split), `Content-Disposition: inline; filename="receipt-<id>.<ext>"`; 404 `not_found` if no image; tier ≥1 account → `account_encrypted` (`receiptImageBase64` is a tier-1 field).
- Must be declared **before** `GET :id` in the controller (route order).

- [ ] **Step 1: Tests** — 250 rows with identical `updatedAt`: pages of 100 return all 250 exactly once (Review Focus 5); a soft-deleted row appears as `delete`; a planned row appears as `delete`; empty page returns the same cursor; editing a line item bumps parent `updatedAt` so it reappears in the feed.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `public-api: changes feed and receipt download`

---

### Task 10: Connected apps endpoints and token cleanup cron

**Files:**
- Create: `apps/api/src/modules/oauth/connected-apps.controller.ts`, `oauth-token-cleanup.cron.ts`
- Modify: `oauth-grants.service.ts`
- Test: `connected-apps.spec.ts`, `oauth-token-cleanup.cron.spec.ts`

**Interfaces — Produces:**
- `GET /api/v1/connected-apps` (JwtAuthGuard + flag) → active grants on every account where the caller is owner/editor: `[{grantId, app:{name, logoUrl, homepageUrl, isVerified}, account:{id,name}, scopes, connectedBy:{id,name}, connectedAt, lastUsedAt}]`. Viewers get `[]` for that account.
- `DELETE /api/v1/connected-apps/:grantId` → caller must be owner/editor of the grant's account, else 404; `revoke(grantId, 'user')`.
- Daily 03:30 cron: delete `OAuthToken` with `expiresAt < now - 1 day` and access/refresh rows of revoked grants, via `paginateById`.

- [ ] **Step 1: Tests** — editor B sees app connected by editor A on the shared account and can revoke it; viewer sees nothing and DELETE → 404; user of another account → 404; cron deletes only expired rows.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `public-api: connected apps endpoints and token cleanup`

---

### Task 11: Admin — API apps

**Files:**
- Create: `apps/api/src/modules/admin/admin-oauth-clients.controller.ts` (or methods on the existing admin controller following its pattern), `apps/admin/src/app/api-apps/page.tsx`, `apps/admin/src/hooks/use-api-apps.ts`, `apps/admin/src/components/api-apps/*`
- Modify: `apps/admin/src/components/layout/app-sidebar.tsx:32-44` (nav item), `packages/shared-types` (admin DTO type)
- Test: `admin-oauth-clients.spec.ts`

**Interfaces — Produces:** `GET /admin/oauth-clients` (owner email, created, active grants, requests last minute from `peekWindow('pa:c:<id>')`, status, isVerified, limits); `PATCH /admin/oauth-clients/:id` body `{status?, blockedReason?, isVerified?, rateLimitPerGrant?, rateLimitPerClient?}`. Guards `JwtAuthGuard` + `AdminGuard`. Blocking does not revoke grants (spec §10); the guard refuses while blocked.

- [ ] **Step 1: Test** non-admin → 403; block sets status and reason; unblock clears reason.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** API + admin page (table, block/unblock dialog with reason, verified toggle, limit inputs, link to `/users/<ownerId>`). **Step 4: Run** → PASS; `cd apps/admin && npm run typecheck` → clean.
- [ ] **Step 5: Commit** `public-api: admin page for API apps`

---

### Task 12: Swagger in English, Polish, Russian

**Files:**
- Modify: `apps/api/package.json` (`@nestjs/swagger` compatible with Nest 10, i.e. `^7`), `apps/api/src/main.ts`
- Create: `apps/api/src/modules/public-api/docs/openapi.ts` (`buildPublicOpenApi(app, lang)`), `docs/texts.en.ts`, `docs/texts.pl.ts`, `docs/texts.ru.ts`, `docs/guide.{en,pl,ru}.md`, `docs/public-docs.controller.ts`
- Test: `docs/texts.spec.ts`, `docs/openapi.spec.ts`

**Interfaces — Produces:**
- `SwaggerModule.createDocument(app, config, { include: [PublicApiModule, OAuthTokenOnlyModule?] })` — include only the public controllers and `/oauth/token|revoke`; developer/connected-apps/authorize-preview routes are internal and must NOT appear. If `include` cannot separate `OAuthModule`'s internal controllers, split the token controller into its own `OAuthPublicModule`.
- Structure from decorators (`@ApiTags`, `@ApiOperation({operationId})`, `@ApiResponse`, `@ApiProperty` with `example`); texts applied afterwards by `operationId` / schema field path from `texts.<lang>.ts` (`Record<string, string>`); `info.description` = the guide markdown. `components.securitySchemes.oauth2` authorizationCode with `authorizationUrl: https://app.ai-budget.pl/authorize`, `tokenUrl: https://api.ai-budget.pl/oauth/token`, scopes with localized descriptions.
- Routes (flag-guarded): `GET /public/docs` → 302 to `/public/docs/<lang>` by `Accept-Language` (pl, ru, else en); `/public/docs/<lang>` Swagger UI (`SwaggerModule.setup` per language) with a language switcher link in `customSiteTitle`/top HTML; `/public/docs/<lang>/openapi.json`.
- The guide (per language): register an app → authorize URL with PKCE (code sample in JS + curl) → exchange code → call `/public/v1/expenses` → refresh (rotation; store the new refresh token) → incremental sync with `/expenses/changes` → errors & `401 invalid_token` handling → rate limits → encryption limits.

- [ ] **Step 1: Tests** — `texts.spec`: the key sets of `en`, `pl`, `ru` are identical and every `operationId` + documented field in the generated document has a key (fails listing missing keys). `openapi.spec`: generated doc paths ⊆ `/public/v1/*` ∪ `/oauth/token` ∪ `/oauth/revoke`; contains no `/api/v1/` and no `developer` path; every operation lists `400/401/403/404/429` error responses with the shared error schema.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**, writing all three languages (Polish and Russian written natively, not left in English). **Step 4: Run** → PASS; start API locally with `PUBLIC_API_ENABLED=true`, open `http://localhost:3000/public/docs/pl` → Swagger UI renders in Polish, "Authorize" button present.
- [ ] **Step 5: Commit** `public-api: swagger reference and guide in en, pl, ru`

---

### Task 13: Consent screen (web + native)

**Files:**
- Create: `apps/mobile/app/authorize.tsx` (thin route with header), `apps/mobile/src/features/oauth-consent/useConsent.ts`, `src/components/oauth-consent/ConsentView.tsx` (phone), `ConsentView.web.tsx` (decides on `isDesktopWeb`; desktop = centred 480px card), `src/services/oauth.api.ts`
- Modify: `apps/mobile/app/_layout.tsx` (`Stack.Screen name="authorize"`), auth redirect so an unauthenticated visit to `/authorize?…` returns there after login (find the return-to mechanism in `(auth)/login.tsx`; add one if absent, preserving the full query string), 9 locale files (`oauthConsent.*`), `docker/nginx/` web config: `add_header Content-Security-Policy "frame-ancestors 'none'"` for `location = /authorize` (grep the web nginx conf used by `build-web.sh`/web container; if it lives only on the VPS, record the change in Task 16 instead)
- Test: `apps/mobile/src/features/oauth-consent/__tests__/useConsent.test.ts`

**Interfaces:**
- Consumes: Task 4 preview/approve.
- Produces: `oauthApi.preview(params)`, `oauthApi.approve(body)`; `useConsent(searchParams)` → `{status:'loading'|'error'|'ready'|'submitting', error?, app, scopes, accounts, selectedAccountId, select(id), allow(), deny()}`; `allow/deny` do `window.location.assign(redirectTo)` on web and `Linking.openURL` on native.
- UI: app logo + name, "Verified by AI Budget" / "Not verified by AI Budget", developer name, homepage domain, permission list (localized per scope), account picker (disabled rows with reason text; tier-1 row notes read-only), Allow / Deny. Error state shows the reason and **no** redirect.

- [ ] **Step 1: Test** `useConsent`: preview error → `status:'error'`, `allow` impossible; first selectable account preselected; non-selectable can't be selected; `allow` posts `decision:'allow'` with selected account and navigates to returned URL; `deny` posts `decision:'deny'`.
- [ ] **Step 2: Run** `cd apps/mobile && npx jest useConsent` → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `npm run typecheck` → clean; manual: `npm run dev:web`, open `/authorize?...` with a dev app, check phone width and ≥1024.
- [ ] **Step 5: Commit** `public-api: consent screen`

---

### Task 14: Settings — Developers and Connected apps

**Files:**
- Create: `apps/mobile/app/settings/developers.tsx`, `apps/mobile/app/settings/connected-apps.tsx`, `src/components/settings/developers/DevelopersSettings.tsx` (+ `AppFormSheet`, `SecretRevealCard`), `src/components/settings/connected-apps/ConnectedAppsSettings.tsx`, `src/services/developerApps.api.ts`, `src/stores/developerAppsStore.ts`, `src/stores/connectedAppsStore.ts` (each with `reset()` registered where other account/user stores reset)
- Modify: `src/features/settings/settingsRegistry.ts` (two pane keys, `requiresFeature: 'publicApi'` or equivalent gate driven by a server flag — add `publicApiEnabled` to the `/users/me` payload or a config endpoint, whichever pattern `requiresFeature` already uses), `app/_layout.tsx` (`Stack.Screen`s), `SettingsHubMobile.tsx`, `settingsRegistry.test.ts`, 9 locales; expense detail shows "Added via <app>" when `createdByApp` present (shared-types `Expense.createdByApp?: {id,name}`; include it in the internal `findOne`/`findAll` select + mapper — additive)
- Test: `settingsRegistry.test.ts`, `__tests__/developerAppsStore.test.ts`

**Interfaces — Consumes:** Task 3 and Task 10 routes. **Produces:** UI only.

- [ ] **Step 1: Tests** — registry: both entries hidden when flag false, visible when true; store: create keeps the returned secret only in a transient field cleared on `acknowledgeSecret()` and on `reset()`; never persisted.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** both panes (form layouts on desktop; links to `/public/docs/<ui-lang mapped to en|pl|ru>`; copy-to-clipboard for client id/secret; delete & rotate confirmations without `alert()` on web). Bottom sheets add `insets.bottom`. **Step 4: Run** → PASS; typecheck clean; manual check phone + desktop web.
- [ ] **Step 5: Commit** `public-api: developers and connected apps settings`

---

### Task 15: End-to-end tests

**Files:**
- Create: `apps/api/test/public-api.e2e-spec.ts` (follow `test/import-bank.e2e-spec.ts` setup)

- [ ] **Step 1: Write** scenarios: (a) register confidential app → preview → approve → token → list → create (idempotent twice) → patch → changes shows upsert → delete → changes shows delete → refresh → revoke → `401 invalid_token`; (b) **isolation**: grant on account A; `GET /public/v1/expenses/<id of expense in account B of the same user>` → 404; feed never contains B rows (Review Focus 3); (c) viewer cannot approve; (d) admin block → next call `401 invalid_token`, unblock → works again; (e) flag off → 404 on `/public/v1/account`, `/oauth/token`, `/public/docs`.
- [ ] **Step 2: Run** `cd apps/api && npm run test:e2e -- public-api` → PASS (fix code, not tests, on failure).
- [ ] **Step 3: Run** `npm run lint && npm run typecheck && npm run test` at repo root → all green.
- [ ] **Step 4: Commit** `public-api: end-to-end tests`

---

### Task 16: Ops

**Files:**
- Create: `docker/nginx/api-public.conf` (snippet for `shared-nginx`), `docs/ops/public-api.md`
- Modify: `docs/ops/api-rate-limit.md`, `.env.example`, `CLAUDE.md` (Environment Variables: `PUBLIC_API_ENABLED` one line, pointing to the wiki page)

- [ ] **Step 1: Write the nginx snippet**: `limit_req_zone $binary_remote_addr zone=budget_public:10m rate=50r/s;` and `location /public/` + `location /oauth/` with `limit_req zone=budget_public burst=200 nodelay;`, same proxy headers as the existing `location /`; plus the `frame-ancestors 'none'` header for `app.ai-budget.pl` `location = /authorize` if not done in Task 13.
- [ ] **Step 2: Write `docs/ops/public-api.md`**: enabling sequence — apply nginx snippet in a window (`nginx -t` then reload), set `PUBLIC_API_ENABLED=true` in `.env.production`, `up -d --force-recreate api`, register AI Accounting app, mark verified + limits 600/10,000 in admin, pilot, then announce. Rollback: flag false + recreate.
- [ ] **Step 3: Verify** `nginx -t` against the snippet in a local `nginx:alpine` container: `docker run --rm -v $PWD/docker/nginx/api-public.conf:/etc/nginx/conf.d/default.conf:ro nginx:alpine nginx -t` (wrap in a minimal `server{}` if the snippet is location-only) → `syntax is ok`.
- [ ] **Step 4: Commit** `public-api: nginx snippet and ops runbook`

---

### Task 17: Documentation and task close-out

- [ ] **Step 1:** Wiki page `docs/wiki/features/public-api.md` (spec's shape: purpose, flows, invariants — opaque hashed tokens, grantor role recheck, tier rules, planned-expense exclusion, `isPlanned` → delete in feed, docs-only-public-controllers, one-shot codes fail closed) + link from `docs/wiki/index.md` and the expenses hub; `python scripts/wiki-lint.py` → clean.
- [ ] **Step 2:** User docs via the `add-help-section` skill: new section "Connected apps & developers" in `user_docs/<lang>/` × 9; `npm run generate:help`.
- [ ] **Step 3:** Run the `aba-security` agent on the branch diff; fix every finding rated medium or higher; re-run tests.
- [ ] **Step 4:** `finish-aba-task` skill — create the ABA-{N} issue, log line, squash all step commits into one `ABA-{N} Public API phase 1: OAuth platform and expenses` commit. Do not push; ask the owner.
