# Slack Multi-Workspace OAuth — Design Spec

**Date:** 2026-06-05
**Status:** Approved (design), pending implementation plan
**Scope:** Let any Slack workspace install the AI Budget Assistant bot via OAuth, instead of the current single-workspace static-token install.

## Problem

The current Slack bot (ABA-194/196) is **single-workspace**: it uses one static `SLACK_BOT_TOKEN` from env and can only talk to the one workspace it was manually installed in. Users in other workspaces cannot add or use the bot. To let arbitrary workspaces install it, the app needs the Slack OAuth v2 install flow with per-workspace bot tokens.

## Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Entry point | **Backend OAuth endpoints + "Add to Slack" button in mobile bots screen** | Workspace admins install from the app; the install URL also works standalone. |
| Token storage | **Encrypt at rest** (AES-256-GCM, `SLACK_TOKEN_ENC_KEY`) | A bot token is full bot access to someone else's workspace; a DB dump must not leak usable tokens. |
| Per-team token handling | **Resolve inside `SlackClientService` by `teamId`** (Approach A) | Localizes the change to the client + mechanical call-site edits; handlers pass `userState.slackTeamId`. |
| Backward compat | **env-token fallback for the original workspace** | Zero migration; the manually-installed workspace keeps working when it has no `SlackInstallation` row. |

Rejected: per-request client injected through handlers (Approach B) — more plumbing, larger diff. Enterprise Grid org-wide install, App Directory listing, token rotation — out of scope (YAGNI).

## 1. OAuth flow — two public endpoints (root-level, excluded from `/api/v1`)

- `GET /slack/install`
  - Generate a random `state`, store in Redis `slack:oauth_state:{state}` (TTL 600 s).
  - 302-redirect to `https://slack.com/oauth/v2/authorize` with query `client_id`, `scope=chat:write,im:history,im:read,im:write,files:read`, `state`, `redirect_uri=<SLACK_OAUTH_REDIRECT_URL>`.
- `GET /slack/oauth/callback?code&state` (and `?error` when the user denies)
  - If `error` present → render a friendly error page.
  - Verify `state` exists in Redis; delete it (single-use). Missing/expired → error page (CSRF guard).
  - Exchange `code` via `oauth.v2.access` (`client_id`, `client_secret`, `code`, `redirect_uri`). Response yields `access_token` (xoxb bot token), `team.id`, `team.name`, `bot_user_id`, `app_id`, `authed_user.id`, `scope`, optional `enterprise`.
  - Upsert `SlackInstallation` (token encrypted).
  - Render a success HTML page: "AI Budget Assistant added to **<team>**! Open the app → Settings → Chat bots → Slack, generate a code, and DM the bot `link YOUR_CODE`."
  - Any exchange failure → error page; never leak the client secret or raw error to the browser.
- Both routes added to the `setGlobalPrefix` `exclude` list in `main.ts` (like the other Slack webhook routes).

The signing secret stays **global** (one per app) — inbound signature verification (`verify-signature.ts`) is unchanged. Only the **bot token** becomes per-team.

## 2. Data model — `SlackInstallation` (Prisma migration)

```prisma
model SlackInstallation {
  id                    String   @id @default(uuid())
  teamId                String   @unique @map("team_id")
  teamName              String?  @map("team_name")
  botToken              String   @map("bot_token")          // AES-256-GCM ciphertext (iv:tag:data, base64)
  botUserId             String   @map("bot_user_id")
  appId                 String?  @map("app_id")
  enterpriseId          String?  @map("enterprise_id")
  scope                 String?
  installedBySlackUserId String? @map("installed_by_slack_user_id")
  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")

  @@map("slack_installations")
}
```
Keyed by `teamId` (team-level install). `enterpriseId` is stored if present but not used as the key.

## 3. Token encryption at rest — `slack/helpers/token-crypto.ts` (TDD)

- AES-256-GCM. Key from `SLACK_TOKEN_ENC_KEY` (32 bytes; accept hex or base64, validate length at construction).
- `encryptToken(plain): string` → `base64(iv) + ':' + base64(authTag) + ':' + base64(ciphertext)`.
- `decryptToken(enc): string` → reverses; **never throws** on malformed input — returns `''` (caller treats empty as "no usable token", same as a missing installation), and logs a warning.
- Random 12-byte IV per encryption.
- Tests: round-trip; tampered ciphertext/tag → decrypt returns `''`; wrong key → returns `''`.

## 4. Per-team client resolution

- `SlackInstallationService` (new):
  - `upsert(data: { teamId, teamName?, botTokenPlain, botUserId, appId?, enterpriseId?, scope?, installedBySlackUserId? })` — encrypts `botTokenPlain` and upserts by `teamId`.
  - `getToken(teamId): Promise<string | null>` — loads the row, decrypts; returns `null` if no row or decrypt fails.
  - `getBotUserId(teamId): Promise<string | null>` — returns the stored `botUserId` (null if no row).
- `SlackClientService` changes:
  - Holds a `Map<token, WebClient>` cache.
  - Private `clientFor(teamId): Promise<WebClient | null>` — token = `installationService.getToken(teamId)` ?? env `SLACK_BOT_TOKEN` (fallback for the original workspace) → cached `WebClient`; returns `null` if no token at all (bot unconfigured for that team → methods no-op).
  - Public methods gain a leading `teamId` arg: `sendText(teamId, channel, text)`, `sendButtons(teamId, channel, body, buttons)`, `updateText(teamId, channel, ts, text)`, `updateButtons(...)`, `replyText(...)`, `replyButtons(...)`, `postPlaceholder(teamId, channel, text)`, `downloadFile(teamId, urlPrivateDownload, mimeType)` (uses the team token as Bearer).
  - `getBotUserId(teamId)` — `installationService.getBotUserId(teamId)` if present, else lazily `auth.test()` on the env-fallback client (cached per token) — preserves the original-workspace loop-guard.

## 5. Handler / dispatcher changes

- Every `this.slackClient.<method>(channel, …)` / `this.client.<method>(channel, …)` call in the 7 handlers becomes `<method>(teamId, channel, …)` where `teamId = userState.slackTeamId`.
- `SlackBotService`:
  - `handleEvent` passes `body.team_id` where a teamId is needed before `userState` exists (the file dispatch's `linkFirst` reply, and `handleLink`). `handleLink(slackUserId, teamId, code, channel)` already carries `teamId`.
  - `handleInteractivity` resolves `teamId = payload.user.team_id` (fallback `payload.team?.id`) and uses it for the `linkFirst` reply and passes it through `userState` (already carries `slackTeamId`).
  - The loop-guard `getBotUserId()` call becomes `getBotUserId(body.team_id)`.
- `downloadFile` call sites in voice/photo handlers pass `userState.slackTeamId`.

## 6. Backward compatibility

The original workspace was installed manually (env `SLACK_BOT_TOKEN`), so it has **no** `SlackInstallation` row. `clientFor(teamId)` falls back to the env token when `getToken` returns `null`, so that workspace keeps working unchanged. OAuth-installed workspaces always have a row and use their own token. No data migration.

## 7. Mobile — "Add to Slack" button

- In `app/settings/bots.tsx` Slack section, add an **Add to Slack** button → `Linking.openURL('<API_BASE>/slack/install')` (no `/api/v1` prefix). `API_BASE` derived from the configured API URL (strip the `/api/v1` suffix) — add a small helper or reuse an existing base-URL value.
- Copy clarifies the two distinct actions: **Add to Slack** installs the bot into a **workspace** (one-time, by a workspace admin); the **6-character code** links your **personal** account. Both shown in the Slack section.
- New `slackBot.*` i18n keys (e.g. `slackBot.addToSlack`, `slackBot.addToSlackHint`) in all 8 locales.

## 8. Config / env (`.env.example` + docs)

New:
- `SLACK_CLIENT_ID` — OAuth client id (Slack app Basic Information).
- `SLACK_CLIENT_SECRET` — OAuth client secret (server-side only).
- `SLACK_OAUTH_REDIRECT_URL` — `https://api.ai-budget.pl/slack/oauth/callback` (must be registered in the Slack app's OAuth & Permissions → Redirect URLs).
- `SLACK_TOKEN_ENC_KEY` — 32-byte key for token-at-rest encryption.

Existing `SLACK_BOT_TOKEN` (now the original-workspace fallback) and `SLACK_SIGNING_SECRET` (global) stay. OAuth endpoints no-op gracefully if `SLACK_CLIENT_ID`/`SLACK_CLIENT_SECRET` are unset (install redirect returns a "not configured" page).

Slack dashboard steps (runbook in docs): add the Redirect URL, activate **Manage Distribution → Public Distribution**.

## 9. Testing

- `token-crypto.spec.ts` — encrypt/decrypt round-trip; tampered ciphertext → `''`; wrong key → `''`.
- `slack-oauth.controller.spec.ts` — `/slack/install` redirects to the authorize URL with a `state` that was stored in Redis; `/slack/oauth/callback` with a bad/missing state → error page and no upsert; with a valid state → calls `oauth.v2.access` (mocked) and upserts the installation.
- Update existing Slack specs for the new `SlackClientService` signatures (teamId-first). Existing `verify-signature` / `parse-command` specs are unaffected.

## Security notes

- `state` (single-use, Redis-TTL) prevents CSRF on the callback.
- Client secret only in env, used server-side in the token exchange; never sent to the browser.
- Bot tokens encrypted at rest (AES-256-GCM); decrypt failures degrade to "no token" rather than throwing.
- `/slack/install` and `/slack/oauth/callback` are intentionally public (browser OAuth redirect) — they expose no account data and accept only a valid `state` + Slack `code`.
- Inbound webhook signature verification is unchanged (global signing secret).

## Out of scope (YAGNI)

- Enterprise Grid org-wide installation (team-level only).
- Slack App Directory public listing (Slack-side review, not code).
- Bot-token rotation/refresh (Slack bot tokens do not expire).
- Uninstall/`app_uninstalled` event handling — could be a follow-up to delete the `SlackInstallation` row; not required for install to work.
