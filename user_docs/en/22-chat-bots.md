# Chat Bots — Telegram, WhatsApp & Slack

> Manage your finances directly from Telegram, WhatsApp, or Slack. Chat with AI, add expenses, scan receipts, and send voice messages — without opening the app.

## Overview

Connect your account to **Telegram**, **WhatsApp**, **Slack**, or any combination at the same time. All three bots offer identical features — use whichever messenger you prefer.

To connect: **Settings → Chat Bots**.

## Linking Your Account

### Telegram
1. Tap **Connect Telegram** — a 6-character code appears (valid 10 minutes)
2. Open Telegram and find the bot
3. Send `/link YOUR_CODE` (e.g. `/link A3F2B1`)
4. You'll see "Account linked successfully!"

### WhatsApp
1. Tap **Connect WhatsApp** — a code and QR code appear
2. Tap **Open WhatsApp** (the message is pre-filled) or scan the QR code
3. Send `link YOUR_CODE` to the bot
4. You'll see "Account linked successfully!"

### Slack
1. Tap **Connect Slack** — a 6-character code appears (valid 10 minutes)
2. Open Slack, find the **AI Budget Assistant** app and open a direct message with it
3. Send `link YOUR_CODE` (e.g. `link A3F2B1`)
4. You'll see "Account linked successfully!"

> Telegram, WhatsApp, and Slack can all be connected to the same account at the same time.

## What You Can Do

- **Add expenses or income**: type naturally or use commands
- **AI Chat**: ask any financial question — same AI as in the app
- **Voice messages**: speak your expense or question (2 AI requests per message)
- **Receipt photos**: send a photo to scan automatically (2 AI requests per photo)
- **Check AI usage**: `/usage`
- **Switch accounts**: `/account`

## Commands

| Command | What it does |
|---|---|
| `/link CODE` | Link your messenger to the app |
| `/expense 50 lunch` | Add an expense |
| `/income 3000 salary` | Add an income |
| `/category expense Food` | Create a category |
| `/usage` | View AI request usage and limits |
| `/account` | Switch active account |
| `/newchat` | Start a fresh AI conversation |
| `/unlink` | Disconnect the bot |
| `/help` | Show all commands |

> In **WhatsApp** and **Slack**, commands work with or without the leading `/`. You can also just type an amount and description: `50 lunch`.

## Receipt Scanning

1. Take a photo of a receipt and send it to the bot
2. The bot extracts the amount, date, and vendor using OCR
3. If the date is wrong, send the correct date in `DD.MM.YYYY` format
4. Confirm to add the expense, or cancel

## Multiple Accounts

If you have several accounts (e.g. "Personal" and "Family"):
- Mention the account name in your message: "Show expenses in Family" — the AI queries that account for this message only
- Use `/account` to permanently switch the default account for the bot

## AI Request Cost

| Action | AI requests used |
|---|---|
| Text message / AI chat | 1 |
| Voice message | 2 |
| Receipt photo | 2 |

When your limit is reached, the bot notifies you instead of processing the request. Use `/usage` to check remaining requests.

## Currency Support

The bot recognizes currency symbols: ₴ (UAH), $ (USD), € (EUR), zł (PLN), £ (GBP), ₽ (RUB).

**Examples:** `/expense 50$ lunch` · `50 zł lunch` · `expense 100₴ groceries`

## FAQ

**Q: Can I connect Telegram, WhatsApp, and Slack?**
Yes — they are independent links and all work simultaneously.

**Q: What language does the bot use?**
The language from Settings → Appearance.

**Q: Do I need a subscription to use the bots?**
The bots use AI requests from your plan's monthly allowance. Free plan users have a smaller monthly limit.

---

*See also: [AI Chat](./07-ai-chat.md) | [Accounts](./09-accounts.md) | [Settings](./11-settings.md)*
