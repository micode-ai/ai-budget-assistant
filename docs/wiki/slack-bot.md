# Slack Bot

## What this is
A NestJS module (`modules/slack/`) embedded in the API that lets users interact with their budget via Slack DMs — text, voice (Whisper), and photo (OCR receipts). Full feature parity with the Telegram and WhatsApp bots, reusing the same shared services (`ChatService`, `WhisperService`, `OcrService`, `ExpensesService`, `IncomesService`, `CategoriesService`, `SubscriptionsService`). Uses the Slack Web API via `@slack/web-api`.

## Entry points
- `apps/api/src/modules/slack/slack.module.ts` — module registration
- `apps/api/src/modules/slack/slack.controller.ts` — `POST /slack/events` and `POST /slack/interactivity` (both excluded from `/api/v1` prefix in `main.ts`)
- `apps/api/src/modules/slack/handlers/` — `ChatHandler`, `VoiceHandler`, `PhotoHandler`, `CommandHandler`, `ExpenseHandler`, `IncomeHandler`, `CategoryHandler`
- `apps/api/src/modules/slack/helpers/i18n.ts` — system-message localisation (8 languages)
- `apps/api/src/modules/slack/helpers/verify-signature.ts` — `v0=` HMAC-SHA256 signature verification
- `apps/mobile/app/settings/bots.tsx` — "Slack" section with 6-char link code + status + unlink

## Key concepts
- **Webhook-only** — Slack pushes Events API payloads to `POST /slack/events` and Block Kit button interactions to `POST /slack/interactivity`. No long-polling. Returns `200` immediately to avoid Slack retries (`X-Slack-Retry-Num` header checked for idempotency).
- **HMAC-SHA256 signature verification** — `verifySignature` helper verifies the `X-Slack-Signature` header against `v0:{X-Slack-Request-Timestamp}:{rawBody}` keyed by `SLACK_SIGNING_SECRET`, with a 5-minute replay window. `main.ts` registers `express.urlencoded({ verify })` alongside the JSON body parser so that `rawBody` is captured on the urlencoded interactivity endpoint.
- **SSRF hardening** — file downloads for voice messages and photo receipts are fetched from `files.slack.com` over https only; HTTP redirects are refused.
- **Redis-backed state** — TTL keys:
  - `slack:msg:{event_id}` — idempotency, 24h (guards against Slack automatic retries)
  - `slack:pa:{shortId}` — pending AI actions, 1800s
  - `slack:receipt:{shortId}` + `slack:awaiting_date:{slackUserId}` — receipt-scan date-change flow
  - `slack:cat:{shortId}` — category-name passthrough
- **Callback IDs** use a single `:` separator (`ca:`, `ra:`, `account:`, `cat_e:`, `cat_i:`, `cat_d:`, `receipt_*:`), parsed on the first `:`. This differs from the WhatsApp `--` separator, which was chosen to avoid UUID collision — Slack callback IDs are not UUIDs.
- **Interactive elements** via `@slack/web-api` `WebClient.chat.postMessage` with Block Kit `actions` blocks (buttons). No `sendList` equivalent — pickers use buttons instead. Account lists are capped at 23 items; category lists at 20, with overflow text when more exist.
- **Bot user loop guard** — `auth.test` is called on module init to obtain the bot's own user id; incoming events from that user id are silently ignored to prevent the bot from replying to itself.
- **Account linking** — mobile screen shows a 6-char hex code the user sends to the bot as `link <code>`. `CommandHandler.handleLink` is the only command accepted from unlinked Slack users. Link data is stored in `SlackLink` and `SlackLinkCode` tables (migration `20260604103259_add_slack_links`). Link endpoints live on `UsersController` (`POST/GET/DELETE /users/me/slack-link[-code]`).
- **Expense source** — bot-created expenses carry `source: 'slack'`. `ExpenseSource` in `packages/shared-types/src/entities/primitives.ts` includes `'telegram' | 'whatsapp' | 'slack'` as the bot-channel values.

## Multi-workspace install (OAuth)

Implemented in ABA-200. Enables any Slack workspace to install the bot via the standard OAuth 2.0 flow instead of requiring a manual `SLACK_BOT_TOKEN` per deployment.

### Endpoints

Both routes are excluded from the `/api/v1` prefix in `main.ts` (alongside `/slack/events` and `/slack/interactivity`). No JWT auth — these are browser-facing OAuth redirect endpoints.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/slack/install` | Issues a single-use CSRF state token → 302 to Slack's `oauth/v2/authorize` |
| `GET` | `/slack/oauth/callback` | Validates+consumes state → exchanges `code` for tokens → upserts `SlackInstallation` |

#### `/slack/install` flow
1. Generates a random CSRF `state` value, stores it in Redis under `slack:oauth_state:{state}` with TTL 600 s (single-use).
2. Redirects the browser to `https://slack.com/oauth/v2/authorize` with scopes `chat:write,im:history,im:read,im:write,files:read`, `client_id`, `redirect_uri`, and `state`.

#### `/slack/oauth/callback` flow
1. Reads `code` and `state` from query params. Validates the `state` against Redis (`GET` + `DEL` in one round-trip — consume-on-read). Returns 400 if missing or expired.
2. Calls Slack's `oauth.v2.access` with `code`, `client_id`, `client_secret`, `redirect_uri`.
3. Upserts a `SlackInstallation` row for the `teamId` returned by Slack (create or update existing workspace installation).
4. Returns an HTML success page (rendered by `oauth-pages.ts`; team name is HTML-escaped to prevent XSS).

### `SlackInstallation` table

Migration `20260604230924_add_slack_installations`. Fields:
- `id` — primary key
- `teamId` — Slack workspace/team ID (`T...`); unique per installation
- `teamName` — human-readable workspace name (for display)
- `accessToken` — bot token (`xoxb-...`) **AES-256-GCM encrypted at rest** using `SLACK_TOKEN_ENC_KEY`; stored as a base64 ciphertext in the DB; decrypted in memory only when building a `WebClient`
- `botUserId` — the bot's Slack user ID within that workspace (used for loop-guard)
- `scopes` — comma-separated granted scopes
- `createdAt`, `updatedAt`

### Token-at-rest encryption

`helpers/token-crypto.ts` provides `encryptToken(plain, key)` and `decryptToken(cipher, key)` using Node's `crypto` module with AES-256-GCM. Each encryption call generates a fresh random IV; the stored value is `iv:authTag:ciphertext` (all hex). The `SLACK_TOKEN_ENC_KEY` must be exactly 32 bytes (64 hex chars); generate with `openssl rand -hex 32`. Rotating the key requires decrypting and re-encrypting all `SlackInstallation.accessToken` rows.

### Per-team token resolution

`SlackClientService` now resolves the bot token **per `teamId`**:
1. Looks up `SlackInstallation` by `teamId` → decrypts `accessToken`.
2. Falls back to the `SLACK_BOT_TOKEN` environment variable for the original (pre-OAuth) workspace.
3. Caches the resulting `WebClient` instance in memory keyed by the raw token (avoids constructing a new client on every request).

Every outbound method on `SlackClientService` takes `teamId` as its **first parameter**. The loop-guard `getBotUserId(teamId)` is also per-team (looks up `botUserId` from the installation row or falls back to `SLACK_BOT_USER` env).

### New env vars

| Var | Description |
|---|---|
| `SLACK_CLIENT_ID` | OAuth app Client ID — from App Settings → Basic Information |
| `SLACK_CLIENT_SECRET` | OAuth app Client Secret — same page; server-side only, never exposed to clients |
| `SLACK_OAUTH_REDIRECT_URL` | Must match exactly what is registered in Slack under OAuth & Permissions → Redirect URLs. Prod: `https://api.ai-budget.pl/slack/oauth/callback` |
| `SLACK_TOKEN_ENC_KEY` | 32-byte (64 hex chars) AES-256-GCM encryption key for bot tokens at rest. Generate: `openssl rand -hex 32` |

### Slack App dashboard runbook (OAuth setup)

1. **Register the Redirect URL** — in the Slack App dashboard go to **OAuth & Permissions → Redirect URLs** and add `https://api.ai-budget.pl/slack/oauth/callback`. Save. Without this, Slack will reject the `oauth.v2.access` exchange with `invalid_redirect_uri`.
2. **Activate Public Distribution** — go to **Manage Distribution → Share Your App with Other Workspaces** and click **Activate Public Distribution**. Required to allow workspaces other than your development workspace to install the app. Slack will ask you to confirm the security checklist.
3. **Copy credentials** — after activation, copy `Client ID` and `Client Secret` from **Basic Information** into `.env.production` as `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET`.
4. **Generate the encryption key** — run `openssl rand -hex 32` on the server and add the output as `SLACK_TOKEN_ENC_KEY` in `.env.production`.
5. **Force-recreate the API container** to pick up new env vars (a plain `docker restart` does NOT reload `env_file`):
   ```bash
   cd /opt/ai-budget && \
     docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate api
   ```
6. **Verify** — open `https://api.ai-budget.pl/slack/install` in a browser. You should be redirected to Slack's OAuth consent screen. After approving, the callback should show an HTML success page and a `SlackInstallation` row should appear in the DB.

### Mobile "Add to Slack" button

`app/settings/bots.tsx` shows an "Add to Slack" button in the Slack section that opens `<API_ORIGIN>/slack/install` in the system browser (via `Linking.openURL`). i18n keys: `slackBot.addToSlack` (button label) and `slackBot.addToSlackHint` (subtitle explaining the flow) — all 8 locales.

## Required env vars
- `SLACK_BOT_TOKEN` — Bot User OAuth Token (`xoxb-...`), scope `chat:write` + `files:read`
- `SLACK_SIGNING_SECRET` — from App Settings → Basic Information → App Credentials (HMAC key for inbound signature)
- `SLACK_APP_ID` — App ID (used for display / logging)
- `SLACK_BOT_USER` — Bot's Slack user ID (`U...`); obtained via `auth.test` and used for loop guard
- `SLACK_CLIENT_ID` — OAuth app Client ID; required for multi-workspace install
- `SLACK_CLIENT_SECRET` — OAuth app Client Secret; server-side only
- `SLACK_OAUTH_REDIRECT_URL` — OAuth redirect URL registered in the Slack App dashboard
- `SLACK_TOKEN_ENC_KEY` — 32-byte hex AES-256-GCM key for encrypting bot tokens at rest

Bot is a no-op when core env vars are unset. Multi-workspace OAuth is inactive when `SLACK_CLIENT_ID`/`SLACK_CLIENT_SECRET`/`SLACK_TOKEN_ENC_KEY` are unset.

## Slack App setup runbook

Non-obvious gotchas, in order:

1. **Create a Slack App** at `api.slack.com/apps` — choose "From scratch", not a manifest. Set the workspace.
2. **Bot Token Scopes** (OAuth & Permissions → Scopes → Bot Token Scopes):
   - `chat:write` — send messages
   - `files:read` — download voice/photo files
   - `im:history` — read DMs (required for Events API)
3. **Enable Events API** (Event Subscriptions → Enable Events):
   - Request URL: `https://api.ai-budget.pl/slack/events`
   - Slack will send a `url_verification` challenge — the controller must respond with `{ challenge }` immediately.
   - Subscribe to **`message.im`** bot event — without this, no DMs arrive.
4. **Enable Interactivity** (Interactivity & Shortcuts → Interactivity):
   - Request URL: `https://api.ai-budget.pl/slack/interactivity`
5. **Install the app** to the workspace (OAuth & Permissions → Install App). Copy the `xoxb-...` Bot User OAuth Token to `SLACK_BOT_TOKEN`.
6. **App Credentials** — copy the Signing Secret from Basic Information to `SLACK_SIGNING_SECRET`.
7. **Bot user ID** — obtained automatically via `auth.test` on module init; set `SLACK_BOT_USER` to the returned `user_id` to bootstrap the loop guard before the first request.

## Production env propagation
Adding/changing Slack env vars on prod: `docker restart` does NOT reload `env_file`. Use:
```bash
cd /opt/ai-budget && \
  docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate api
```
Verify env names inside container without exposing values: `docker exec budget-api-prod env | grep '^SLACK_' | cut -d= -f1`.

## Cross-references
- Mirrors [`telegram-bot`](telegram-bot.md) and [`whatsapp-bot`](whatsapp-bot.md) — same handlers, same shared services, same i18n contract
- Calls [`ai-features`](ai-features.md) — `ChatHandler` and `VoiceHandler` go through the same `ChatService` / `WhisperService`
- Webhook signature pattern follows the Stripe/WhatsApp wiring in `main.ts` — `rawBody` capture for HMAC verification

## Where to look first
Webhook handler → `slack.controller.ts`. Outbound message construction → `SlackClientService`. Localised replies → `helpers/i18n.ts`. Signature verification → `helpers/verify-signature.ts`. Mobile linking UX → `apps/mobile/app/settings/bots.tsx`.
