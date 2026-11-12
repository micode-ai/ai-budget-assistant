# MCP Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A remote, read-only MCP server at `https://api.ai-budget.pl/mcp` that any MCP client can add: it discovers our OAuth server, registers itself, sends the user to the existing consent page, and then calls read tools backed by the same authorization and queries as `/public/v1`.

**Architecture:** The OAuth platform gains audience binding (RFC 8707 `resource` on codes and tokens), authorization-server and protected-resource metadata (RFC 8414 / RFC 9728) and dynamic client registration (RFC 7591) for owner-less public clients tagged `mcp_dcr`. The public API guard's per-request authorization is extracted into one `PublicApiAuthorizer` service that both the guard and a new `mcp` module call. The `mcp` module mounts the official SDK's Streamable HTTP transport in stateless mode and exposes read tools that call the existing public query functions and mappers. Everything MCP-specific is dark behind `MCP_ENABLED` and only works while `PUBLIC_API_ENABLED` is on.

**Tech Stack:** NestJS 10, Prisma 5 / PostgreSQL, Redis (`CacheService`), `@modelcontextprotocol/sdk` (1.27.x, already in the lockfile transitively — add it as a direct dependency of `apps/api`), zod 3 (already an `apps/api` dependency), Expo/React Native web (consent page), Next.js admin, Jest.

**Spec:** `docs/superpowers/specs/2026-11-12-mcp-connector-design.md` (including "Decisions after the builder check" — binding).

## Global Constraints

- Read-only: no write scope, no write tool, no receipt tool. DCR clients may hold only `expenses:read`, `categories:read`, `incomes:read`, `budgets:read`, `analytics:read`; `receipts:read` and every `*:write` are refused for `source = mcp_dcr` at authorize, token and refresh (`invalid_scope`).
- An authorize request from a DCR client with no `scope` gets exactly those five read scopes (`MCP_DEFAULT_SCOPES`).
- MCP resource identifier: `MCP_RESOURCE_URL` (env, default `https://api.ai-budget.pl/mcp`). A token issued with `resource = MCP_RESOURCE_URL` is accepted only by `/mcp`; a token issued with no resource is accepted only by `/public/v1`; any other `resource` value at authorize or token is `invalid_target`. Refresh keeps the original token's resource.
- Issuer: `OAUTH_ISSUER` (env, default `https://api.ai-budget.pl`); authorization endpoint `OAUTH_AUTHORIZE_URL` (env, default `https://app.ai-budget.pl/authorize`); token `${issuer}/oauth/token`; revocation `${issuer}/oauth/revoke`; registration `${issuer}/oauth/register`; `code_challenge_methods_supported: ['S256']`; `token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post']` (keep whatever the token endpoint accepts today plus `none`).
- DCR: public client (no secret, `isConfidential = false`, `ownerUserId = null`, `source = 'mcp_dcr'`, `isVerified = false`); redirect URIs `https://` or loopback `http://localhost`, `http://127.0.0.1`, `http://[::1]` on any port, no custom schemes, at most 5, exact-match at authorize as today; `client_name` required, max 80 chars, rejected (`invalid_client_metadata`) when, compared case- and diacritic-insensitively, it contains `ai budzet`, `ai budget` or `budzet`; 10 registrations per hour per client IP via `CacheService.incrementWindow`, failing closed (429).
- Unused DCR clients (no grant, `createdAt` older than 30 days) are soft-deleted (`deletedAt`) by the existing `OAuthTokenCleanupCron`.
- Flags: every MCP route, both `.well-known` documents and `/oauth/register` answer 404 unless `PUBLIC_API_ENABLED` AND `MCP_ENABLED` are both `true` (same parsing as `isPublicApiEnabled`). With `MCP_ENABLED` off nothing about the existing public API changes.
- CORS: `/mcp`, `/oauth/register`, `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp` get the public CORS policy (`*`, no credentials), with allowed headers adding `mcp-protocol-version`, `mcp-session-id` and exposed headers adding `WWW-Authenticate`, `mcp-session-id`.
- All five paths are added to `GLOBAL_PREFIX_EXCLUDED_ROUTES` (named one by one, never `oauth/(.*)`), pinned by `global-prefix-exclusions.spec.ts`.
- `/mcp` without a valid token answers 401 with `WWW-Authenticate: Bearer resource_metadata="${issuer}/.well-known/oauth-protected-resource/mcp"` (plus `error="invalid_token"` when a token was sent).
- Tool results never exceed 200 rows per call; list tools take `limit` (1–200, default 50) and `cursor` and return `next_cursor`.
- Same data rules as `/public/v1`: per-account checks (granted, grantor still owner/editor there, `encryptionTier >= 2` refused with `account_encrypted`), field masking through the existing mappers with the account's `encryptionTier`, the same rate-limit buckets.
- Never log a token, code, verifier, secret, token hash or any financial row content; MCP logs carry tool name, outcome and duration only.
- Repo rules: schema change + migration in the same commit (DB-free `prisma migrate diff` when no local DB; no DROP, never `categories_account_system_key_type_live_key`); no runtime import from `@budget/shared-*` in `apps/api`; fire-and-forget via `logFireAndForget`; every consent-page string in all 9 locales; the consent page change ships phone and desktop web together.

## Review Focus

1. **A public-API token replayed at `/mcp`, or an MCP token at `/public/v1`** — both 401 `invalid_token`; pinned in Task 2 (`resource` mismatch tests) and Task 5 (MCP endpoint test with a resource-less token).
2. **A DCR client asking for `expenses:write` or `receipts:read`** (at register, authorize or via refresh of an old grant) — refused; pinned in Task 3.
3. **A multi-account connection calling a list tool without `account_id`** — a tool error telling the model to call `list_accounts` first and pass `account_id`, never data from an arbitrary account; pinned in Task 5.
4. **An MCP client registering a lookalike name ("AI Budżet Official") or a `javascript:`/custom-scheme redirect** — `invalid_client_metadata` / `invalid_redirect_uri`; pinned in Task 4.
5. **`MCP_ENABLED` off while `PUBLIC_API_ENABLED` is on** — `/mcp`, metadata and `/oauth/register` 404, existing public API unaffected; pinned in Task 4 and Task 5.

---

## File Structure

API — OAuth (`apps/api/src/modules/oauth/`):
- `mcp.config.ts` — `isMcpEnabled(config)`, `mcpResourceUrl(config)`, `oauthIssuer(config)`, `oauthAuthorizeUrl(config)`, `MCP_DEFAULT_SCOPES`, `DCR_ALLOWED_SCOPES`.
- `oauth-resource.util.ts` — `parseResourceParam(raw, config): string | null` (throws `InvalidTargetError`).
- `oauth-scope-policy.ts` — `assertScopesAllowedForClient(client, scopes)`, `defaultScopesForClient(client)`.
- `oauth-metadata.controller.ts` — both `.well-known` documents.
- `oauth-register.controller.ts` + `oauth-register.service.ts` + `dto/register.dto.ts` — DCR.
- Modify: `oauth-code.ts` (payload `resource`), `oauth-authorize.service.ts`, `dto/authorize.dto.ts`, `oauth-token.service.ts`, `redirect-uri.util.ts`, `oauth-clients.service.ts`, `oauth-token-cleanup.cron.ts`, `oauth-public.module.ts`.

API — public API (`apps/api/src/modules/public-api/`):
- `public-api-authorizer.service.ts` — the extracted core.
- Modify: `guards/public-api-auth.guard.ts` (delegates), `public-api.module.ts` (exports the authorizer and the query providers MCP needs).

API — MCP (`apps/api/src/modules/mcp/`):
- `mcp.module.ts`, `mcp.controller.ts` (POST/GET/DELETE `/mcp`), `mcp-server.factory.ts` (builds an `McpServer` with the tools for one request), `mcp-tools.ts` (tool definitions + handlers), `mcp-auth.ts` (bearer → authorizer, 401 header).

API — shared: `global-prefix-exclusions.ts` (+ spec), `cors-options.ts` (+ spec), `app.module.ts`, `apps/api/prisma/schema.prisma`, migration `20261114000000_mcp_oauth`.

Mobile consent page: `apps/mobile/src/features/oauth-consent/consentParams.ts` (forward `resource`), `consentDisplay.ts`, `apps/mobile/src/components/oauth-consent/ConsentBody.tsx`, 9 locale files (`oauthConsent.*`).

Admin: `apps/admin/src/app/api-apps/page.tsx` (source filter + DCR rows).

Ops and docs: `scripts/mcp-smoke.mjs`, `docs/ops/mcp.md`, `docker/nginx/api-mcp.conf`, `docs/wiki/features/mcp-connector.md`, pointer in `docs/wiki/features/public-api.md`, `user_docs/<9>/45-connected-apps.md`, `CLAUDE.md` (env vars + modules list), `.env.example`.

---

### Task 1: Data model — owner-less clients, client source, token resource

**Files:**
- Modify: `apps/api/prisma/schema.prisma`; Create: `apps/api/prisma/migrations/20261114000000_mcp_oauth/migration.sql`
- Modify every compile break from the nullable owner/homepage: `oauth-clients.service.ts`, `oauth-authorize.service.ts` (owner name on the consent preview), admin OAuth clients controller/service, shared types if they expose `homepageUrl`/owner.
- Test: `apps/api/src/modules/oauth/schema-guard.spec.ts` (extend), `oauth-clients.service.spec.ts`

**Interfaces:**
- Produces (Prisma): `enum OAuthClientSource { manual mcp_dcr }`; `OAuthClient.ownerUserId String?` (relation optional, still `onDelete: Cascade`), `OAuthClient.homepageUrl String?`, `OAuthClient.source OAuthClientSource @default(manual)`, `@@index([source, createdAt])`; `OAuthToken.resource String? @map("resource")`.
- Produces: consent preview `app.publisher` is `null` for an owner-less client; developer listings keep filtering by `ownerUserId: userId` (DCR clients never appear).

- [ ] **Step 1: Write failing tests** — `schema-guard.spec.ts`: `OAuthClient.ownerUserId and homepageUrl are optional; source defaults to manual; OAuthToken has resource`; `oauth-clients.service.spec.ts`: `listForOwner never returns an mcp_dcr client`.
- [ ] **Step 2:** `cd apps/api && npx jest src/modules/oauth/schema-guard src/modules/oauth/oauth-clients` — Expected: FAIL.
- [ ] **Step 3:** Edit the schema. Generate the migration DB-free: `git show HEAD:apps/api/prisma/schema.prisma > <scratch>/old.prisma` then `npx prisma migrate diff --from-schema-datamodel <scratch>/old.prisma --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/20261114000000_mcp_oauth/migration.sql`. Expected SQL: CREATE TYPE, ALTER COLUMN … DROP NOT NULL (×2), ADD COLUMN (×2), CREATE INDEX; no DROP TABLE/INDEX. `npx prisma generate`, then fix compile breaks (null owner → no publisher line, null homepage → omitted link).
- [ ] **Step 4:** Tests PASS; `npm run typecheck`; eslint on changed files.
- [ ] **Step 5: Commit** — `feat(oauth): owner-less clients, client source and token resource`

### Task 2: Extract the public-API authorization core (pinned), with resource binding

**Files:**
- Create: `apps/api/src/modules/public-api/public-api-authorizer.service.ts`, `public-api-authorizer.service.spec.ts`
- Modify: `guards/public-api-auth.guard.ts`, `public-api.module.ts`
- Test (unchanged, must stay green): `guards/public-api-auth.guard.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface AuthorizeOptions {
    requiredScopes: PublicScope[];      // [] only with tokenOnly
    tokenOnly: boolean;
    connectionLevel: boolean;
    accountId: string | null;           // already parsed; null = "not sent"
    resource: string | null;            // null = /public/v1, MCP_RESOURCE_URL = /mcp
  }
  export interface AuthorizedContext {
    user: AuthenticatedUser;
    oauth: { clientDbId: string; clientName: string; grantId: string; scopes: PublicScope[]; grantAccountIds: string[]; encryptionTier: number };
    accountId?: string; accountRole?: AccountRole; monthAnchorDay?: number | null;
    rateLimit: { limit: number; remaining: number };
  }
  export class PublicApiAuthorizer {
    authorize(bearer: string | null, opts: AuthorizeOptions): Promise<AuthorizedContext>;
  }
  ```
  Throws the same `PublicApiError`s as today (codes, statuses, messages unchanged); on 429 the error carries `retryAfterSec`; on `invalid_token` the error carries `wwwAuthenticate: 'Bearer error="invalid_token"'`. It does NOT touch `req`/`res`; it stamps `lastUsedAt` fire-and-forget exactly as today.
- The guard becomes: flag check → read `@TokenOnly`/`@RequireScopes`/`@ConnectionLevel` → parse `X-Account-Id` with the existing `resolveAccountId` rules (moved into the authorizer as `resolveAccountId(raw, distinct, grantAccountIds)` and exported) → `authorize(bearer, {…, resource: null})` → set headers and `req.*` exactly as today.
- Resource check (new): the token row's `resource` must equal `opts.resource` (both null, or both the MCP URL), else `invalid_token`.

- [ ] **Step 1: Pin** — run `npx jest src/modules/public-api/guards/public-api-auth.guard` on the unchanged code; Expected: PASS. Record the count.
- [ ] **Step 2: Write failing tests** in `public-api-authorizer.service.spec.ts`: `token with resource MCP_RESOURCE_URL is invalid_token when opts.resource is null`; `token without resource is invalid_token when opts.resource is the MCP URL`; `matching resource passes`; `per-account checks run when connectionLevel is false and accountId is given`; `a missing accountId with two granted accounts is account_required`; `429 carries retryAfterSec`; `never returns a context for a revoked grant`.
- [ ] **Step 3:** `npx jest src/modules/public-api/public-api-authorizer` — Expected: FAIL.
- [ ] **Step 4:** Implement the authorizer by moving the guard's body; make the guard delegate. Export `PublicApiAuthorizer` from `PublicApiModule`.
- [ ] **Step 5:** Run the guard spec (same count, all PASS), the authorizer spec, `npx jest src/modules/public-api`, typecheck, eslint on changed files.
- [ ] **Step 6: Commit** — `refactor(public-api): extract the authorization core and bind tokens to a resource`

### Task 3: OAuth — resource parameter, DCR scope policy, default scopes

**Files:**
- Create: `apps/api/src/modules/oauth/mcp.config.ts`, `oauth-resource.util.ts`, `oauth-scope-policy.ts` (+ specs)
- Modify: `oauth-code.ts` (`OAuthCodePayload.resource: string | null`), `dto/authorize.dto.ts` (`resource?` on preview and approve, `@MaxLength(512)`), `oauth-authorize.service.ts`, `oauth-token.service.ts`
- Test: `oauth-authorize.service.spec.ts`, `oauth-token.service.spec.ts`, new specs

**Interfaces:**
- Produces: `MCP_DEFAULT_SCOPES = ['expenses:read','categories:read','incomes:read','budgets:read','analytics:read'] as const`; `DCR_ALLOWED_SCOPES` = the same list; `isMcpEnabled(config)`, `mcpResourceUrl(config)`, `oauthIssuer(config)`, `oauthAuthorizeUrl(config)`; `parseResourceParam(raw: string | undefined, config): string | null` — absent/empty → null; equal to `mcpResourceUrl` (exact, trailing slash tolerated) → that URL; anything else → `InvalidTargetError`; `assertScopesAllowedForClient(client: { source }, scopes): void` (throws `InvalidScopeError` for a `mcp_dcr` client holding any scope outside `DCR_ALLOWED_SCOPES`); `defaultScopesForClient(client): PublicScope[] | null` (`MCP_DEFAULT_SCOPES` for `mcp_dcr`, else null = keep "scope is required").
- Authorize (preview and approve): scope = `parseScopeParam(scope)` or, when absent, `defaultScopesForClient(client)`; then `assertScopesAllowedForClient`; `resource = parseResourceParam(dto.resource)` stored in the code payload; an MCP resource is accepted only when `isMcpEnabled`. Errors returned in the existing RFC 6749 shape (`invalid_scope`, new `invalid_target`).
- Token: `authorization_code` — when the request carries `resource`, it must equal the payload's (`invalid_target` otherwise); issued tokens get `resource = payload.resource`. `refresh_token` — new pair copies the rotated token's `resource`; a request `resource` that differs is `invalid_target`; `assertScopesAllowedForClient` re-checked against the grant (a DCR grant somehow holding a write scope → `invalid_scope`, grant untouched). `issuePairWith(tx, grantId, resource)`.

- [ ] **Step 1: Write failing tests:** resource util (absent → null, exact/trailing-slash → URL, other → InvalidTargetError); scope policy (`mcp_dcr` + `expenses:write` throws; + `receipts:read` throws; manual client unrestricted); authorize: `DCR client without scope gets MCP_DEFAULT_SCOPES`, `manual client without scope still invalid_scope`, `resource stored in the code payload`, `MCP resource refused when MCP_ENABLED is off`; token: `code exchange issues tokens carrying the payload resource`, `mismatched resource at token is invalid_target`, `refresh keeps resource`, `refresh of a DCR grant with a write scope is invalid_scope`.
- [ ] **Step 2:** `npx jest src/modules/oauth` — Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npx jest src/modules/oauth src/modules/public-api` PASS; typecheck; eslint on changed files.
- [ ] **Step 5: Commit** — `feat(oauth): resource binding and the read-only policy for registered assistants`

### Task 4: Metadata documents, dynamic client registration, routing, CORS, cleanup

**Files:**
- Create: `oauth-metadata.controller.ts`, `oauth-register.controller.ts`, `oauth-register.service.ts`, `dto/register.dto.ts` (+ specs)
- Modify: `redirect-uri.util.ts` (+ `[::1]`, `MAX_REDIRECT_URIS = 5` exported), `oauth-public.module.ts`, `oauth-token-cleanup.cron.ts`, `apps/api/src/global-prefix-exclusions.ts` (+ spec), `apps/api/src/cors-options.ts` (+ spec)

**Interfaces:**
- `GET /.well-known/oauth-authorization-server` → `{ issuer, authorization_endpoint, token_endpoint, revocation_endpoint, registration_endpoint, scopes_supported: MCP_DEFAULT_SCOPES, response_types_supported: ['code'], grant_types_supported: ['authorization_code','refresh_token'], code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported }`.
- `GET /.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp` → `{ resource: mcpResourceUrl, authorization_servers: [issuer], scopes_supported: MCP_DEFAULT_SCOPES, bearer_methods_supported: ['header'] }`.
- `POST /oauth/register` (RFC 7591 JSON) — accepts `client_name`, `redirect_uris`, optional `client_uri`, `logo_uri`, `scope`, `token_endpoint_auth_method` (`none` only; anything else → `invalid_client_metadata`), `grant_types` (subset of the two). Creates the client per Global Constraints and returns 201 `{ client_id, client_id_issued_at, client_name, redirect_uris, grant_types, response_types: ['code'], token_endpoint_auth_method: 'none', scope }` (scope = requested ∩ `DCR_ALLOWED_SCOPES`, or the defaults). Errors: 400 `invalid_redirect_uri` / `invalid_client_metadata`, 429 when the per-IP window is exceeded (key `oauth:dcr:<ip>`, IP from `X-Real-IP`, falling back to `req.ip`).
- All three routes 404 unless `isPublicApiEnabled && isMcpEnabled`.
- Cron: soft-delete `source = mcp_dcr`, `deletedAt = null`, no grants, `createdAt < now − 30 days`; logs a count only.

- [ ] **Step 1: Write failing tests:** metadata shapes and 404 when either flag is off; register: happy path (public client, owner null, source `mcp_dcr`, not verified), lookalike names (`AI Budżet`, `ai budzet helper`, `Budżet Pro`) rejected, `javascript:`/`cursor://` redirect rejected, `http://[::1]:5000/cb` accepted, 6 redirect URIs rejected, write/receipts scope dropped from the returned scope, 11th registration from one IP in an hour → 429, Redis error → 429 (fail closed); prefix-exclusions spec lists the five new paths and `oauth/(.*)` is absent; CORS spec: the five paths get `*` without credentials and the extra headers; cron: soft-deletes only stale DCR clients without grants.
- [ ] **Step 2:** `npx jest src/modules/oauth src/global-prefix-exclusions src/cors-options` — Expected: FAIL.
- [ ] **Step 3:** Implement; register the controllers in `OAuthPublicModule`.
- [ ] **Step 4:** Tests PASS; typecheck; eslint on changed files.
- [ ] **Step 5: Commit** — `feat(oauth): authorization metadata and dynamic client registration for MCP clients`

### Task 5: The MCP endpoint and read tools

**Files:**
- Modify: `apps/api/package.json` (`"@modelcontextprotocol/sdk": "^1.27.0"`), `apps/api/src/app.module.ts`, `apps/api/src/modules/public-api/public-api.module.ts` (export what the tools need)
- Create: `apps/api/src/modules/mcp/{mcp.module.ts,mcp.controller.ts,mcp-server.factory.ts,mcp-tools.ts,mcp-auth.ts}` + specs

**Interfaces:**
- Consumes: `PublicApiAuthorizer.authorize` (Task 2), `mcpResourceUrl`/`oauthIssuer`/`isMcpEnabled` (Task 3), the public query functions (`listPublicExpenses`, `getPublicExpense`, `listPublicIncomes`, `getPublicIncome`, `listPublicCategories`, `listPublicBudgets`, `getPublicBudget`), `PublicAnalyticsService.summary|byCategory|monthly`, the mappers `toPublicExpense`/`toPublicIncome`/`toPublicBudget`, and the accounts-list logic of `public-accounts.controller.ts` (extract it into an exported function `listConnectedAccounts(prisma, grantId, userId, scopes)` used by both).
- `@Controller('mcp')`: `POST` handles JSON-RPC; `GET` and `DELETE` answer 405 (stateless, no SSE stream). Per request: flags (404 when off) → bearer via `mcp-auth.ts` (no/invalid token → 401 with the `WWW-Authenticate` header from Global Constraints) → a connection-level `authorize(..., { tokenOnly: true, connectionLevel: true, resource: mcpResourceUrl })` to fail fast → build `createMcpServer(ctx)` → `new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })` → `server.connect(transport)` → `transport.handleRequest(req, res, req.body)` → close both on `res` close. The app's existing `json()` parser has already parsed the body; pass `req.body`.
- Tools (`mcp-tools.ts`), each with a zod input schema and a description that says amounts are in the account's currency and the data is read-only; each handler calls `authorize(bearer, { requiredScopes, connectionLevel: false, accountId: args.account_id ?? null, resource: mcpResourceUrl, tokenOnly: false })` and maps rows with the context's `encryptionTier`:
  - `list_accounts` (tokenOnly, connection-level) → `listConnectedAccounts`.
  - `list_expenses` {account_id?, from?, to?, category_id?, search?, min_amount?, max_amount?, limit?, cursor?} — `expenses:read`.
  - `get_expense` {account_id?, id} — `expenses:read` (items/splits, never a receipt).
  - `list_incomes`, `get_income` — `incomes:read`.
  - `list_categories` {account_id?, type: 'expense'|'income'} — `categories:read`.
  - `list_budgets`, `get_budget` — `budgets:read`.
  - `get_spending_summary` {account_id?, from, to, group_by: 'total'|'category'|'month'} — `analytics:read`.
  - Result: `content: [{ type: 'text', text: <one-line summary> }]` plus `structuredContent` = the REST JSON. `PublicApiError` → `{ isError: true, content: [{ type: 'text', text: '<code>: <message>' }] }` (for `account_required`, the text tells the model to call `list_accounts` and pass `account_id`; for `rate_limited`, the retry seconds). Rows capped at 200.
- Logging: tool name, outcome code, ms — nothing else.

- [ ] **Step 1: Write failing tests** (controller with a mocked authorizer and Prisma; tools with mocked query functions): `404 when MCP_ENABLED is off`; `401 with resource_metadata header without a token`; `401 for a resource-less (public API) token`; `tools/list returns exactly the nine tools`; `list_expenses maps through toPublicExpense with the account's encryptionTier`; `account_required becomes a tool error mentioning list_accounts`; `account_encrypted becomes a tool error naming the account`; `limit above 200 is clamped`; `rate_limited carries retry seconds`; `no write or receipt tool exists`; `GET /mcp is 405`.
- [ ] **Step 2:** `npm install` (workspace root, updates the lockfile), then `npx jest src/modules/mcp` — Expected: FAIL.
- [ ] **Step 3:** Implement; register `McpModule` in `app.module.ts`.
- [ ] **Step 4:** `npx jest src/modules/mcp src/modules/public-api src/modules/oauth` PASS; typecheck; eslint on changed files; `bash scripts/check-no-shared-utils-runtime-import.sh`; boot check: `cd apps/api && npx ts-node -T -e "require('./src/app.module')"` (or the repo's usual compile) to catch DI errors.
- [ ] **Step 5: Commit** — `feat(mcp): read-only MCP endpoint over the public API`

### Task 6: Consent page — resource passthrough and the assistant badge (phone + desktop)

**Files:**
- Modify: `apps/api/src/modules/oauth/oauth-authorize.service.ts` (preview returns `app.registeredByAssistant: boolean` = `source === 'mcp_dcr'`), `apps/mobile/src/features/oauth-consent/consentParams.ts` (forward `resource` to preview and approve), `consentDisplay.ts`, `apps/mobile/src/components/oauth-consent/ConsentBody.tsx`, 9 locale files
- Test: `apps/mobile/src/features/oauth-consent/__tests__/consentParams.test.ts` (extend), `consentDisplay` test, `oauth-authorize.service.spec.ts`

**Interfaces:**
- When `registeredByAssistant`, the badge reads `oauthConsent.registeredByAssistant` ("Unverified · registered automatically by an AI assistant" in en; translated in de, es, fr, pl, ru, ua, be, nl), in the existing unverified warning style; name, URI and logo render as plain text (no link for an owner-less client's URI — show it as text).
- `resource` is forwarded unchanged when present; absent stays absent.

- [ ] **Step 1: Write failing tests:** `consentParams forwards resource to preview and approve`; `consentDisplay picks the assistant badge text when registeredByAssistant`; API `preview returns registeredByAssistant for an mcp_dcr client`.
- [ ] **Step 2:** Run the mobile consent tests and the API authorize spec — Expected: FAIL.
- [ ] **Step 3:** Implement; key in all 9 locales (i18n-add-strings procedure).
- [ ] **Step 4:** Tests PASS; mobile typecheck and lint. Best effort: the consent page at 390 px and 1280 px on the web build.
- [ ] **Step 5: Commit** — `feat(oauth-consent): show assistant-registered apps and forward the resource`

### Task 7: Admin — list assistant-registered clients

**Files:**
- Modify: `apps/admin/src/app/api-apps/page.tsx` and the admin OAuth clients API (list accepts `source`, returns `source`, owner may be null)
- Test: the admin OAuth clients controller/service spec in `apps/api`

**Interfaces:**
- `GET /admin/oauth-clients?source=manual|mcp_dcr` (default all); rows carry `source` and `ownerEmail: string | null`. The page gets a source filter and shows "Registered by an AI assistant" for `mcp_dcr`; block/unblock works for both.

- [ ] **Step 1: Write failing test:** `admin list filters by source and returns ownerEmail null for DCR clients`.
- [ ] **Step 2:** Run it — FAIL.
- [ ] **Step 3:** Implement API + page.
- [ ] **Step 4:** API test PASS; `npm run typecheck -w admin`, eslint on changed admin files, `npm run build -w admin`.
- [ ] **Step 5: Commit** — `feat(admin): list and block assistant-registered OAuth clients`

### Task 8: Production smoke script, e2e coverage and ops runbook

**Files:**
- Create: `scripts/mcp-smoke.mjs`, `docs/ops/mcp.md`, `docker/nginx/api-mcp.conf`
- Modify: `apps/api/test/public-api.e2e-spec.ts` (or a new `apps/api/test/mcp.e2e-spec.ts` on the same env preamble), `.env.example`

**Interfaces:**
- `scripts/mcp-smoke.mjs` (Node 20, no dependencies): env `BASE` (default `https://api.ai-budget.pl`), `APP_TOKEN` (the test user's app JWT, used only to call the consent backend's approve route), `ACCOUNT_ID`. Steps, each printing PASS/FAIL with the HTTP status only (never a token): fetch both metadata documents → register a DCR client (loopback redirect) → `POST /api/v1/oauth/authorize/approve` with PKCE, `resource`, the account → read `code` from the returned redirect → `POST /oauth/token` → `GET /public/v1/account` with the MCP token must be 401 (resource binding) → MCP `initialize` + `tools/call list_accounts` on `/mcp` → `POST /oauth/token` refresh → `POST /oauth/revoke` → a final `/mcp` call must be 401. Exit code non-zero on any FAIL. Also a `--public` mode that runs the same flow with no `resource` against `/public/v1/account` (the public API's never-run end-to-end check).
- e2e: the same flow in Jest against real Postgres/Redis (runs only with the env preamble, as today).
- `docker/nginx/api-mcp.conf`: `location = /mcp` and `location /.well-known/oauth-` blocks for the `api.ai-budget.pl` server, using `limit_req zone=budget_public burst=200 nodelay` and the same proxy lines as the live `location /public/` (documented as "copy from the live block"); `location = /oauth/register` likewise.
- `docs/ops/mcp.md`: prerequisites, the nginx step (shared nginx, backup + `nginx -t` + reload, owner's OK required), env (`MCP_ENABLED=true`, optional `MCP_RESOURCE_URL`, `OAUTH_ISSUER`, `OAUTH_AUTHORIZE_URL`) + force-recreate `api`, run `node scripts/mcp-smoke.mjs --public` then the MCP mode, manual check in Claude and ChatGPT, rollback (`MCP_ENABLED=false` + force-recreate; DCR clients stay, soft-deleted later by the cron), and publishing `45-connected-apps` help (three registrations + regenerate, as in `docs/ops/public-api.md` step 7).

- [ ] **Step 1:** Write the e2e flow test (fails to compile until written against the Task 2–5 code; it runs only with real DB env, so locally verify it compiles: `npx tsc -p apps/api/tsconfig.json --noEmit` including `test/`).
- [ ] **Step 2:** Write the script; run `node scripts/mcp-smoke.mjs --help` and, with `BASE` pointed at a non-existent host, confirm it fails cleanly with exit code 1 and no secret in the output.
- [ ] **Step 3:** Write the nginx snippet and the runbook.
- [ ] **Step 4: Commit** — `chore(mcp): smoke script, e2e flow and ops runbook`

### Task 9: Docs and wiring

**Files:**
- Create: `docs/wiki/features/mcp-connector.md` (What this is, Entry points, Key concepts, Invariants = the Global Constraints that bite, Known gaps: no writes, no receipts, smoke not yet run in prod, no directory listing yet), link from the API hub and `docs/wiki/index.md`; pointer in `docs/wiki/features/public-api.md` (resource binding, the extracted authorizer, owner-less clients); one line at the END of `## Ingests` in `docs/wiki/log.md` with `ABA-TBD`.
- Modify: `user_docs/<9 langs>/45-connected-apps.md` — a "Use AI Budżet in Claude, ChatGPT and other assistants" section (add the URL, approve on the consent page, read-only, revoke from Connected apps). Do NOT register the section (it publishes at launch per `docs/ops/mcp.md`).
- Modify: `CLAUDE.md` — Environment Variables: `MCP_ENABLED` (default off, needs `PUBLIC_API_ENABLED`), `MCP_RESOURCE_URL`, `OAUTH_ISSUER`, `OAUTH_AUTHORIZE_URL`, one line each pointing at the wiki page; API modules list gains `mcp` alphabetically.

- [ ] **Step 1:** Write the pages; `python scripts/wiki-lint.py` — Expected: no findings.
- [ ] **Step 2: Commit** — `docs(mcp): wiki page, user docs, env vars`
