# Telegram Bot

*Related: [whatsapp-bot](whatsapp-bot.md), [slack-bot](slack-bot.md),
[bot-receipt-editing](features/bot-receipt-editing.md),
[bot-categorize-command](features/bot-categorize-command.md), [voice-digest](features/voice-digest.md)*

## What this is
A Telegraf-based Telegram bot embedded in the NestJS API (`modules/telegram/`) that lets users interact with their budget via text, voice, photos and documents — all authenticated against their app account. The user-facing assistant bot; operational alerts go to a separate ops bot (see Key concepts).

## Entry points
- `apps/api/src/modules/telegram/telegram.module.ts` — registers the bot and all handlers
- `apps/api/src/modules/telegram/telegram-bot.service.ts` — `TelegramBotService`: launch mode, command and update routing (`bot.command`, `bot.on('callback_query' | 'voice' | 'audio' | 'photo' | 'document' | 'text')`), `verifyWebhookSecret`
- `apps/api/src/modules/telegram/telegram-bot.controller.ts` — `POST /telegram/webhook` (excluded from the `/api/v1` prefix in `apps/api/src/global-prefix-exclusions.ts`)
- `apps/api/src/modules/telegram/handlers/` — one file per handler; `ls` the directory for the current set
- `apps/api/src/modules/telegram/telegram-link.service.ts` + `UsersController` (`POST /users/me/telegram-link-code`, `GET/DELETE /users/me/telegram-link`) — account linking
- `apps/api/src/modules/telegram/helpers/i18n.ts` — Telegram-specific copy over the shared bot dictionary `common/bot-i18n/shared-messages.ts` (9 languages, resolved from `user.language`)
- `apps/api/src/modules/telegram/telegram.service.ts` — `TelegramService`, the **ops** notifier (not the assistant bot)

## Key concepts
- **Handlers** — among them `ChatHandler` (AI chat), `VoiceHandler` (Whisper transcription, then forwards the text to `ChatHandler.processMessage`), `PhotoHandler` (OCR receipt scan, photos and documents), `CommandHandler` (`/start`, `/link`, `/help`, `/usage`, `/account`, `/newchat`, `/unlink`, `/digest`), `ExpenseHandler` (`/expense`), `IncomeHandler` (`/income`), `CategoryHandler` (`/category`, `/categories`), `CategorizeHandler` (`/categorize`), `PurchaseRequestHandler`.
- **Webhook or long-polling** — with `TELEGRAM_WEBHOOK_URL` set, the bot registers `<url>/telegram/webhook` with `TELEGRAM_WEBHOOK_SECRET` as Telegram's `secret_token`, and the controller checks it; without it the bot long-polls (dev).
- **Account linking** — the app issues a link code; `/link <code>` binds the Telegram user to the app user, and subsequent messages are scoped to the linked account (`/account` switches it). Viewer role is carried on the user state and write handlers check it.
- **AI usage tracking** — through `SubscriptionsService.trackAiUsage`: chat 1.0 per message, voice 1.0 for the transcription plus 1.0 for the forwarded chat, OCR 2.0, a confirm-button press 0.5. On the limit the user gets the localized `aiLimitReached` message.
- **Redis-backed mid-flow state** — every pending flow lives in `CacheService` under `telegram:*` keys with a TTL: `telegram:pa:{shortId}` (pending AI action, 1800 s), `telegram:receipt:{receiptId}` (pending receipt, 1800 s), `telegram:dupscan:{scanId}` (receipt held behind a duplicate warning), `telegram:awaiting_date:{telegramUserId}` and `telegram:awaiting_item_edit:{telegramUserId}` (typed-input cursors, 600 s), `telegram:catz:{telegramUserId}` (categorize session). Mirrors WhatsApp's `wa:*` keys.
- **Short callback ids** — Telegram's `callback_data` is capped at 64 bytes, so a pending action is stored under a short id and only that id rides in the button.
- **Ops bot is separate (ABA-319)** — `TelegramService` reads `OPS_TELEGRAM_BOT_TOKEN`/`OPS_TELEGRAM_CHAT_ID` for registration, subscription, referral and request-a-bank alerts; the assistant bot's `TELEGRAM_BOT_TOKEN` never carries them, and `TELEGRAM_CHAT_ID` is legacy/unused by the API. With `OPS_*` unset, ops alerts are skipped — never leaked to the assistant bot.

## Invariants
- **No module-level `Map` for mid-flow state.** It was wiped on every deploy restart, orphaning any in-flight confirmation or receipt scan (tech-debt `telegram-handlers-in-memory-state`, closed). New flow state goes into `CacheService` with a TTL.
- **Write a mutated cached object back.** With a `Map`, `handleDateInput` mutating the pending receipt's `date` persisted for free by reference; a Redis read is a fresh deserialized copy, so the handler must `cache.set` it again or the edit silently reverts on the next read. The same applies to every handler that edits a cached object.
- **A new string shared by two or more bots goes in `common/bot-i18n/shared-messages.ts`**, not into this bot's `helpers/i18n.ts`.

- **The webhook always carries a secret.** In webhook mode the bot registers `TELEGRAM_WEBHOOK_SECRET`, or a random per-process secret when it is unset, as Telegram's `secret_token`; `verifyWebhookSecret` compares it timing-safely and rejects everything in long-polling mode, where Telegram never calls the endpoint. Before ABA-626 an unset secret made the public webhook accept forged updates.

## Cross-references
- Talks to: `ai-features` — `ChatHandler` and `VoiceHandler` call `ChatService` / `WhisperService` directly
- Talks to: Telegram Bot API via Telegraf
- Shares: AI usage limits with the mobile `ai-features` module

## Where to look first
Bot message handling → `apps/api/src/modules/telegram/` handler files. Localisation issues → `helpers/i18n.ts` and `common/bot-i18n/shared-messages.ts`. Ops alerts → `telegram.service.ts` and `.github/workflows/uptime-check.yml`.

## History
ABA-319 (ops bot split) · ABA-462 (shared bot i18n) · ABA-482 (receipt line-item editing) · tech-debt `telegram-handlers-in-memory-state` (Redis-backed state).
