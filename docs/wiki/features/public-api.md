# Public API and OAuth platform

*Hubs: [api](../api.md) · [auth](../auth.md). Related: [expenses-service](expenses-service.md),
[shared-groups](shared-groups.md), [chat-undo-last-action](chat-undo-last-action.md).*

## What this is

A versioned public REST API (`/public/v1`) that other products use on a user's behalf, with
our own OAuth 2.0 authorization server in front of it. Phase 1 opens **expenses** (list, read,
create, update, delete, receipt download, an incremental changes feed) and the account's expense
categories. Phase 2 (ABA-713) adds **incomes** (list, detail, changes feed, create/update/delete),
**budgets** (list/detail with current-period progress, create/update/delete) and read-only
**analytics** totals, plus income categories. The first consumer is our own AI Accounting product. Any user can register an app,
self-serve; API access is free; the user's own subscription tier still applies.

Everything ships dark behind **`PUBLIC_API_ENABLED`** (default off, anything but `true` is off).
With it off, every `/public/*` and `/oauth/*` route, the authorize preview/approve routes, the
developer and connected-apps routes and the docs answer 404, and the two settings entries hide.
Enable/rollback/pilot runbook: `docs/ops/public-api.md`. Design:
`docs/superpowers/specs/2026-11-01-public-api-design.md` (some details were changed by later
decisions, recorded below).

## Entry points

API, `apps/api/src/modules/oauth/` — the authorization server:
- `oauth.module.ts` — internal routes under `/api/v1`, all `JwtAuthGuard` (the user's own JWT):
  `oauth-authorize.controller.ts` (`GET /oauth/authorize/preview`, `POST /oauth/authorize/approve`),
  `developer-apps.controller.ts` (`/developer/apps`), `connected-apps.controller.ts` (`/connected-apps`)
- `oauth-public.module.ts` — the third-party-facing half: `oauth-token.controller.ts`
  (`POST /oauth/token`, `POST /oauth/revoke`, no `/api/v1` prefix)
- `oauth-token.service.ts` (code exchange, refresh rotation, revoke), `oauth-authorize.service.ts`
  (consent preview, approve, the "app connected" e-mail), `oauth-grants.service.ts`,
  `oauth-clients.service.ts`, `oauth-scopes.ts`, `oauth-code.ts`, `oauth-crypto.util.ts`,
  `redirect-uri.util.ts`, `oauth.config.ts` (`isPublicApiEnabled`), `guards/public-api-enabled.guard.ts`
- `oauth-token-cleanup.cron.ts` — daily 03:30 purge of expired token rows, paginated

API, `apps/api/src/modules/public-api/` — the resource server:
- `public-api.module.ts`; controllers `public-account.controller.ts`, `public-categories.controller.ts`,
  `public-expenses.controller.ts`, `public-incomes.controller.ts`, `public-budgets.controller.ts`,
  `public-analytics.controller.ts`
- `guards/public-api-auth.guard.ts` — the whole per-request authorization; `guards/public-write.guard.ts`
- `decorators/require-scopes.decorator.ts`, `decorators/token-only.decorator.ts`, `decorators/public-write.decorator.ts`
- Phase 2: `public-incomes.query.ts`, `public-income-write.adapter.ts` (through `IncomesService`),
  `public-budgets.query.ts`, `public-budget-write.adapter.ts` (through `BudgetsService`),
  `public-analytics.service.ts`; shared helpers `list-feed.util.ts` (list/feed paging),
  `public-idempotency.util.ts`, `public-write.shared.ts` (write context)
- `public-expenses.query.ts` (list, detail, changes feed), `public-expense-write.adapter.ts`
  (create/update/delete through `ExpensesService`), `public-categories.query.ts`,
  `mappers/public-expense.mapper.ts`, `dto/public-expense.dto.ts`, `cursor.util.ts`,
  `public-encryption-fields.ts`, `public-api-rate-limit.service.ts`,
  `filters/public-api-exception.filter.ts`, `public-api-error.ts`
- `docs/` — `public-docs.module.ts`, `public-docs.controller.ts`, `openapi.ts`, per-language
  texts `texts.{en,pl,ru}.ts` and guides `guide.{en,pl,ru}.md`

Elsewhere in the API: `apps/api/src/modules/expenses/expense-touch.util.ts` (`touchExpenses`),
`apps/api/src/modules/incomes/income-touch.util.ts` (`touchIncomes`),
`apps/api/src/modules/admin/admin-oauth-clients.controller.ts` (admin "API apps"),
`apps/api/src/modules/mail/app-connected-email-i18n.ts`, `apps/api/src/cors-options.ts`,
`apps/api/src/global-prefix-exclusions.ts`.

Mobile/web: `apps/mobile/app/authorize.tsx` (consent route) over
`apps/mobile/src/components/oauth-consent/` and `apps/mobile/src/features/oauth-consent/`;
`apps/mobile/src/hooks/useOAuthConsentResume.ts` (return to the consent after sign-in);
`apps/mobile/app/settings/developers.tsx`, `apps/mobile/app/settings/connected-apps.tsx` over
`apps/mobile/src/components/settings/developers/` and `apps/mobile/src/components/settings/connected-apps/`;
stores `apps/mobile/src/stores/developerAppsStore.ts`, `apps/mobile/src/stores/connectedAppsStore.ts`.

Admin: `apps/admin/src/app/api-apps/page.tsx`. Ops: `docker/nginx/api-public.conf`,
`docs/ops/public-api.md`. Migration: `20261101000000_public_api_oauth`, `20261103000000_public_api_phase2` (`Income.createdByOAuthClientId`,
`Budget.createdByOAuthClientId`, index `incomes (account_id, updated_at, id)`, `IncomeSource` gains `api`). Tests: the unit specs
beside each file, and `apps/api/test/public-api.e2e-spec.ts` (code → token → API → refresh →
revoke, cross-account isolation).

## Key concepts

**URL layout.** `/public/v1/...` (resource API), `/oauth/token` and `/oauth/revoke` (named one by
one in `global-prefix-exclusions.ts`, never `oauth/(.*)`, so the consent page's own backend stays at
`/api/v1/oauth/authorize/*`), `/public/docs/{en,pl,ru}` (Swagger UI) and
`/public/docs/<lang>/openapi.json`. The consent page is the web app's `app.ai-budget.pl/authorize`.

**Flow.**
1. The third party sends the user to `/authorize?response_type=code&client_id&redirect_uri&scope&state&code_challenge&code_challenge_method=S256`.
   PKCE S256 is required for every client, confidential or public.
2. `authorize.tsx` calls `GET /api/v1/oauth/authorize/preview`: app name, logo, homepage, verified
   badge, plain-language scopes, the user's accounts with a disabled reason per account (viewer,
   tier ≥2 encrypted; tier 1 marked read-only) and a `connected` flag per account when the user
   already has an active grant for this client. The accounts are **checkboxes**; the grant button is
   disabled until one is ticked, nothing is pre-ticked on a first connection unless exactly one
   account is selectable, and a re-consent pre-ticks the accounts that are connected AND still
   selectable. An unknown client or an unregistered
   `redirect_uri` is an error page that **never redirects**.
3. Signed out → the existing login screens; the request is parked (`pendingConsent.ts`) and
   `useOAuthConsentResume` returns to `/authorize` once the route has left `(auth)` and settled
   (a navigation-state listener plus `replace`, so it cannot race the login screen's own
   `replace('/(tabs)')`).
4. Allow → `POST /api/v1/oauth/authorize/approve` with `account_ids` (the phase 1 `account_id` is
   still accepted) upserts the grant (one active grant per client × user; re-consent updates its
   scopes and **replaces** the account set), stores a one-time code in Redis for 10 min and
   returns the redirect URL; Deny → `redirect_uri?error=access_denied&state=…`.
5. `POST /oauth/token` `grant_type=authorization_code` with `code_verifier` and client
   authentication → `{access_token (1 h), refresh_token (90 d), scope, account_ids}`; `account_id` is also returned,
   but only when the connection has exactly one account.
6. `grant_type=refresh_token` rotates: a new access AND refresh token; the old refresh token is
   marked `rotatedAt`.
7. `POST /oauth/revoke` (RFC 7009) revokes the whole grant; the user does the same from
   Settings → Connected apps, an admin by blocking the app.

**Scopes.** `expenses:read`, `expenses:write`, `receipts:read`, `categories:read`,
`incomes:read`, `incomes:write`, `budgets:read`, `budgets:write`, `analytics:read`
(`oauth-scopes.ts`). `GET /public/v1/account` needs only a valid token. User e-mail is never shared.

**Data model.** `OAuthClient` (public `clientId` `aba_ci_…`, `secretHash` null for public clients,
`redirectUris`, `status` active/blocked, `isVerified`, per-client rate-limit overrides, soft
`deletedAt`), `OAuthGrant` (client × user, `scopes`, `lastUsedAt`, `revokedAt`,
`revokedBy` user/client/admin/reuse_detected), `OAuthToken` (`kind` access/refresh, unique
`tokenHash`, `expiresAt`, `rotatedAt`). `OAuthGrantAccount` (table `oauth_grant_accounts`, grant ↔ account, the set of accounts a
connection may address; migration `20261102000000_public_api_multi_account` copied the old
`oauth_grants.account_id` rows into it and merged duplicate active grants). Codes live only in Redis (`oauth:code:<sha256>`).
`Expense.createdByOAuthClientId` plus the index `expenses (account_id, updated_at, id)`;
`ExpenseSource` gains `api`. The app shows "Added via <app>" on such an expense.

**Addressing an account (`X-Account-Id`).** A connection can hold several accounts, so each
`/public/v1` request names the one it is about in `X-Account-Id` (trimmed, lower-cased; a repeated
header is `400 validation_failed`). With exactly one granted account the header is optional; with
more, a missing header is `400 account_required` (also for `GET /public/v1/account`). An id outside
the grant is `403 account_not_granted`. `GET /public/v1/accounts` is the one connection-level
route (`@ConnectionLevel()`, token only): `{data:[{id, name, type, base_currency, access, active,
reason}]}` for every granted account, with `access` `read`/`read_write` and `reason`
`role`/`encrypted`/`archived`/null. The token response carries `account_ids`, and refresh/code
exchange fail `invalid_grant` only when no account of the connection is active.

**Shared accounts.** Connected apps are listed per grant (one row per connection, with the accounts
it holds). A co-owner sees a connection only with the granted accounts they are themselves
owner/editor of, never the grantor's other accounts; their Disconnect removes only those accounts
(`DELETE /connected-apps/:grantId/accounts/:accountId` removes one), and only the grantor revokes
the whole connection. An emptied grant is revoked. When an editor connects an app, the grantor and
every owner get the "app connected" e-mail (9 languages, by recipient's `user.language`; the list
of accounts is formatted with `Intl`, `ua` mapped to `uk`): the grantor one mail listing the added
accounts, each owner only their own accounts, at most once per added (app, account) per day
(`CacheService.setIfAbsentStrict` on `oauth:mail:connected:<client>:<account>`, 24 h), so a
connect → disconnect → connect loop is not an e-mail stream. A Redis outage on that key sends
anyway: a lost security notice is worse than a duplicate.

**Consent preview shows the developer's personal name by design** (`byDeveloper`: the app owner's
`user.name`). There is no separate publisher field in v1; the person who registered the app is
who the user is trusting.

**Rate limits.** Per grant 120/min and per client 1,200/min by default (verified apps get
overrides, AI Accounting 600 / 10,000), `POST /oauth/token` 30/min per client (a public client only on credentialed requests, see Invariants), all in Redis; plus a
separate nginx zone `budget_public` for `/public/` and `/oauth/` (`docker/nginx/api-public.conf`),
keyed on `$budget_limit_key` so CORS preflights are exempt. Its 429 carries CORS headers only for
our own origins: a browser client on a third-party origin cannot read it (documented in the guide).
The changes feed pages at most 200 rows (`PUBLIC_CHANGES_MAX_LIMIT`, default 200).

**App names.** A developer app's name and description refuse control characters and line breaks
(`app_name_invalid_characters` / `app_description_invalid_characters`), and a name equal to or
starting with "AI Budget", "AI Budżet", "AIBudget" or "MiCode" — compared case-, space-,
punctuation- and diacritic-insensitively (`app-name.util.ts`) — is `app_name_reserved`. The
consent screen shows an unverified app with a warning-coloured "Not verified by AI Budget" badge.
The app's form folds the text to one line before sending and explains `app_name_reserved`.

**Help** is the `45-connected-apps` section in all nine locales, registered in the three help
registries at launch (2026-11-02); it was kept dark until the flag went on (Ruling 32).

## Invariants

**Tokens are opaque random strings stored only as SHA-256 hashes** (`aba_at_`, `aba_rt_`, codes
`aba_ac_`, secrets `aba_cs_` prefixes so scanners recognise a leak). Not JWTs: a JWT would stay
valid until it expired, and the anti-goal is that a revoke or a block stops access on the very next
request. Never log a token, code, verifier, secret or token hash.

**The guard reads everything from the database on every request, never from a cache**: token
row, `grant.revokedAt`, client `status`/`deletedAt`, user `isActive`, and the grantor's current
membership. A concurrent revoke can leave a freshly minted token on a revoked grant, so the grant
row, not the token, is the authority.

**A grant works only while its grantor is still owner or editor of the account.** Re-checked on
every API request, **per addressed account** (`403 grant_inactive`), and at the token endpoint
(`invalid_grant` when no account of the connection is active; the grant is not revoked —
re-promoting the user revives it). A demoted or removed member must not keep a
backdoor through an app they connected.

**The header rule counts granted accounts, not usable ones.** A connection with two granted
accounts where one has gone inactive still needs `X-Account-Id` (`400 account_required`), so adding
or losing an account never silently changes which account an unaddressed request hits.

**Connection-level and account-level checks are separate.** Scopes, the revoked/blocked/user checks
and the rate limit (one bucket `pa:g:<grantId>` per connection) are connection-level; role,
encryption tier and archived-trip checks run for the account the request addresses (`403
account_encrypted` for a tier ≥2 account affects only that account). `@ConnectionLevel()` sits on
`GET /public/v1/accounts` only, pinned by a placement test; an unmarked route is account-level.

**A removed account is cut off on the next request with no token change**: the guard reads the
account set from the database every time, and the remaining accounts keep working on the same
tokens. A grant that loses its last account is revoked — including when an account is soft-deleted
(`AccountsService.remove` calls `dropAccountFromGrants` in the same transaction), and the daily
token cleanup cron revokes any zero-account grant it finds.

**A co-owner is never shown the grantor's other accounts**: neither in Connected apps nor in the
e-mail. Filtering is by the viewer's own owner/editor membership on each granted account.

**The grant's current scopes are authoritative**, not the scopes in the code payload or the
token: re-consent in another tab changes what every existing token can do. Refresh accepts a
`scope` subset but there is no per-token narrowing in v1; the response reports the grant's scopes.

**Scope checks are deny-by-default.** A `/public/v1` route with no `@RequireScopes` is refused
(`insufficient_scope`); the only opt-out is an explicit `@TokenOnly()` and it sits on the
`GET /account` method only — never at class level, where it would silently exempt every unscoped
route added later. The scope is the consent boundary the user saw.

**Authorization codes are single use and fail closed.** Stored with `CacheService.setStrict`
(the ordinary `set` swallows Redis errors — the user would be redirected with a dead code; a
failure is a 503) and consumed with `takeOnce` (`GETDEL`, throws on a Redis error instead of
reading as "no code"). The code is burned before any check, so a failed exchange cannot be retried.
`redirect_uri` must match the registered string exactly; PKCE S256 is checked for every client.

**A public client's token budget counts only credentialed requests.** A confidential client is
counted right after its secret checks out; a public client has no secret, so its `client_id` is
effectively public and counting every request would let anyone lock the real app out with junk
(`slow_down` for everyone). It is counted only once it presents a code found in Redis and bound to
it, or a refresh token whose hash is found and bound to it (`OAuthTokenService.exchangeCode` /
`refresh`). Junk requests from public clients are left to the nginx zone.

**Credentials never reach Sentry.** `instrument.ts` runs `scrubSentryEvent`
(`common/sentry/sentry-scrub.ts`) as `beforeSend` and `beforeSendTransaction`: on `/oauth/`,
`/public/` and `/api/v1/oauth/` it drops the request body, cookies and `Authorization`/`Cookie`
headers; on every route it drops a query string carrying `code`, `token`, `access_token`,
`refresh_token`, `id_token`, `client_secret` or `code_verifier` (also in breadcrumb URLs). The
expected 503s (`unavailable`, `temporarily_unavailable`, raised on a Redis blip) are not reported
at all (`isExpectedUnavailable`). Any other non-`PublicApiError` 5xx reaches the caller with a
fixed message, never its own.

**Refresh-token reuse revokes the whole grant** (`reuse_detected`). Rotation is a conditional
`updateMany` on `rotatedAt: null`; a concurrent refresh that loses the race is treated as reuse too
(strict RFC 6819 behaviour) — an integrator with racing refresh workers gets disconnected, which the
guide documents.

**Encryption tiers.** Tier ≥2 accounts cannot be connected and return `403 account_encrypted` if
encryption is raised after a grant exists — amounts are ciphertext there. Tier 1 is read-only:
writes, `merchant` and `search` filters are `403 account_encrypted`, and every tier-1 text field is
returned `null` and listed in `encrypted_fields` — expense description/notes/merchant/location
name, line-item descriptions, tag names, project name, category names. The list is
`public-encryption-fields.ts`, an API-local copy of `ENCRYPTION_FIELDS.tier1` (the API must not
runtime-import shared-utils); `public-encryption-fields.spec.ts` fails when a shared tier-1 field
lands in neither the "nulled" nor the "not exposed" bucket, so a field the app starts encrypting
cannot leak through the API. Withheld row by row or not: bot/import/OCR rows are plaintext on the
server, but the account promised these fields are end-to-end encrypted.

**Planned expenses (`isPlanned`) are invisible** — not in list, detail, feed, or as an
Idempotency-Key replay; they are not spend. Debts and split receivables are shown, with `is_debt`
and `is_split_receivable` flags.

**The changes feed is keyset on `(updated_at, id)` with a 10-second lag measured on the DB clock**
(`SELECT now()`), and the cursor never advances past that horizon. `@updatedAt` is stamped when
Prisma builds the query, not at commit, so a slow transaction could otherwise commit a row behind a
cursor that already moved on. A row deleted or turned planned is emitted as `{type:"delete"}`, so
the integrator drops its copy.

**A child edit must bump the parent expense's `updatedAt`**, or the feed never re-delivers the
expense and the integrator keeps stale line items, tags, project or splits. Every child write path
(REST items/tags/projects, the sync item and relation handlers) calls `touchExpenses`, which is
always filtered by `accountId` (a child pointing at another account's expense can never bump it),
uses `updateMany` (an expense not in this account is a no-op, not a P2025), refuses an `undefined`
filter value (Prisma would drop it and bump the whole account), and does not touch `syncVersion`
(that would make the app's next push a version conflict). Side effect: chat undo's "unmodified
since creation" check (`ai-undo-tools.service.ts`, `updatedAt` vs `createdAt`) now also trips on a
tag/project/item edit — arguably more correct, but a behaviour change.

**`Idempotency-Key` is scoped to the app that created the row, and to the account.** The same key
on two accounts of one connection is two independent requests, and the changes-feed cursor is
per account too. The key becomes the row's
`clientId`; a repeat from the same client returns the existing expense with `200` without calling
`ExpensesService.create` (whose upsert update branch would overwrite it). A key that matches a row
of another origin, or another expense's server id, is `409 idempotency_key_conflict` — otherwise a
third party could read or overwrite an app row by guessing its client id. A key whose expense was
since deleted is `409` too, not a resurrection.

**`createdByOAuthClientId` is set by the server only**, as the fourth argument of
`ExpensesService.create`, never a DTO field: the sync handler spreads client payloads into the DTO,
so a field would let anyone forge "Added via <app>". It is the `OAuthClient` db id, so the app-facing
`toExpenseResponse` strips the scalar as well as the relation and exposes only `createdByApp`
(public `clientId` + name).

**`GET /public/v1/categories` and the write path's `category_id` check share one predicate**
(`publicCategoryWhere`: account-owned, expense type, not deleted). The internal resolver silently
stores an unknown category as "no category", so listing anything the write would not accept is a
silent data loss for the integrator.

**Group-mirror rows (`source: 'group'`) refuse `amount`, `currency` and `date`** with
`422 validation_failed` (`details.fields.<f>: "set by the shared group"`); other fields are writable
and delete is allowed, as in the app. A write API must never drop a field silently.

**Writes go through the app's services**, never reimplemented, so anomaly checks, family feed,
gamification, merchant rules and cache busts fire as for an app write; the adapter adds what
`ExpensesController` adds on top (budget alert re-check, shared-activity push).

**Analytics counting rules.** Every row is converted with `common/utils/fx.ts` into the requested
currency, which defaults to the grantor's display currency (`user.currencyCode`), never a row's
own currency. A row whose rate is unknown is excluded and the response says `fx_approximate`,
never summed unconverted. Splits resolve through `attributeToCategories`; planned expenses and
split receivables are excluded; debts and transfers are counted as the app's Analytics tab counts
them. `transaction_count` is expense plus income rows. Results are cached 60 s under a key that
carries the currency. Consent says income and spending totals are shared.

**Income and budget `Idempotency-Key` follow the expense rule** (shared `public-idempotency.util.ts`):
scoped to the app and the account, stored as the row's `clientId`, a replay is `200`, a foreign or
deleted match is `409 idempotency_key_conflict`. `createdByOAuthClientId` is server-set only.

**A transfer-linked income is read-only** (`is_transfer` is exposed so an integrator can tell):
update and delete answer `422`; debt flags are read-only too. A budget allocation set replaces the
old one, and two allocations with the same category are refused (`422`) rather than merged.

**Income child edits (tags, projects) bump the income's `updatedAt` through `touchIncomes`**, same
reasoning and same account-filtered `updateMany` as `touchExpenses`, so the income feed re-delivers it.
`IncomesService.create/update` write the row itself, so they need no extra bump.

**400 vs 422.** A malformed request, body or query, fails the class-validator pipe with `400
validation_failed` (as phase 1 does); `422` is reserved for a request that parses but cannot be
honoured (wrong category, transfer-linked income, mirror row, duplicate allocation category).

**The public OpenAPI document includes only `PublicApiModule` and `OAuthPublicModule`.** That is
why the token controller has its own module: the internal consent, developer and connected-apps
routes stay out of the published reference by construction. Schema names are the class names and
are frozen — renaming one breaks every generated client.

**The partial unique index `oauth_grants_active_client_user_key`** (one active grant per client ×
user, `WHERE revoked_at IS NULL`; it replaced the phase 1 `oauth_grants_active_key`, which was per
account) exists only in the migration SQL — Prisma cannot model it.
`schema-guard.spec.ts` fails if a later migration drops it.

**On mobile, only the list routes decide whether the feature exists.** A 404 from
`GET /developer/apps` or `GET /connected-apps` means `PUBLIC_API_ENABLED` is off and hides both
settings rows; a 404 on a single app or grant (deleted in another tab, revoked elsewhere) only drops
that item. The first implementation treated any 404 as "feature off", so deleting an app that was
already gone in another tab hid both settings entries (caught in review, never shipped).

**The consent page must not be framable** — `frame-ancestors 'none'` + `X-Frame-Options: DENY`
for the whole `app.ai-budget.pl` host (SPA navigation can reach `/authorize` without a page load),
applied in the VPS nginx from `docker/nginx/api-public.conf`; the page also frame-busts itself on
web.

## Known gaps

- **Moving an expense to another account leaves no tombstone in the source feed**, and renaming a
  tag or project does not bump the expenses that carry it — the integrator keeps a ghost or a stale
  name until a full resync. Both need schema or broad bumps; deferred and documented in the guide.
- **A fresh client receives every historical tombstone** as a delete entry on its first full sync
  (documented in the guide; deleting an unknown id is a no-op for the integrator).
- **Concurrent first requests with the same Idempotency-Key** can both pass the lookup; the
  service's upsert then makes the second an update. The guide says retries must be sequential.
- **Native sign-up from a consent link**: a brand-new native user registering may be routed to
  `/get-started` and lose the request; web is the main consent surface. On the pilot checklist.
- A failed parent bump after a child write outside a transaction returns 500 after the child is
  stored; a retried item create could duplicate.
- `/oauth/revoke` has no per-client rate limit; invalid-token requests are limited only by nginx.

- **The phase 2 e2e scenario (k) is written but has not been run** — no disposable Postgres/Redis was
  available when it landed; run it before the first pilot of the new scopes.
- **The app's Analytics tab differs from the API**: the tab adds an amount with no known rate
  unconverted and its currency picker filters rather than converts. Aligning the app is a separate task.
- Budget `is_active` is read-only; categories, tags and projects are not writable; goals and debts as
  resources, and webhooks, are later phases.

## History

Public API phase 2 ([ABA-713](https://github.com/micode-ai/ai-budget-assistant/issues/747), spec `docs/superpowers/specs/2026-11-03-public-api-phase-2-design.md`):
incomes, budgets and analytics totals with five new scopes, income categories, shared list/feed,
idempotency and write helpers.

Public API multi-account connections ([ABA-709](https://github.com/micode-ai/ai-budget-assistant/issues/742), spec `docs/superpowers/specs/2026-11-02-public-api-multi-account-design.md`):
one grant holds several accounts (`oauth_grant_accounts`), `X-Account-Id`, `GET /public/v1/accounts`,
multi-select consent with replace-the-set re-consent, per-account removal in Connected apps.

Public API phase 1 ([ABA-707](https://github.com/micode-ai/ai-budget-assistant/issues/740)): the OAuth server, `/public/v1` expenses and categories, Swagger in
English/Polish/Russian, the consent page, Developers and Connected apps settings, admin "API apps",
"Added via <app>", the nginx snippet and the ops runbook. Shipped dark behind `PUBLIC_API_ENABLED`.
Final review wave: public-client token counting, Sentry scrubbing, reserved/control-character app
names, changes feed max 200, e-mail dedupe, help section kept dark until launch.
