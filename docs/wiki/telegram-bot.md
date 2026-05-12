# Telegram Bot

## What this is
A Telegraf-based Telegram bot embedded in the NestJS API (`modules/telegram/`) that lets users interact with their budget via text, voice, and photos — all authenticated against their app account.

## Entry points
- `apps/api/src/modules/telegram/telegram.module.ts` — registers the bot and all handlers
- `apps/api/src/modules/telegram/` — handler files: `ChatHandler`, `VoiceHandler`, `PhotoHandler`, `CommandHandler`, `ExpenseHandler`, `IncomeHandler`, `CategoryHandler`
- `apps/api/src/modules/telegram/helpers/i18n.ts` — system message localisation (8 languages, resolved from `user.language`)

## Key concepts
- **7 handlers** — `ChatHandler` (AI chat, 1.0 credit/msg), `VoiceHandler` (Whisper transcription + chat, 2.0 credits), `PhotoHandler` (OCR receipt scan, 2.0 credits), `CommandHandler` (`/start`, `/link`, `/help`, `/usage`, `/account`, `/newchat`, `/unlink`), `ExpenseHandler`, `IncomeHandler`, `CategoryHandler`
- **Account linking** — users link their Telegram account to the app via `/link`; subsequent messages are scoped to that account
- **AI usage tracking** — each AI-powered interaction consumes credits; the bot enforces limits and sends a localised warning when the limit is reached
- **i18n** — all bot messages are localised using `helpers/i18n.ts` based on `user.language`; the same 8 locales as the mobile app
- **Credentials** — `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are used both for the bot and for ops alerts (uptime CI sends downtime notifications to the configured chat)

## Cross-references
- Talks to: `ai-features` — `ChatHandler` and `VoiceHandler` call the AI services directly
- Talks to: Telegram Bot API via Telegraf
- Shares: AI usage limits with the mobile `ai-features` module

## Where to look first
Bot message handling → `apps/api/src/modules/telegram/` handler files. Localisation issues → `helpers/i18n.ts`. Ops alert wiring → `.github/workflows/uptime-check.yml`.
