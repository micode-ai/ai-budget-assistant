# WhatsApp Bot — Design

**Date:** 2026-05-18
**Status:** Draft
**Goal:** Build a WhatsApp bot that mirrors the existing Telegram bot's feature set (chat, voice, OCR, expense/income/category commands, account linking, 8-language i18n) using the official WhatsApp Business Cloud API.

---

## 1. Context

The project already ships a Telegram bot at `apps/api/src/modules/telegram/` (Telegraf-based, 7 handlers, webhook + polling modes). The Telegram bot is **fully reactive** — users initiate every interaction; there are no proactive per-user notifications from the bot itself. The separate `TelegramService` (sibling of the bot) is an internal ops-alerts channel for admins (new user / new subscription), not user-facing.

This design adds a parallel **WhatsApp bot** module with feature parity, reusing all existing services (`ChatService`, `WhisperService`, `OcrService`, `ExpensesService`, `IncomesService`, `CategoriesService`, `SubscriptionsService`).

### Why "Full Telegram parity"

User decision: target users in markets where WhatsApp dominates (LATAM, Spain, India, parts of Europe) need the same Budget Assistant chat experience that Telegram users get today.

### Why "Official WhatsApp Cloud API"

- **No vendor lock-in / no BSP markup** (Twilio/360dialog add ~$0.005/message on top of Meta fees).
- **Cost:** 1000 service conversations/month free, then ~$0.005–0.03 per 24-hour conversation depending on country. Since this is a chat bot (user initiates), conversations are always "service" category — the cheapest.
- **Compliance:** unofficial libraries (`whatsapp-web.js`, Baileys) violate WhatsApp ToS and get phone numbers banned; not viable for production.

### Key WhatsApp Cloud API constraints

| Constraint | Impact on design |
|---|---|
| **24-hour customer service window** — outside it, only pre-approved templates allowed | Chat is user-initiated → always inside window → no templates needed for v1 |
| **No polling** — webhook-only | Use existing HTTPS endpoint at `api.ai-budget.pl` |
| **No bot username** — users message a phone number | Mobile app shows `wa.me/` deep link + QR code |
| **No `/`-command UI** — text is text | Parse first word as potential command keyword |
| **Interactive buttons:** max 3, labels ≤ 20 chars | Confirm/Cancel works; account/category pickers use list messages |
| **List messages:** max 10 rows per section | Account switcher pages if user has > 10 accounts (rare) |
| **No typing indicator in Cloud API** | Optional ACK message "🤔 Thinking…" before long ops |

---

## 2. Architecture

### Module structure

New parallel module `apps/api/src/modules/whatsapp/`, mirroring `telegram/`:

```
apps/api/src/modules/whatsapp/
├── whatsapp.module.ts
├── whatsapp-bot.controller.ts        # GET /whatsapp/webhook (verify) + POST (events)
├── whatsapp-bot.service.ts           # OnModuleInit registers handlers; dispatches by message type
├── whatsapp-client.service.ts        # Thin Graph API wrapper: sendText/sendButtons/sendList/downloadMedia
├── whatsapp-link.service.ts          # Mirror of TelegramLinkService — WhatsAppLink/WhatsAppLinkCode CRUD
├── handlers/
│   ├── command.handler.ts            # help, link, unlink, account, newchat, usage
│   ├── chat.handler.ts               # Free-form text → ChatService
│   ├── voice.handler.ts              # Voice note → WhisperService → ChatHandler
│   ├── photo.handler.ts              # Image → OcrService → expense
│   ├── expense.handler.ts            # "expense 50 lunch" / "/expense 50 lunch"
│   ├── income.handler.ts             # "income 3000 salary"
│   └── category.handler.ts           # Create/list/delete categories
├── helpers/
│   ├── i18n.ts                       # Copied from telegram/, HTML tags stripped → WA markdown
│   ├── format-whatsapp.ts            # markdown → *bold* _italic_ ```code```
│   ├── parse-amount.ts               # Copied as-is
│   ├── resolve-account.ts            # Copied as-is
│   ├── parse-command.ts              # Recognize command keywords with/without leading '/'
│   └── download-media.ts             # 2-step Graph API media download
└── types.ts                          # WhatsAppMessage, WhatsAppUserState
```

**No abstraction layer over Telegram + WhatsApp.** Reasoning:
- Telegram bot is in prod and stable — refactoring it carries risk for no immediate benefit
- Business logic already lives in shared services (Chat/Expenses/etc.); only framework-specific dispatch/format code duplicates (~600–800 LOC), which is acceptable
- If a third channel is added later, then extract a `BotEngine` abstraction with hindsight from two implementations

### Dependencies

- **No new npm package** — use `fetch` directly against `https://graph.facebook.com/v21.0/`. Considered `whatsapp-cloud-api-node`, but rejected: thin enough to write inline, avoids a dependency on an unmaintained wrapper.
- All existing services injected via DI (same as `TelegramBotService` constructor pattern).

---

## 3. Data model (Prisma)

Two new models in `apps/api/prisma/schema.prisma`, mirroring `TelegramLink` / `TelegramLinkCode`:

```prisma
model WhatsAppLink {
  id               String   @id @default(uuid())
  waPhoneNumber    String   @unique @map("wa_phone_number")    // E.164 ("+34612345678")
  waProfileName    String?  @map("wa_profile_name")
  userId           String   @unique @map("user_id")
  defaultAccountId String   @map("default_account_id")
  conversationId   String?  @map("conversation_id")
  isActive         Boolean  @default(true) @map("is_active")
  lastInboundAt    DateTime? @map("last_inbound_at")
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  account Account @relation(fields: [defaultAccountId], references: [id], onDelete: Cascade)

  @@map("whatsapp_links")
}

model WhatsAppLinkCode {
  id        String    @id @default(uuid())
  userId    String    @map("user_id")
  accountId String    @map("account_id")
  code      String    @unique
  expiresAt DateTime  @map("expires_at")
  usedAt    DateTime? @map("used_at")
  createdAt DateTime  @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([code])
  @@index([userId])
  @@map("whatsapp_link_codes")
}
```

**Why separate tables (not unified `BotLink` with `channel` discriminator):**
- `TelegramLink` already migrated in prod — no churn
- WhatsApp-only fields (`waProfileName`, `lastInboundAt`); Telegram-only fields (`telegramUsername`)
- A user may link both channels independently → two separate rows, not one unified

### Pending action state — Redis (new)

The Telegram bot stores `pendingActions: Map<shortId, {conversationId, actionId}>` **in memory** (`chat.handler.ts:15`). For WhatsApp, we use **Redis** from day one:

- `wa:pa:{shortId}` → `{conversationId, actionId}`, TTL 1800s (30 min)
- `wa:receipt:{shortId}` → `{userId, accountId, scannedData}`, TTL 1800s
- `wa:awaiting_date:{waPhoneNumber}` → `receiptShortId`, TTL 600s (date-input mode after "Change date" tap)

Redis is already in the stack (`budget-redis-prod`). Migrating Telegram bot to Redis is **out of scope** — separate follow-up task to unify state.

### Migration

```bash
# From apps/api/
npx prisma migrate dev --name add_whatsapp_link
npx prisma generate
```

---

## 4. Account linking flow

WhatsApp has no `@username` → user must know the bot's phone number. Flow:

### Mobile app side (new screen `apps/mobile/app/settings/whatsapp.tsx`)

1. User opens **Settings → WhatsApp Bot → "Connect WhatsApp"**
2. App calls `POST /whatsapp/generate-link-code` → backend returns `{ code: "A3K9F2", expiresAt, waPhoneNumber: "+34612345678" }`
3. Screen displays:
   - **QR code** rendered client-side from `https://wa.me/{phone}?text=link%20{code}` (use `react-native-qrcode-svg` — verify availability at impl time; if missing, install)
   - **Primary button: "Open WhatsApp"** → opens the same `wa.me` URL → WhatsApp launches with `link A3K9F2` pre-filled in the message field
   - **"Copy code"** secondary button
4. User taps **send** in WhatsApp → bot receives webhook → `parseCommand` matches `^link\s+([A-F0-9]{6})$` (case-insensitive) → `WhatsAppLinkService.redeemCode()` → upsert `WhatsAppLink` → reply with `linkSuccess` i18n string in user's language

### Backend endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/whatsapp/generate-link-code` | JwtAuthGuard + AccountContextGuard | Mirror of Telegram's link-code endpoint |
| `DELETE` | `/whatsapp/link` | JwtAuthGuard | Unlink current user's WhatsApp |
| `GET` | `/whatsapp/link` | JwtAuthGuard | Returns `{linked: boolean, waPhoneNumber?, waProfileName?}` for the settings screen |
| `GET` | `/whatsapp/webhook` | none | Meta verify-token handshake |
| `POST` | `/whatsapp/webhook` | none (Meta signature header verified) | Inbound events |

### Webhook security

WhatsApp Cloud API signs every POST with `X-Hub-Signature-256: sha256=<HMAC-SHA256 of raw body using App Secret>`. We **must** verify this on inbound to prevent spoofing. Implementation: use a raw-body parser for the `/whatsapp/webhook` route and compare HMAC against `WHATSAPP_APP_SECRET` env var. Reject with 401 on mismatch.

---

## 5. Command parsing and UI mapping

### Text command parsing

`helpers/parse-command.ts` recognizes commands with or without leading `/`:

```ts
const COMMANDS = ['expense', 'income', 'help', 'unlink', 'account', 'menu', 'newchat', 'usage', 'category', 'categories', 'link'];

export function parseCommand(text: string): { command: string; args: string } | null {
  const trimmed = text.trim();
  const stripped = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
  const firstWord = stripped.split(/\s+/)[0].toLowerCase();

  if (COMMANDS.includes(firstWord)) {
    return { command: firstWord, args: stripped.slice(firstWord.length).trim() };
  }
  // Implicit expense: first token is a number → "50 lunch" → expense
  if (/^\d+([.,]\d+)?/.test(firstWord)) {
    return { command: 'expense', args: stripped };
  }
  return null;
}
```

Result handed to `whatsapp-bot.service` dispatcher; if `null`, message falls through to `ChatHandler` (AI).

### Interactive UI mapping

| Telegram element | WhatsApp equivalent | Notes |
|---|---|---|
| `inline_keyboard` with 2 buttons (Confirm/Cancel) | `interactive: { type: 'button', action: { buttons: [...] } }` | Max 3 buttons, labels ≤ 20 chars |
| `inline_keyboard` with N accounts | `interactive: { type: 'list', action: { sections: [{ rows: [...] }] } }` | Max 10 rows. > 10 accounts → paginate via "Next page" row |
| Category type picker (Expense/Income) | Button (2 options) | Trivial |
| Receipt actions (Add/Change date/Cancel) | Button (3 options) | Fits exactly |

**Callback IDs:** WhatsApp interactive button `reply.id` accepts only `[A-Za-z0-9_-]{1,256}`. Telegram's `:` separators become `_`: `ca:abc` → `ca_abc`. Dispatcher parses on the underscore.

### Text formatting

Existing `markdownToTelegramHtml` returns HTML (`<b>`, `<code>`). For WhatsApp, write `markdownToWhatsAppText`:
- `**bold**` → `*bold*`
- `*italic*` → `_italic_`
- `` `code` `` → `` `code` ``
- ` ```block``` ` → ` ```block``` `
- `<br>` → `\n`

i18n strings are copied from `telegram/helpers/i18n.ts` and adapted:
- `<b>` → `*`, `</b>` → `*`
- `<code>` → `` ` ``, `</code>` → `` ` ``
- `<br>` → `\n`

---

## 6. Media handling

### Voice (audio)

WhatsApp audio: `mime: audio/ogg; codecs=opus` — same container as Telegram voice → Whisper accepts directly.

```ts
// voice.handler.ts
const buffer = await downloadMedia(msg.audio.id);
const transcript = await this.whisperService.transcribe(buffer, 'ogg');
// Track 2.0 AI units
await this.subscriptionsService.trackAiUsage(userId, 'voice', 2.0, accountId);
// Dispatch transcript through ChatHandler
await this.chatHandler.processMessage(ctx, transcript);
```

### Photo / receipt

Same flow as Telegram's `photo.handler.ts`:
1. Download image → `OcrService.scanReceipt(buffer)` → `{ amount, date, categoryGuess, items }`
2. Track 2.0 AI units
3. Store scanned data in Redis (`wa:receipt:{shortId}`, TTL 30 min)
4. Reply with `receiptScanned` i18n string + 3 buttons: **Add** (`receipt_add_{shortId}`), **Change date** (`receipt_date_{shortId}`), **Cancel** (`receipt_cancel_{shortId}`)
5. On **Change date** tap: store `wa:awaiting_date:{waPhone}` = `shortId` (TTL 10 min) and prompt with `sendDate` i18n string
6. Next text message: chat handler first checks `awaiting_date` — if present, parse `DD.MM.YYYY`, update receipt data, prompt again with Add/Cancel

### Media download helper

```ts
// helpers/download-media.ts
export async function downloadMedia(mediaId: string, token: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) throw new Error(`Media meta fetch failed: ${metaRes.status}`);
  const meta = await metaRes.json(); // { url, mime_type, sha256, file_size }

  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!fileRes.ok) throw new Error(`Media file fetch failed: ${fileRes.status}`);
  const bytes = await fileRes.arrayBuffer();

  return { buffer: Buffer.from(bytes), mimeType: meta.mime_type };
}
```

---

## 7. Environment and deployment

### Env vars (new)

```
# .env.example + .env.production
WHATSAPP_ACCESS_TOKEN=          # System User long-lived token
WHATSAPP_PHONE_NUMBER_ID=       # From Meta dashboard
WHATSAPP_BUSINESS_ACCOUNT_ID=   # WABA ID
WHATSAPP_VERIFY_TOKEN=          # Arbitrary string, set in Meta webhook config
WHATSAPP_APP_SECRET=            # Meta App Secret — used for HMAC verification on POST
WHATSAPP_BUSINESS_PHONE_NUMBER= # E.164 displayed in mobile app (wa.me deep link)
WHATSAPP_API_VERSION=v21.0      # Graph API version pinned explicitly
```

### Operational pre-deploy checklist

1. Create Meta Business Manager + Facebook Business Account
2. Add a WhatsApp Business Account (WABA)
3. Register a phone number (real number, not currently used in consumer WhatsApp App). For dev/staging, use Meta's **5 free test numbers** per WABA — no verification, 1000 conversations/month
4. Business verification in Meta (5–10 business days; only needed for production volume)
5. Create a System User → issue long-lived token with `whatsapp_business_messaging` + `whatsapp_business_management` scopes
6. Configure webhook: `https://api.ai-budget.pl/api/v1/whatsapp/webhook` + verify token. Subscribe to field `messages`
7. Submit display name for approval (visible to users in chat header)

### Deployment

- No new services in `docker-compose.prod.yml` — module runs inside existing `budget-api-prod`
- Add env vars to `.env.production`, then `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate api` (per CLAUDE.md: `docker restart` does not reload `env_file`)
- Nginx already proxies `/api/v1/*` → endpoint live automatically

### Observability

- Webhook routes log via existing Nest Logger → captured in container logs
- `@sentry/node` already instrumented → unhandled exceptions auto-captured
- No new metrics in v1; add counters in v2 if needed

---

## 8. Mobile changes

| File | Change |
|---|---|
| `apps/mobile/app/settings/whatsapp.tsx` (new) | Screen with QR code + "Open WhatsApp" deep link + status display. Mirror structure of existing telegram settings screen |
| `apps/mobile/app/settings/index.tsx` | Add "WhatsApp Bot" row below "Telegram Bot" |
| `apps/mobile/src/services/api.ts` | Add `generateWhatsAppLinkCode()`, `getWhatsAppLinkStatus()`, `unlinkWhatsApp()` |
| `apps/mobile/src/i18n/locales/*.ts` (× 8) | New keys: `whatsappBot.title`, `whatsappBot.connectButton`, `whatsappBot.disconnectButton`, `whatsappBot.codeInstructions`, `whatsappBot.openButton`, `whatsappBot.copyCode`, `whatsappBot.linkedAs` |

QR code dependency: `react-native-qrcode-svg` — install if missing.

---

## 9. Localization

8 locales (parity with rest of app): en, de, es, fr, pl, ru, ua, be.

`helpers/i18n.ts` in WhatsApp module — copy of Telegram's, with HTML tags substituted for WhatsApp markdown. Same `t(key, lang, params)` signature. Language resolved from linked user's `User.language` (same as Telegram).

---

## 10. v1 scope

In:
- Webhook + verify + HMAC signature check
- Account linking (`link CODE`)
- Chat handler (free text → AI + confirm/cancel buttons)
- Voice handler (Whisper)
- Photo handler (OCR + date-change flow)
- Commands: `help`, `unlink`, `account`, `newchat`, `usage`, `expense`, `income`, `category`, `categories`
- 8-language i18n
- AI usage tracking via `SubscriptionsService`
- Mobile settings screen + 3 API methods
- Prisma migration + Redis state

Out (v2):
- Persistent commands menu via Business Profile API
- Per-user proactive notifications (requires Meta-approved templates)
- Migrate Telegram pending actions to Redis (separate effort)
- Prometheus metrics
- Document/PDF receipts (text-only documents — let v1 handle only image/jpeg/png)

---

## 11. Testing

- **Unit:** mock `whatsapp-client.service`; test `parseCommand`, webhook payload dispatcher, signature verification helper. Fixture payloads from Meta docs.
- **Integration (dev):** ngrok tunnel from dev machine → URL in Meta webhook config → send messages from personal WhatsApp to one of Meta's test numbers. Verify end-to-end roundtrip.
- **No staging env needed** — Meta test numbers cover staging-equivalent traffic.

---

## 12. Risks and open questions

| Risk | Mitigation |
|---|---|
| Meta business verification delays (5–10 days) | Start verification immediately on green-light; dev work can use test numbers in parallel |
| Display name rejection | Submit early; have fallback names ready ("Budget Assistant Bot", "AI Budget Assistant") |
| Conversation cost overrun | v1 is service-category only (free up to 1000/mo); monitor via Meta dashboard. Set hard limit alerts |
| Voice/OCR cost (2.0 AI units per request) | Already metered through `SubscriptionsService` — limit applies same as Telegram |
| WhatsApp number gets flagged for spam | Only respond to incoming messages; never broadcast in v1; signature verification keeps webhook honest |

---

## 13. Dependency order

Follows CLAUDE.md guidance:

1. `apps/api/prisma/schema.prisma` — add 2 models, migrate, `prisma generate`
2. `apps/api/src/modules/whatsapp/` — new module (controller, service, client, link service, handlers, helpers)
3. `apps/api/src/app.module.ts` — register `WhatsAppModule`
4. `.env.example` + `.env.production` — new vars
5. `apps/mobile/src/services/api.ts` — 3 new methods
6. `apps/mobile/app/settings/whatsapp.tsx` — new screen
7. `apps/mobile/app/settings/index.tsx` — add row
8. `apps/mobile/src/i18n/locales/*.ts` (× 8) — new keys

---

## 14. Estimated effort

- Backend (Prisma + module + handlers + helpers + tests): **~1.5–2 days**
- Mobile (screen + API + i18n × 8): **~0.5 day**
- Meta business setup (verification + webhook config): **~5–10 calendar days** (mostly waiting on Meta), can run in parallel with dev work using test numbers
- Total dev: **~2–2.5 days**; clock time including Meta approvals: **~1.5–2 weeks**
