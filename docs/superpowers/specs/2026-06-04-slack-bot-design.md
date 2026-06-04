# Slack Bot — Design Spec

**Date:** 2026-06-04
**Status:** Approved (design), pending implementation plan
**Scope:** Add a Slack bot as a third messaging integration, alongside the existing Telegram and WhatsApp bots.

## Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Interaction model | **Personal DM 1:1** | Closest to the current WhatsApp/Telegram model; one Slack user ↔ one app user. Minimal new concepts. |
| Feature scope | **Full parity** | AI chat, voice (Whisper), photo receipts (OCR), `expense`/`income`/`category` commands, confirm/reject. |
| Linking | **6-char code + `link` in DM** | Mirrors Telegram/WhatsApp; new `SlackLink` + `slack_link_codes` tables. No OAuth identity flow. |
| Architecture | **Standalone module, mirrors WhatsApp** (Approach A) | Matches the repo convention of parallel bot modules; zero changes to working Telegram/WhatsApp code; localized diff, low risk. |
| Transport library | **Raw Slack Events API + `@slack/web-api`** (no Bolt) | Bolt bundles its own HTTP server/router and fights NestJS controllers. We avoid long-polling/Socket Mode in prod (nginx → webhook). |

Rejected: Approach B (extract shared `bot-core` and refactor Telegram+WhatsApp first) — large refactor of working prod bots for one new feature, high regression risk. Approach C (Bolt + Socket Mode) — extra persistent WS connection, duplicates Nest routing.

## 1. Module structure — `apps/api/src/modules/slack/`

`@Global()` module. Imports `AiModule, ExpensesModule, IncomesModule, CategoriesModule, SubscriptionsModule`. Mirrors `modules/whatsapp/`.

```
slack/
  slack.module.ts
  slack-bot.controller.ts        // POST /slack/events, POST /slack/interactivity
  slack-bot.service.ts           // handleEvent() → dispatch(); mirror of whatsapp-bot.service
  slack-client.service.ts        // chat.postMessage, Block Kit, file download (Web API)
  slack-link.service.ts          // generate/redeem/getLink/... ; mirror of whatsapp-link.service
  handlers/
    chat.handler.ts  command.handler.ts  expense.handler.ts  income.handler.ts
    category.handler.ts  voice.handler.ts  photo.handler.ts
  helpers/
    verify-signature.ts  format-slack.ts  parse-command.ts  download-file.ts  i18n.ts
  types.ts                       // SLACK_REDIS injection token, SlackUserState, Slack event types
```

State lives in **Redis** (like WhatsApp, not in-memory), injected via a `SLACK_REDIS` provider token:
- `slack:msg:{event_id}` — idempotency, 24h TTL (Slack retries with `X-Slack-Retry-Num`)
- `slack:pa:{shortId}` — pending actions (~1800s)
- `slack:receipt:{shortId}`, `slack:awaiting_date:{slackUserId}`, `slack:cat:{shortId}`

## 2. Data model — 2 new tables (Prisma migration)

Mirror of Telegram/WhatsApp link tables.

```prisma
model SlackLink {
  id               String    @id @default(uuid())
  slackUserId      String    @unique @map("slack_user_id")
  slackTeamId      String    @map("slack_team_id")
  slackProfileName String?   @map("slack_profile_name")
  userId           String    @unique @map("user_id")
  defaultAccountId String    @map("default_account_id")
  conversationId   String?   @map("conversation_id")
  isActive         Boolean   @default(true) @map("is_active")
  lastInboundAt    DateTime? @map("last_inbound_at")
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  account Account @relation(fields: [defaultAccountId], references: [id], onDelete: Cascade)

  @@map("slack_links")
}

model SlackLinkCode {
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
  @@map("slack_link_codes")
}
```

Linking maps `slackUserId` ↔ app `userId` (1:1). Replies go to `event.channel` (the IM channel id from the webhook) — no need to store the channel. `slackTeamId` is stored for multi-workspace disambiguation and future-proofing.

`User` and `Account` models gain the back-relations (`slackLink SlackLink?`, etc.), matching how Telegram/WhatsApp links are wired.

## 3. Transport & security — the main Slack-specific work

This is where Slack diverges from WhatsApp and carries the real risk.

- **Signature** (`helpers/verify-signature.ts`): compute `v0=` + HMAC-SHA256 over the literal string `v0:{X-Slack-Request-Timestamp}:{rawBody}` keyed by `SLACK_SIGNING_SECRET`. Compare against the `X-Slack-Signature` header with `timingSafeEqual`. **Reject if the timestamp is older than 5 minutes** (replay protection). Never throws — returns `false` on any malformed input. Mirrors the defensive style of the WhatsApp `verifySignature`.
- **URL verification**: on app setup Slack sends `POST { type: 'url_verification', challenge }` (NOT a GET handshake like Meta). After verifying the signature, echo `challenge` back as the body.
- **3-second ACK**: respond `200` immediately, then dispatch fire-and-forget with `.catch()` logging. Slack retries on any non-200 (hence the `slack:msg:{event_id}` idempotency key).
- **Two endpoints**:
  - `POST /slack/events` — Events API, `application/json`. Body shape: `{ type: 'event_callback', event: {...}, team_id, event_id }`.
  - `POST /slack/interactivity` — Block Kit button taps, `application/x-www-form-urlencoded` with the JSON in a `payload` field.
- **`main.ts` integration change** (the one edit outside the new module): `rawBody` is currently captured only for `express.json`. Slack interactivity (and any slash command) is urlencoded, so add `express.urlencoded({ verify })` capturing `req.rawBody` the same way, and parse `req.body.payload`. Add `slack/events` and `slack/interactivity` to the `setGlobalPrefix({ exclude: [...] })` list.
- **Loop guard**: ignore events carrying `bot_id`, `subtype: 'bot_message'`, or where `event.user === <bot user id>` — otherwise the bot answers its own messages.

## 4. Handlers — 7, domain logic reused unchanged

`ChatHandler` (AI chat, usage 1.0/msg), `VoiceHandler` (Whisper, 2.0), `PhotoHandler` (OCR, 2.0), `CommandHandler` (`link`/`help`/`account`/`newchat`/`unlink`/`usage`), `ExpenseHandler`, `IncomeHandler`, `CategoryHandler`. All reuse `ChatService`, `WhisperService`, `OcrService`, `ExpensesService`, `IncomesService`, `CategoriesService`, `SubscriptionsService`.

- **Commands** arrive as DM text (`expense …`, `income …`, `link ABC123`); `parse-command.ts` mirrors WhatsApp. `link CODE` is the only command accepted from an unlinked user.
- **Confirm/reject**: Block Kit `actions` block with buttons whose `action_id`/`value` are `ca:{shortId}` / `ra:{shortId}` (Telegram-style `:` separator — Slack value strings allow it). Taps land on `/slack/interactivity` → `routeCallback(prefix, payload, userState)`.
- **Files**: voice/photo arrive as `event.files[]` with a private `url_private_download`; `download-file.ts` fetches with `Authorization: Bearer SLACK_BOT_TOKEN`. Whisper/OCR services are unchanged.
- **Formatting** (`format-slack.ts`): Slack `mrkdwn` (`*bold*`, `_italic_`, `<url|text>`); confirm cards are Block Kit `section` + `actions`.
- **AI usage limits / viewer-role write blocks**: enforced exactly as in WhatsApp (`SlackUserState` carries `accountRole`; write handlers check before executing).

## 5. Mobile — `app/settings/bots.tsx`

Add a third "Slack" section beside Telegram/WhatsApp: generate-code button → instruction "Open Slack and DM the bot `link ABC123`", link status, unlink. Optional `slack://` deep link to open Slack. Reuses the existing screen layout and link-status patterns. No new store — calls the new user endpoints directly like the WhatsApp section.

## 6. API endpoints — on `UsersController` (mirror whatsapp-link)

- `POST /users/me/slack-link-code` → `{ code, expiresAt, botHandle? }`
- `GET /users/me/slack-link` → link status
- `DELETE /users/me/slack-link` → unlink

`SlackLinkService` mirrors `WhatsAppLinkService`: `generateCode`, `redeemCode`, `getLink`, `getLinkByUserId`, `unlinkBySlackId`, `unlinkByUserId`, `updateDefaultAccount`, `updateConversationId`, `resetConversation`, `updateLastInbound`.

## 7. Config, i18n, tests, docs

- **Env vars** (add to `.env.example`): `SLACK_BOT_TOKEN` (xoxb-), `SLACK_SIGNING_SECRET`, `SLACK_APP_ID` (optional), `SLACK_BOT_USER` (optional, for UX/loop-guard). When unset → module is a no-op (like Telegram without a token).
- **i18n** (`helpers/i18n.ts`): port the WhatsApp key set (~33 keys × 8 languages).
- **Tests**: `verify-signature.spec.ts` (valid signature + timestamp-replay rejection), `parse-command.spec.ts`, `slack-bot.controller.spec.ts` (url_verification challenge echo + bad-signature 401 + retry dedup).
- **Docs**: webhook URL `https://api.ai-budget.pl/slack/events`; update CLAUDE.md (module list → 35 modules, add a Slack bot bullet), `docs/en` + `docs/ru` (API/ARCHITECTURE), and the in-app help bots section.

## Scope / risk

Effort ≈ a mirror of the WhatsApp module (the closest analog). The only nontrivial new work is Slack-specific: the `v0` signature + 5-minute replay window, the POST url_verification challenge, the urlencoded interactivity endpoint, and the `main.ts` rawBody-for-urlencoded change. Telegram and WhatsApp code is untouched.

## Out of scope (YAGNI)

- Team-channel / multi-user thread mode (only DM 1:1).
- OAuth "Sign in with Slack" identity flow.
- Slack App Directory public distribution.
- Slash commands as a separate Request URL (commands are handled as DM text, mirroring WhatsApp).
- Proactive/scheduled push into Slack (debt reminders etc.) — could reuse `conversations.open` later, not in this scope.
