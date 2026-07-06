# Split ops notifications onto a separate Telegram bot — Design

**Date:** 2026-07-06
**Status:** Approved
**Scope:** Move all operational Telegram notifications off the user-facing assistant bot (`MiCodeAIBudgetAssistantBot`, `TELEGRAM_BOT_TOKEN`) onto a separate MiCode ops bot (`OPS_TELEGRAM_BOT_TOKEN`) posting to a shared MiCode ops channel (`OPS_TELEGRAM_CHAT_ID`).

## Problem

Today one bot token (`TELEGRAM_BOT_TOKEN`) serves BOTH the user-facing assistant (`TelegramBotService` — expenses, chat, voice, photo) AND every ops notification (`TelegramService.sendMessage`/`sendDocument` → `TELEGRAM_CHAT_ID`, plus 3 GitHub workflows). So registrations, payments, and downtime alerts land in the same bot that end users talk to. The assistant bot must carry only app work; ops must go to a separate bot/channel that can also aggregate other MiCode projects.

## What moves (all 8, confirmed)

| # | Event | Sender |
|---|---|---|
| 1 | New user registered | `TelegramService.notifyNewUser` (auth.service, register + Google) |
| 2 | New subscription/payment | `TelegramService.notifyNewSubscription` (subscriptions.service) |
| 3 | New referral | `TelegramService.sendMessage` (referrals.service) |
| 4 | Referral qualified | `TelegramService.sendMessage` (referrals.service) |
| 5 | Request-a-bank + sample file | `TelegramService.sendMessage`/`sendDocument` (import-bank.service) |
| 6 | Prod down (uptime) | `uptime-check.yml` |
| 7 | DB backup failed | `backup-db.yml` |
| 8 | Infra warning (disk/container) | `infra-watch.yml` |

Items 1–5 all funnel through `TelegramService.sendMessage`/`sendDocument`, so re-pointing that one service covers them. Items 6–8 are workflow curl calls.

## New environment variables

- `OPS_TELEGRAM_BOT_TOKEN` — the MiCode ops bot token (a **different** bot from `TELEGRAM_BOT_TOKEN`).
- `OPS_TELEGRAM_CHAT_ID` — the MiCode ops channel/chat id.
- `OPS_PROJECT_NAME` — **optional** label prefixed to each ops message so a shared channel can tell projects apart (e.g. `AI Budget`). When unset, no prefix is added.

`TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` remain, now used ONLY by the assistant bot (`TelegramBotService`). `TELEGRAM_CHAT_ID` becomes effectively unused by the API (the assistant replies to the sender's own chat, not a fixed chat), but is kept to avoid touching unrelated wiring.

## API change — `TelegramService` (the ops notifier)

- Read `OPS_TELEGRAM_BOT_TOKEN` / `OPS_TELEGRAM_CHAT_ID` (instead of `TELEGRAM_*`). **No fallback**: if either is unset, log a warning and skip (return `false`) — identical to the current unconfigured behavior. This guarantees ops never leaks back to the assistant bot.
- **Optional prefix**: when `OPS_PROJECT_NAME` is set, prepend `<b>[<name>]</b> ` to every `sendMessage` text and every `sendDocument` caption. Messages already use `parse_mode: HTML`, so the bold tag renders. Applied centrally in the two send methods so items 1–5 all inherit it; `notifyNewUser`/`notifyNewSubscription` are unchanged (they call `sendMessage`).
- No method signatures change, so the 4 consumers (auth/subscriptions/referrals/import-bank) and their spec mocks are untouched.
- The class stays named `TelegramService` in `modules/telegram/` (a rename to `OpsNotifierService` is deliberately out of scope to keep churn low); its doc comment is updated to state it is the ops notifier on the ops bot.

## GitHub workflows — items 6–8

`uptime-check.yml`, `backup-db.yml`, `infra-watch.yml`:
- Switch the two `env:` lines from `secrets.TELEGRAM_BOT_TOKEN` / `secrets.TELEGRAM_CHAT_ID` to `secrets.OPS_TELEGRAM_BOT_TOKEN` / `secrets.OPS_TELEGRAM_CHAT_ID`. The internal variable names (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) can stay the same inside the step to minimize the diff; only the `secrets.*` source changes.
- Prepend a static `*[AI Budget]*` prefix to each alert `MESSAGE` (Markdown, matching each workflow's existing parse mode) so the shared channel identifies the project.
- Keep the existing "secret missing → skip" guard.

## Prerequisite (manual, done by the user — NOT code)

1. Create the MiCode ops bot in @BotFather → `OPS_TELEGRAM_BOT_TOKEN`.
2. Create the MiCode ops channel, add the ops bot as an admin, get the channel chat id → `OPS_TELEGRAM_CHAT_ID`.
3. Set both (and optionally `OPS_PROJECT_NAME`) in prod `/opt/ai-budget/.env.production`, then force-recreate the `api` service (env_file is not reloaded by a plain restart).
4. Add `OPS_TELEGRAM_BOT_TOKEN` and `OPS_TELEGRAM_CHAT_ID` as GitHub Actions secrets (for the 3 workflows).

Until these are set, ops notifications simply do not send (by design — no fallback). The assistant bot keeps working throughout.

## Testing

- New `apps/api/src/modules/telegram/telegram.service.spec.ts`:
  - When `OPS_TELEGRAM_BOT_TOKEN`/`OPS_TELEGRAM_CHAT_ID` are unset → `sendMessage` returns `false` and makes no `fetch` call.
  - When set → `sendMessage` POSTs to `https://api.telegram.org/bot<OPS_TOKEN>/sendMessage` with `chat_id = OPS_TELEGRAM_CHAT_ID`.
  - With `OPS_PROJECT_NAME` set → the sent `text` starts with the `<b>[name]</b>` prefix; without it → no prefix.
  - It does NOT read `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` (ops never uses the assistant bot).
- Existing specs mocking `TelegramService` are unaffected (no signature change).

## Docs

- `.env.example`: add the 3 `OPS_*` vars with comments; note `TELEGRAM_*` is now assistant-only.
- `CLAUDE.md`: update the Telegram bot + env notes — ops alerts now go through `OPS_TELEGRAM_BOT_TOKEN` → `OPS_TELEGRAM_CHAT_ID`; assistant on `TELEGRAM_BOT_TOKEN`.
- Note the two new GitHub secrets.

## Out of scope

- Renaming `TelegramService` → `OpsNotifierService`.
- Other MiCode projects' configuration (they set their own `OPS_*` + `OPS_PROJECT_NAME`).
- Any change to the assistant bot (`TelegramBotService`) behavior.

## Follow-up

File a new ABA issue on completion.
