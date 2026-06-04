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

## Required env vars
- `SLACK_BOT_TOKEN` — Bot User OAuth Token (`xoxb-...`), scope `chat:write` + `files:read`
- `SLACK_SIGNING_SECRET` — from App Settings → Basic Information → App Credentials (HMAC key for inbound signature)
- `SLACK_APP_ID` — App ID (used for display / logging)
- `SLACK_BOT_USER` — Bot's Slack user ID (`U...`); obtained via `auth.test` and used for loop guard

Bot is a no-op when these env vars are unset.

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
