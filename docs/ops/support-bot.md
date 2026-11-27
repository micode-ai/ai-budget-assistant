# Support bot runbook (contact the developer)

The in-app "Write to the developer" feature forwards user messages to the developer's private
Telegram chat through a **separate** bot. It must never reuse the assistant bot or the ops bot
(`OPS_TELEGRAM_*`). Design and invariants: `docs/wiki/features/contact-developer.md`.

## 1. Create the bot

1. In Telegram open `@BotFather`, send `/newbot`, pick a name and a username.
2. Copy the token into `SUPPORT_TELEGRAM_BOT_TOKEN`.

## 2. Get the developer's private chat id

1. Open the new bot in Telegram and send it `/start`.
2. While no webhook is registered yet, run
   `curl "https://api.telegram.org/bot<TOKEN>/getUpdates"` (it is refused once a webhook is active).
3. Read `result[].message.chat.id` — a positive integer for a private chat. That is
   `SUPPORT_TELEGRAM_CHAT_ID`. The API listens ONLY to this chat.

## 3. Environment variables (`.env.production`)

| Variable | Meaning |
|---|---|
| `SUPPORT_TELEGRAM_BOT_TOKEN` | the support bot token; unset = forwarding is skipped |
| `SUPPORT_TELEGRAM_CHAT_ID` | the developer's private chat id from step 2 |
| `SUPPORT_TELEGRAM_WEBHOOK_URL` | public API base, e.g. `https://api.ai-budget.pl` (no `/api/v1`); the API registers `<url>/support-telegram/webhook` at start |
| `SUPPORT_TELEGRAM_WEBHOOK_SECRET` | Telegram `secret_token` (`openssl rand -hex 32`); unset = a random per-process secret is registered, so it works but changes on every restart |
| `SUPPORT_DEVELOPER_LANGUAGE` | app locale code the developer reads (default `ru`) |
| `SUPPORT_ADMIN_URL` | base of the admin link on the card (default `https://admin.ai-budget.pl`) |

## 4. Apply

`docker restart` does NOT reload `env_file`. Recreate the API container:

```
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate api
```

On start the API calls `setWebhook` (allowed updates: `message`). A failure is logged as a warning
("Support Telegram setWebhook failed") and does not stop the API.

## 5. Verify

```
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

Expect `url` = `<SUPPORT_TELEGRAM_WEBHOOK_URL>/support-telegram/webhook`, an empty
`last_error_message` and `pending_update_count` near 0. Then send a message from the app: a card
arrives in the bot chat; use Telegram "reply" on that card and the user gets the translated answer
and a push.

## Troubleshooting

- `last_error_message` 404: the path got the `/api/v1` prefix — check `global-prefix-exclusions.ts`
  for `support-telegram/webhook`.
- Webhook calls rejected: `SUPPORT_TELEGRAM_WEBHOOK_SECRET` differs from the registered one —
  recreate the container.
- Bot answers "reply to a card": the message was not a Telegram reply to a forwarded card; there is
  deliberately no fallback.
- No card at all: token or chat id unset ("Support Telegram skipped (not configured)" in the API log).
