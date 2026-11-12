# MCP connector — design

Status: draft for owner review · 2026-11-12. Owner decisions: any MCP client; read-only, the same
data the public API gives; the public API stays on in production. Everything else marked *(my call)*.

## Intent

People increasingly ask a general assistant (Claude, ChatGPT, others) about their money. Today they
must export data or copy numbers by hand. A remote MCP server lets any MCP-capable client read the
user's AI Budżet data on their behalf — "how much did we spend on groceries last month", "which
budgets are over" — with the user's explicit consent through the existing OAuth platform.

It is also an acquisition channel: listing in connector directories and a "works with Claude /
ChatGPT" story, at low cost because the OAuth server and the read API already exist and are live.

## Goals

- A user adds `https://api.ai-budget.pl/mcp` to an MCP client, is sent to the existing consent page
  (`app.ai-budget.pl/authorize`), ticks accounts, approves, and the client can call read tools.
- No API key, no manual app registration: the client discovers our authorization server and
  registers itself automatically.
- Read tools cover what `/public/v1` reads: accounts, expenses (list/filter, detail), incomes
  (list/filter, detail), categories (expense and income), budgets with current-period progress,
  analytics totals.
- Identical authorization and data rules to the public API: same grants, scopes, per-account
  checks, encryption refusals, rate limits, field masking.
- A first real end-to-end run of the OAuth flow in production (code → token → call → refresh →
  revoke), which has never been run.

## Non-goals

- Writes of any kind (no create/update/delete tools) in v1. *(owner)*
- Receipt image download through MCP. *(my call — images are large and of little use to a chat model)*
- A local (stdio) MCP server package. *(my call — remote only; any client that supports remote MCP)*
- Our own AI chat changes; this is purely an external surface.

## Anti-goals

- Any path that bypasses the public API's guard logic (a second, looser authorization).
- Returning data from an account the user did not tick on the consent page, or from a
  tier ≥ 2 encrypted account.
- Logging tokens, codes, verifiers or user financial data in MCP request logs.

## How it works

### Transport and endpoint *(my call)*

- One endpoint `https://api.ai-budget.pl/mcp`, MCP **Streamable HTTP** transport, stateless
  (no server-side session needed for read tools), JSON responses.
- Implemented inside the API (new module `mcp`) using the official TypeScript MCP SDK, outside
  the `/api/v1` prefix (added to `global-prefix-exclusions.ts` the way `/public/*` is).
- nginx: a `location /mcp` in the `api.ai-budget.pl` server using the existing `budget_public`
  rate-limit zone and the same proxy lines as `location /public/` (an ops step with the owner's OK,
  as for the leaflets change).

### Authorization

The MCP authorization spec requires, and we add:

- **Protected resource metadata** (RFC 9728) at
  `/.well-known/oauth-protected-resource` (and the `/mcp`-suffixed variant), naming our
  authorization server; `/mcp` answers 401 with a `WWW-Authenticate` header pointing at it.
- **Authorization server metadata** (RFC 8414) at `/.well-known/oauth-authorization-server`:
  issuer, `authorization_endpoint` = the existing consent page URL, `token_endpoint` =
  `/oauth/token`, `revocation_endpoint`, `registration_endpoint`, PKCE `S256` only, supported
  scopes, `token_endpoint_auth_methods_supported` including `none`.
- **Dynamic client registration** (RFC 7591) at `/oauth/register`: creates a **public** OAuth
  client (no secret, PKCE required — already the rule for every client) with the redirect URIs the
  MCP client sends. *(my call)* Rules:
  - redirect URIs must be `https://` or loopback `http://127.0.0.1`/`localhost` (desktop clients);
    no wildcards; at most 5.
  - client name/URI/logo are shown on the consent page as unverified (the existing "verified"
    badge is admin-only), so a malicious registration cannot impersonate us or another app.
  - rate-limited per IP; registered clients unused for 30 days with no grants are deleted.
  - registered clients are tagged `source: 'mcp_dcr'` so admin "API apps" can list them separately.
- Tokens, refresh rotation, revocation, consent, account selection and grant checks are the
  existing machinery, unchanged. The MCP server validates the bearer token through the same
  guard logic as `/public/v1` (reuse `PublicApiAuthGuard`'s verification, not a copy).

### Scopes *(my call)*

Read scopes only: `expenses:read`, `categories:read`, plus the incomes/budgets/analytics read
scopes that exist today. A DCR client may request only read scopes; a write scope in a
registration or authorize request from an MCP client is rejected.

### Tools *(my call — names follow the public API resources)*

Each tool calls the existing public-API query service, with the caller's grant and the account
the tool addresses, and returns the same JSON the REST endpoint returns (plus a short text
summary for clients that only render text):

- `list_accounts` — the accounts this connection can see (id, name, type, base currency, access).
- `list_expenses` — filters: account, date range, category, text search, min/max amount, limit,
  cursor.
- `get_expense` — one expense with items and splits (no receipt image).
- `list_incomes`, `get_income` — as above for incomes.
- `list_categories` — expense and income categories for an account.
- `list_budgets`, `get_budget` — with current-period progress.
- `get_spending_summary` — the public analytics totals for a period (by category / by month).

Tool descriptions are written so a model picks the right one, state that amounts are in the
account's currency, and say the data is read-only. Pagination via the public API's cursor.

### Limits and errors

- Same per-grant and per-client rate limits as the public API (one bucket per connection); a
  429 becomes an MCP tool error with a retry hint.
- Per-account refusals (encrypted, removed, viewer rules) become tool errors naming the account,
  never a silent empty list.
- Response size cap per tool call (e.g. 200 rows); the model is told to page.

## Rollout

- Behind its own flag `MCP_ENABLED` (default off), effective only when `PUBLIC_API_ENABLED` is
  also on. *(my call)*
- Before turning it on: a scripted production smoke of the full OAuth flow with a test account
  (register → authorize → token → `/public/v1/account` → MCP `list_accounts` → refresh → revoke),
  kept in `scripts/` and documented in `docs/ops/`. This also closes the public API's
  never-run end-to-end check.
- Manual check in at least two real clients (Claude and ChatGPT) before announcing.
- User docs: extend the existing connected-apps help section (still unregistered — publish it
  together with this), in 9 languages.

## Success after 3 months *(my call)*

- 100 users with an active MCP grant.
- Listed in at least one public MCP/connector directory.
- No security incident; no grant ever serving an unticked account.

## Decisions after the builder check *(all my calls)*

1. **DCR clients have no owner.** `OAuthClient.ownerUserId` becomes nullable and a `source` column
   (`manual` | `mcp_dcr`) is added (migration). Developer listings already filter by owner, so DCR
   clients never appear there; admin "API apps" shows them under a separate filter. `homepageUrl`
   becomes optional for DCR. Unused DCR clients (no grant, 30 days) are soft-deleted (`deletedAt`)
   by the existing token-cleanup cron.
2. **Audience binding (RFC 8707).** The `resource` parameter is accepted on authorize and token
   requests, stored on the authorization code and on the issued tokens (migration), and validated:
   a token issued for `https://api.ai-budget.pl/mcp` works only at `/mcp`; a token issued without a
   resource (existing integrations) works only at `/public/v1`. Refresh keeps the original
   resource. A mismatched or unknown resource is `invalid_target`.
3. **Shared authorization core.** The public API guard's logic is extracted into one service,
   `authorize(token, { scopes, accountId, resource })`, called by both the existing guard and the
   MCP tools. Behaviour of the existing guard is pinned by its current tests before the refactor;
   rate-limit buckets and error codes stay the same.
4. **Consent page for DCR clients.** Name, URI and logo are rendered as plain text; the page shows
   "Unverified · registered automatically by an AI assistant". Registration rejects names that
   contain "AI Budżet"/"AI Budget"/"Budżet" (case- and diacritic-insensitive). The authorization
   endpoint on `app.ai-budget.pl` (a different origin from the API issuer) is fine.
5. **Scopes.** A DCR/MCP authorize request without `scope` gets all read scopes:
   `expenses:read`, `categories:read`, `incomes:read`, `budgets:read`, `analytics:read`.
   `receipts:read` and every write scope are refused for DCR clients — enforced at authorize, token
   and refresh.
6. **Routing and CORS.** `/mcp`, `/oauth/register` and the `.well-known` paths are added to
   `global-prefix-exclusions.ts` (and its spec). These paths answer CORS `*` without credentials,
   allowing `Authorization`, `Content-Type`, `mcp-protocol-version`, `mcp-session-id` and exposing
   `WWW-Authenticate` and `mcp-session-id`.
7. **Redirect URIs.** `https://`, plus loopback `http://localhost`, `http://127.0.0.1` and
   `http://[::1]` on any port; no custom schemes in v1; at most 5 per client.
8. **Registration abuse.** 10 registrations per hour per client IP (the nginx-forwarded real IP),
   via `CacheService.incrementWindow`, failing closed.
9. **Transport.** Stateless Streamable HTTP via the official SDK; the builder confirms it coexists
   with the app's body parsers and `rawBody` setup.

## Left to the builder

Module structure, SDK version, exact metadata fields beyond the required ones, DCR storage shape
(reuse `OAuthClient` with a source tag), the smoke script, admin listing, nginx snippet, wiki page.
