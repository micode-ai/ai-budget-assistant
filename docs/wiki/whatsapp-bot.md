# WhatsApp Bot

*Related: [telegram-bot](telegram-bot.md), [slack-bot](slack-bot.md),
[bot-receipt-editing](features/bot-receipt-editing.md), [voice-digest](features/voice-digest.md)*

## What this is
A NestJS module (`modules/whatsapp/`) embedded in the API that lets users interact with their budget via WhatsApp — text, voice (Whisper), and photo (OCR receipts). Parallel to the Telegram bot, reusing the same shared services (`ChatService`, `WhisperService`, `OcrService`, `ExpensesService`, `IncomesService`, `CategoriesService`, `SubscriptionsService`). Uses Meta's official WhatsApp Business Cloud API.

## Entry points
- `apps/api/src/modules/whatsapp/whatsapp.module.ts` — `@Global()` module
- `apps/api/src/modules/whatsapp/whatsapp-bot.controller.ts` — `GET/POST /whatsapp/webhook` (excluded from the `/api/v1` prefix by `apps/api/src/global-prefix-exclusions.ts`, which `main.ts` passes to `setGlobalPrefix`)
- `apps/api/src/modules/whatsapp/whatsapp-bot.service.ts` — inbound dispatch, the `wa:msg:{id}` idempotency check
- `apps/api/src/modules/whatsapp/whatsapp-client.service.ts` — `WhatsAppClientService`, outbound Graph API calls
- `apps/api/src/modules/whatsapp/whatsapp-link.service.ts` — link codes and the `getLink()` membership join
- `apps/api/src/modules/whatsapp/handlers/` — among them `ChatHandler`, `VoiceHandler`, `PhotoHandler`, `CommandHandler`, `ExpenseHandler`, `IncomeHandler`, `CategoryHandler`, `CategorizeHandler`, `PurchaseRequestHandler`; `ls` the directory for the current set
- `apps/api/src/modules/whatsapp/helpers/i18n.ts` — WhatsApp-specific copy over the shared bot dictionary `common/bot-i18n/shared-messages.ts`, built with `createBotT(..., { markup: 'markdown' })`, which converts the canonical HTML tags to WhatsApp markdown at read time (9 languages)
- `apps/mobile/app/settings/bots.tsx` — QR code + 6-hex link code + deep-link to `wa.me`

## Key concepts
- **Webhook-only** — Meta pushes events to `POST /whatsapp/webhook`. No long-polling. Returns `200` immediately to avoid Meta retries.
- **HMAC-SHA256 signature verification** — `verifySignature` helper uses the globally-available `req.rawBody` (Stripe pattern in `main.ts`). Key: `WHATSAPP_APP_SECRET`.
- **Redis-backed state** — every mid-flow state is a TTL key (Telegram now does the same under `telegram:*`):
  - `wa:msg:{id}` — idempotency, 24h
  - `wa:pa:{shortId}` — pending AI actions, 1800s
  - `wa:receipt:{shortId}` + `wa:awaiting_date:{phone}` — receipt-scan date-change flow
  - `wa:cat:{shortId}` — category-name passthrough
  - `wa:dupscan:*` — a receipt held behind the duplicate-receipt warning
  - `wa:awaiting_item_edit:{phone}` — the typed line-item correction cursor ([bot-receipt-editing](features/bot-receipt-editing.md))
  - `wa:catz:{phone}` — the `/categorize` session ([bot-categorize-command](features/bot-categorize-command.md))
  - `wa:vd:{userId}`, `wa:vdmsg:{wamid}` — the weekly voice digest's pending send and message mapping ([voice-digest](features/voice-digest.md))
- **Callback IDs** use `--` separator (UUIDs already contain single `-`)
- **Interactive elements** via `WhatsAppClientService.sendButtons` (max 3 buttons × 20 char labels) and `sendList` (max 10 rows)
- **WhatsApp markdown** — `*bold*`, `_italic_`, `` `code` `` via `markdownToWhatsApp` helper (not HTML like Telegram)
- **Viewer role** — `WhatsAppUserState` carries `accountRole` (joined from `AccountMember` in `getLink()`); write handlers check it before executing.
- **Account linking** — mobile **Chat bots** screen shows QR + `wa.me/{phone}?text=link%20{6-hex}` deep link. `CommandHandler.handleLink` is the only command accepted from unlinked numbers. Link endpoints live on `UsersController` (`POST/GET/DELETE /users/me/whatsapp-link[-code]`).

## Required env vars
- `WHATSAPP_ACCESS_TOKEN` — System User token, scope `whatsapp_business_messaging`
- `WHATSAPP_PHONE_NUMBER_ID` — sender number ID (from API Setup or WhatsApp Manager)
- `WHATSAPP_BUSINESS_ACCOUNT_ID` — WABA ID
- `WHATSAPP_VERIFY_TOKEN` — any random string; must match what Meta sends in verification GET
- `WHATSAPP_APP_SECRET` — App Dashboard → Settings → Basic → App Secret (HMAC key for inbound signature)
- `WHATSAPP_BUSINESS_PHONE_NUMBER` — digits-only (no `+`, no spaces); shown to users as `wa.me/{phone}` deep link
- `WHATSAPP_API_VERSION` — Graph API version, e.g. `v25.0`

## Meta Cloud API setup runbook

Non-obvious gotchas, in order:

1. **App must be a Business-type App** (not Consumer). Set during creation; cannot be changed after.
2. **App must be owned by the Business** (Business Settings → Accounts → Apps). Apps owned by a personal account never get WhatsApp permissions.
3. **System User must be `Admin`** (not `Employee`) and must have **both** assets assigned with Full Control:
   - App (Business Settings → System Users → Add Assets → Apps)
   - WhatsApp Account (Business Settings → System Users → Add Assets → WhatsApp Accounts)
4. **App must be added to WhatsApp use case** (App Dashboard → Use cases → "Other" works) — gives access to the `whatsapp_business_messaging` permission (Standard Access, no App Review).
5. **App Subscription to WABA via Graph API** — the UI does NOT do this automatically. Without it, Meta does not deliver any events to your webhook even if the webhook is verified and `messages` field is subscribed in App Dashboard.

   ```bash
   curl -X POST "https://graph.facebook.com/v25.0/{WABA_ID}/subscribed_apps?access_token={TOKEN}"
   # Verify:
   curl "https://graph.facebook.com/v25.0/{WABA_ID}/subscribed_apps?access_token={TOKEN}"
   # Should return: {"data":[{"whatsapp_business_api_data":{"name":"<your App name>",...}}]}
   ```

6. **Webhook in App Dashboard** (WhatsApp → Configuration):
   - Callback URL: `https://api.ai-budget.pl/whatsapp/webhook`
   - Verify Token: value of `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to **`messages`** field (without this, no inbound)
7. **Test number `+1 555 657 9276`** is sandbox — sends only to whitelisted recipients (max 5, added under API Setup → Step 1). Counts against the WABA's phone-number limit (default 1 for new WABAs).
8. **Production number registration** — registering `+48 ...` (or any real number) in Cloud API **deletes** the personal WhatsApp account on that number. Backup chats first. Number must NOT be in use by WhatsApp/WhatsApp Business before registration.
9. **Business Verification + Display Name approval** are required to enable the production number — both 1-3 day reviews via Business Settings → Security Center and WhatsApp Manager respectively.

## Production env propagation
Adding/changing WhatsApp env vars on prod: `docker restart` does NOT reload `env_file`. Use:
```bash
cd /opt/ai-budget && \
  docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate api
```
Verify env names inside container without exposing values: `docker exec budget-api-prod env | grep '^WHATSAPP_' | cut -d= -f1`.

## Invariants
- **ACK 200 before doing any work.** Meta retries on any non-200 or slow response, and a retry of an already-processed message would book it twice; the controller responds immediately and dispatches async, with `wa:msg:{id}` (`SET … NX`) as the second line of defence.
- **Verify the HMAC over the raw body**, never over re-serialized JSON — `rawBody` is captured globally in `main.ts` for exactly this.
- **Callback ids use `--` as separator.** UUIDs contain single `-`, so a single-dash separator splits an id in half.
- **A new string shared by two or more bots goes in `common/bot-i18n/shared-messages.ts`**, not here.

## Cross-references
- Mirrors [`telegram-bot`](telegram-bot.md) — same handlers, same shared services, same i18n contract
- Calls [`ai-features`](ai-features.md) — `ChatHandler` and `VoiceHandler` go through the same `ChatService` / `WhisperService`
- Webhook signature pattern follows Stripe wiring in `main.ts` — `rawBody` capture for HMAC verification

## Where to look first
Webhook handler → `whatsapp-bot.controller.ts`, dispatch → `whatsapp-bot.service.ts`. Outbound message construction → `WhatsAppClientService`. Localised replies → `helpers/i18n.ts`. Mobile linking UX → `apps/mobile/app/settings/bots.tsx`.
