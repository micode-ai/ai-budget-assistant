# WhatsApp Bot

> Manage your finances directly from WhatsApp. Chat with AI, add expenses by command, scan receipts, and send voice messages — all without opening the app.

## Overview

The **WhatsApp Bot** lets you interact with your AI Budget Assistant from WhatsApp. Link your account once, and you can track expenses, ask financial questions, and manage budgets — right from your messenger.

The bot works the same way as the [Telegram Bot](./22-telegram-bot.md): same AI, same commands, same multi-account support. Use whichever messenger you prefer.

## Linking Your Account

1. Open the app and go to **Settings**
2. Tap **WhatsApp Bot** under the Integrations section
3. Tap **Connect WhatsApp** — a 6-character code and a QR code appear (valid for 10 minutes)
4. Either:
   - Tap **Open WhatsApp** — WhatsApp opens with the message `link YOUR_CODE` pre-filled. Just tap send.
   - Or scan the QR code with another phone's camera to open WhatsApp on that device.
   - Or copy the code and send `link YOUR_CODE` manually to the bot's WhatsApp number.
5. You'll see a confirmation: "Account linked successfully!"

> **Note:** Each WhatsApp number can be linked to one app account at a time. Re-linking replaces the previous connection.

## Bot Commands

Commands work with or without a leading `/` — both `expense 50 lunch` and `/expense 50 lunch` are accepted.

| Command | Description |
|---|---|
| `link CODE` | Link your WhatsApp to the app |
| `expense AMOUNT DESC` | Quick-add an expense (e.g., `expense 50 lunch`) |
| `income AMOUNT DESC` | Quick-add an income (e.g., `income 3000 salary`) |
| `category [TYPE] NAME` | Create a category (e.g., `category expense Food`) |
| `categories` | List and delete categories |
| `usage` | View your AI usage, limits, and breakdown |
| `account` | Switch between your accounts |
| `newchat` | Start a fresh AI conversation |
| `unlink` | Disconnect WhatsApp from your account |
| `help` | Show all available commands |

You can also just type a number and description (`50 lunch`) — the bot treats it as an expense.

## AI Chat in WhatsApp

Send any text message to the bot, and it will be processed by the AI assistant — the same one available in the app's AI Chat tab.

**Examples:**
- "What did I spend the most on this month?"
- "Show my expenses for last week"
- "Add expense 500 UAH for groceries"
- "What's my budget status?"

The AI supports natural language commands, action confirmation (✅ Confirm / ❌ Cancel buttons), category breakdown, and budget analysis. Confirmation buttons appear directly below the message.

## Automatic Account Detection

If you have multiple accounts (e.g., "Personal" and "Family"), the AI automatically detects when you mention an account name in your message and queries the correct account.

**Examples:**
- "Show my expenses in Family account" — queries the Family account
- "Add expense 100 UAH for groceries to Family" — creates the expense in the Family account

> **Note:** This does not permanently switch your default account. Use `account` to change the default.

## Voice Messages

1. Record a voice message in WhatsApp (press and hold the microphone button)
2. Send it to the bot
3. The bot transcribes your speech (showing the recognized text), then processes it as an AI chat message

Voice messages support all the same commands and questions as text messages. Voice costs 2 AI requests per message (transcription + AI processing).

## Receipt Scanning

1. Take a photo of a receipt and send it to the bot
2. The bot scans it using OCR and shows a summary (amount, date, vendor)
3. If the date is wrong, tap **Change date** and send the correct date in `DD.MM.YYYY` format (e.g., `28.03.2026`)
4. Tap **Add expense** to confirm, or **Cancel** to reject

You can also send receipt images as documents (image files or PDFs).

## Switching Accounts

If you have multiple accounts:

1. Send `account`
2. The bot shows your accounts as a tappable list
3. Tap the account you want to switch to
4. The active account is confirmed in a reply

All subsequent commands and AI queries will use the selected account until you switch again.

## Currency Support

The bot recognizes currency symbols and codes in commands:

| Symbol | Currency |
|---|---|
| ₴ | UAH |
| $ | USD |
| € | EUR |
| zł | PLN |
| £ | GBP |
| ₽ | RUB |

**Examples:** `expense 50$ lunch`, `expense 100₴ groceries`, `expense 30 EUR taxi`

## FAQ

- **Q: Can I use the bot without linking?**
  **A:** No, you need to link your WhatsApp number first using a code from the app.

- **Q: Does the bot work in group chats?**
  **A:** No. The bot only responds to 1:1 private conversations.

- **Q: Which account does the bot use?**
  **A:** The bot uses your default account (set during linking or via `account`). You can also mention an account name in your message, and the AI will automatically use that account for the query.

- **Q: Can I link both WhatsApp and Telegram to the same app account?**
  **A:** Yes. They are independent links. You can have both connected simultaneously.

- **Q: Do bot messages count against my AI request limit?**
  **A:** Yes. AI chat costs 1 request per message, voice messages cost 2 requests, and receipt photos cost 2 requests. Use `usage` to check your remaining balance. When the limit is reached, the bot will notify you instead of processing the request.

- **Q: What language does the bot respond in?**
  **A:** The bot responds in the same language set in your app (Settings → Appearance). All system messages, commands, and buttons are localized.

- **Q: My phone number changed — what happens to the link?**
  **A:** Just connect again from the app with your new WhatsApp number. The old link is automatically replaced.

---

*See also: [AI Chat](./07-ai-chat.md) | [Telegram Bot](./22-telegram-bot.md) | [Accounts](./09-accounts.md) | [Settings](./11-settings.md)*
