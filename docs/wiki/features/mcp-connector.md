# MCP connector (AI assistants)

*Hubs: [api](../api.md) · [auth](../auth.md). Related: [public-api](public-api.md) (the OAuth server and
the data rules this reuses), [chat-architecture](chat-architecture.md) (our own in-app assistant, unrelated).*

## What this is

A read-only [Model Context Protocol](https://modelcontextprotocol.io) endpoint, `POST /mcp`, so a user can
add `https://api.ai-budget.pl/mcp` as a custom connector in Claude, ChatGPT and other assistants and ask
about their own spending. It is a second front door onto the same data as `/public/v1`, behind the same
OAuth server: the assistant registers itself (Dynamic Client Registration, RFC 7591), the user approves on
the existing consent page, and every tool call is authorized exactly like a REST call. Nine tools, no
writes, no receipt images.

Gated by **`PUBLIC_API_ENABLED` and `MCP_ENABLED`** (both must be exactly `true`); **enabled in production
on 2026-11-13** (runbook steps 1-2: nginx blocks and the flag). Design:
`docs/superpowers/specs/2026-11-12-mcp-connector-design.md`; plan:
`docs/superpowers/plans/2026-11-12-mcp-connector.md`. Enable/rollback/smoke/launch runbook:
`docs/ops/mcp.md`. Issue: [ABA-750](https://github.com/micode-ai/ai-budget-assistant/issues/788).

## Entry points

API, `apps/api/src/modules/mcp/` — the resource server:
- `mcp.module.ts`, `mcp.controller.ts` (`POST /mcp`, stateless: one SDK server per request),
  `mcp-server.factory.ts`, `mcp-auth.ts` (the connection-level pre-check and the 401 challenge),
  `mcp-body-limit.ts` (route-scoped 128 KB parser), `mcp-tools.ts` (the nine tools: `list_accounts`,
  `list_expenses`, `get_expense`, `list_incomes`, `get_income`, `list_categories`, `list_budgets`,
  `get_budget`, `get_spending_summary`)

API, `apps/api/src/modules/oauth/` — the additions on the authorization server:
- `mcp.config.ts` (`isMcpEnabled`, `MCP_DEFAULT_SCOPES`, issuer/resource defaults, `normalizeResourceUrl`),
  `oauth-resource.util.ts` (resource validation, `invalid_target`), `oauth-scope-policy.ts` (what a
  `mcp_dcr` client may hold), `guards/mcp-enabled.guard.ts`
- `oauth-metadata.controller.ts` — `/.well-known/oauth-authorization-server`,
  `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp`
- `oauth-register.controller.ts`, `oauth-register.service.ts`, `register-body-limit.ts`,
  `ip-bucket.util.ts` — `POST /oauth/register`
- `oauth-token-cleanup.cron.ts` — also soft-deletes unused DCR clients

Shared with the public API (`apps/api/src/modules/public-api/`): `public-api-authorizer.service.ts`
(the whole authorization, see [public-api](public-api.md)), `public-read.views.ts` (the row/page views both
the REST controllers and the MCP tools call).

Elsewhere: `apps/api/src/global-prefix-exclusions.ts` (the five root paths), `apps/api/src/cors-options.ts`,
`apps/admin/src/app/api-apps/page.tsx` (lists and blocks assistant-registered clients),
`apps/mobile/src/components/oauth-consent/` (the consent page and its "registered by an assistant" note).
Ops: `docker/nginx/api-public.conf`, `docs/ops/mcp.md`, `scripts/mcp-smoke.mjs`. Tests:
`apps/api/test/mcp.e2e-spec.ts` (written, **not yet run**), the unit specs beside each file.

## Key concepts

**Flow.** An assistant calls `/mcp` with no token → `401` with `WWW-Authenticate: Bearer
resource_metadata="<issuer>/.well-known/oauth-protected-resource/mcp"` → it reads the metadata, then
`/.well-known/oauth-authorization-server` → `POST /oauth/register` (a public client, `source = mcp_dcr`,
no owner) → the browser goes to `OAUTH_AUTHORIZE_URL` (the consent page) with `resource` → code (PKCE
S256) → `POST /oauth/token` → `/mcp` with the bearer. Refresh keeps the original token's resource.

**Resource binding.** A token carries the `resource` it was issued for. `null` = `/public/v1` only;
`MCP_RESOURCE_URL` = `/mcp` only. The public API's own identifiers — the issuer and `<issuer>/public/v1`,
normalized the same way — also mean `null` (R10), at authorize preview/approve, code exchange and refresh,
so a spec-following RFC 8707 client of the public API is not broken by naming its resource. Any other value
at authorize or token is `invalid_target`. The
resource rides on the authorization code in Redis next to the rest of the code (no DB column, ruling R1).
Ids are compared as normalized strings, so issuance stores exactly the normalized `MCP_RESOURCE_URL`.

**Who may hold what.** A `mcp_dcr` client gets only `expenses:read`, `categories:read`, `incomes:read`,
`budgets:read`, `analytics:read`; `receipts:read` and every `*:write` are `invalid_scope` at authorize,
token and refresh. A request with no `scope` gets exactly those five (`MCP_DEFAULT_SCOPES`). A DCR client
must send `resource` (R4) — it may only ever hold MCP tokens, never `/public/v1` ones. Manual
(developer-registered) clients may also obtain MCP-bound tokens (R5).

**Dynamic registration.** Public client, `ownerUserId = null`, `isVerified = false`. Redirect URIs are
`https://` or loopback `http://localhost|127.0.0.1|[::1]` on any port, no custom schemes, at most 5,
no whitespace or control characters; exact match at authorize. The character rule applies to **new** URIs
only (R13): DCR registration, developer-app create, and URIs an update adds; a URI already stored on an app
is never re-rejected when its form is saved again. `client_name` is required, max 80
characters, and may not contain the brand (see Invariants).

**Consent for a client nobody vetted.** The page shows the assistant's own name and a "registered
automatically by an AI assistant" note instead of "by <developer>" (`registeredByAssistant` in the
preview). Everything in the registration metadata is attacker-controlled and rendered as such: the name
as plain text stripped of bidi/zero-width/control characters and cut at 80 characters, the self-declared
homepage only as a punycode host with no link, no privacy link, and **never the logo** — always the generic
icon, since fetching a self-declared URL would also hand the viewer's IP address to whoever registered it
(R11). The one fact that is not self-declared is shown prominently in a warning frame: **"Access will be
sent to <host>"**, the punycode host of this request's validated `redirect_uri`, which the preview returns
as `app.redirectHost` for `mcp_dcr` clients only (so a lookalike host reads as `xn--…`). The user still
ticks accounts exactly as for any app.

**Disconnecting.** The grant is an ordinary `OAuthGrant`, so Settings → Connected apps lists it and
Disconnect revokes it; the next `/mcp` call is refused. There an assistant-registered app carries
`registeredByAssistant` and `homepageUrl: null` (the server drops it), so its self-declared homepage is
never a tappable link. An admin blocks the client under "API apps" (paged, 50 per page; the page lists
assistant-registered clients with a "Self-registered (MCP)" marker).

## Invariants

**One authorization core.** `PublicApiAuthorizer.authorize(token, {requiredScopes, tokenOnly,
connectionLevel, accountId, resource, consumeRateLimit?})` is the only thing that decides whether a
bearer may do something — the REST guard and `/mcp` both call it. Do not write a second check in the MCP
layer; extend the authorizer so both surfaces change together. The REST guard passes `resource: null`,
`/mcp` passes `MCP_RESOURCE_URL`.

**The database is read on every call, never cached** — token row, grant `revokedAt`, client
`status`/`deletedAt`, user `isActive`, the grantor's current membership of the addressed account, the
encryption tier. A revoke, a block or a demotion stops `/mcp` on the next tool call, same as REST
(see the matching invariants in [public-api](public-api.md)). Never add a cache in front of it.

**A token works on exactly one surface.** `/mcp` refuses a token with no resource and a token bound to
anything else; `/public/v1` refuses an MCP-bound token. A DCR client without `resource` is
`invalid_target` (R4), so an anonymous self-registered client can never reach the REST API.

**`/mcp` is read-only because of its tool set, not because of a scope check** (R5). A manual client can
hold write scopes and an MCP-bound token. Adding a write tool therefore forces a scope-policy decision
(which scopes, which client sources, confirmation UX) — it must not be done by just registering the tool.

**One rate-limit unit per tool call.** `consumeRateLimit` exists for this: the controller's connection
check before dispatch passes `false`, and each tool call authorizes again with the count, so a call costs
one unit in the same `pa:g:<grantId>` / per-client buckets as REST. `initialize` and `tools/list` are
therefore **unmetered by design**; only nginx bounds them. Do not "fix" this by counting the pre-check.

**Body and batch limits.** `/mcp` has a route-scoped 128 KB body cap registered ahead of the global
parser (the global one would accept 50 MB before authentication), and JSON-RPC array bodies (batches)
are refused with `-32600` — protocol 2025-06-18 removed batching and a batch would multiply cost per
unit. Tool results never exceed 200 rows; `get_expense` caps line items at 200 with "Showing 200 of N"
(R6); list tools take `limit` (1–200, default 50) and `cursor`.

**Registration is abuse-bounded and fails closed.** Per client IP 10/hour, IPv6 bucketed per /64
(`ip-bucket.util.ts`) so rotating inside a prefix does not escape the limit, plus a global 300/hour,
all through `CacheService.incrementWindow` (a Redis outage is a 429, never unlimited registrations). The
IP is `req.ip` with Express `trust proxy`, never a raw `X-Real-IP`/`X-Forwarded-For` header. The
registration body is capped at 16 KB.

**The brand is blocked, with confusables.** A `client_name` that contains the product name (case-,
diacritic- and whitespace-insensitive, a small confusables map folded in, also `micode` and the Polish
and Russian words for budget, `budżet` and `бюджет`) is `invalid_client_metadata`; an assistant must not be able to present itself as us on
our own consent page. **A trailing `(...)` is not checked when something precedes it** (ABA-753): MCP
clients register as `<client> (<the user's name for the server>)` — Claude Code sent
`Claude Code (ai-budget)` for a connector the user named after us and was refused, so every user who
named it that way could not connect. `AI Budget (official)` and a bare `(AI Budget)` are still refused;
only the last parenthetical is skipped.

**Everything is dark unless both flags are `true`.** `/mcp`, `/oauth/register` and the three
`.well-known` documents answer 404 unless `PUBLIC_API_ENABLED` and `MCP_ENABLED` are both exactly `true`
(same trimmed, case-insensitive parsing as `isPublicApiEnabled`). With `MCP_ENABLED` off nothing about
the public API changes. The route-scoped body parsers of `/mcp` and `/oauth/register` in `main.ts` run
before any guard, so they read the flag per request and call `next()` untouched while it is off —
otherwise they would answer 400/413 and reveal a dark route. The five paths are named one by one in `GLOBAL_PREFIX_EXCLUDED_ROUTES` (never
`oauth/(.*)`), pinned by `global-prefix-exclusions.spec.ts`, and get the public CORS policy with
`mcp-protocol-version`/`mcp-session-id` allowed and `WWW-Authenticate`/`mcp-session-id` exposed.

**Same data rules as `/public/v1`.** Per-account checks (granted, grantor still owner/editor there,
`encryptionTier >= 2` is `account_encrypted`), field masking through the existing mappers with the
account's tier, via the shared `public-read.views.ts`. A new tool reads through those views, never
through a Prisma query of its own.

**Never log a token, code, verifier, secret, token hash or any financial row.** MCP logs carry tool name,
outcome and duration only — plus, on `internal_error`, the error's class name (`err=<name>`), never its
message.

## Known gaps

- **First real client run (2026-11-13, Claude Code):** discovery, DCR, consent with `resource`, token
  and `initialize`/`tools/list` all succeeded; the registration came from the user's own IP (a local
  client, so the per-IP limit does not bite). claude.ai and ChatGPT are still unchecked: on a claude.ai
  Team/Enterprise organization only the org owner may add a custom connector, and the ChatGPT account
  at hand had no custom-connector option. The first `POST /mcp` after the token answered 400 and the
  client recovered on its own (probably the SDK's protocol-version check); not yet diagnosed.

- **The e2e flow has not been run on a real database** (no local Redis when it was written), and the
  **production smoke (`scripts/mcp-smoke.mjs`) is pending** — both are the first things to do at launch.
- **The per-IP registration limit vs platform egress is unverified** (R12): if Claude or ChatGPT register
  from a shared egress, their users share one 10/hour bucket. The launch gate in `docs/ops/mcp.md` step 4
  records the registration IPs before announcing.
- No write tools and no receipt images, on purpose. No directory listing yet (Claude/ChatGPT connector
  directories); users add the URL by hand.
- Categories and budgets lists truncate at the cap without a cursor.
- DCR `413`/`400` answered by the pre-CORS body parsers carry no CORS headers (a browser-based client
  sees an opaque failure).
- No "What's New" entry yet. The help text is deliberately **not** in `user_docs/` while MCP is dark (R9:
  `45-connected-apps` is live, so any `generate:help` would publish it); it sits in `docs/ops/mcp.md` step 5,
  to paste at launch.

DCR clients are cleaned up (R8): the daily `OAuthTokenCleanupCron` soft-deletes an `mcp_dcr` client older
than 30 days that has no grant active or revoked within the last 30 days — none at all, or only grants
whose latest `revokedAt` is over 30 days old. Manual clients and clients with an active grant are never
touched.

## History

MCP connector ([ABA-750](https://github.com/micode-ai/ai-budget-assistant/issues/788), spec `docs/superpowers/specs/2026-11-12-mcp-connector-design.md`): authorizer
extraction, resource binding, DCR, `/mcp` with nine read tools, consent-page and admin changes, nginx and
ops runbook, smoke script. Review waves tightened the registration limits (per /64, global cap), one
rate-limit unit per tool call, the body cap and batch refusal. The final review wave added R8 (cleanup of
clients whose grants are all revoked), R9 (help text held in the runbook), R10 (public API identifiers as
`resource`), R11 (redirect host on consent, no DCR logo, no DCR homepage link), R12 (launch gate), R13
(whitespace rule for new redirect URIs only), dark body parsers, a paged admin list and `err=` on
`internal_error` logs.
