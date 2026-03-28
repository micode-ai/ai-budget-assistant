# Telegram Bot

> Manage your finances directly from Telegram. Chat with AI, add expenses by command, scan receipts, and use voice messages — all without opening the app.

## Overview

The **Telegram Bot** lets you interact with your AI Budget Assistant from Telegram. Link your account once, and you can track expenses, ask financial questions, and manage budgets — right from your messenger.

## Linking Your Account

1. Open the app and go to **Settings**
2. Tap **Telegram Bot** under the Integrations section
3. Tap **Generate Link Code** — a 6-character code appears (valid for 10 minutes)
4. Open Telegram and find the bot
5. Send `/link CODE` (e.g., `/link A3F2B1`)
6. You'll see a confirmation: "Account linked successfully!"

> **Note:** Each Telegram account can be linked to one app account at a time. Re-linking replaces the previous connection.

## Bot Commands

| Command | Description |
|---|---|
| `/start` | Welcome message and setup instructions |
| `/link CODE` | Link your Telegram to the app |
| `/expense AMOUNT DESC` | Quick-add an expense (e.g., `/expense 50 lunch`) |
| `/income AMOUNT DESC` | Quick-add an income (e.g., `/income 3000 salary`) |
| `/category [TYPE] NAME` | Create a category (e.g., `/category expense Food`) |
| `/categories` | List and delete categories |
| `/usage` | View your AI usage, limits, and breakdown |
| `/account` | Switch between your accounts |
| `/newchat` | Start a fresh AI conversation |
| `/unlink` | Disconnect Telegram from your account |
| `/help` | Show all available commands |

## AI Chat in Telegram

Send any text message to the bot, and it will be processed by the AI assistant — the same one available in the app's AI Chat tab.

**Examples:**
- "What did I spend the most on this month?"
- "Show my expenses for last week"
- "Add expense 500 UAH for groceries"
- "What's my budget status?"

The AI supports all features from the in-app chat: natural language commands, action confirmation, category breakdown, and budget analysis.

## Automatic Account Detection

If you have multiple accounts (e.g., "Personal" and "Family"), the AI automatically detects when you mention an account name in your message and queries the correct account.

**Examples:**
- "Show my expenses in Family account" — queries the Family account
- "What did I spend on food?" — queries the default account
- "Add expense 100 UAH for groceries to Family" — creates expense in the Family account

> **Note:** This does not permanently switch your default account. Use `/account` to change the default.

## Voice Messages

1. Record a voice message in Telegram
2. Send it to the bot
3. The bot transcribes your speech and processes it as an AI chat message

Voice messages support all the same commands and questions as text messages.

## Receipt Scanning

1. Take a photo of a receipt
2. Send the photo to the bot
3. The bot scans it using OCR and shows a summary
4. Tap **Confirm** to add the expense, or **Cancel** to reject

You can also send receipt images as documents (PDF or images).

## Switching Accounts

If you have multiple accounts:

1. Send `/account`
2. The bot shows all your accounts with inline buttons
3. Tap the account you want to switch to
4. The active account is marked with a checkmark

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

**Examples:** `/expense 50$ lunch`, `/expense 100₴ groceries`, `/expense 30 EUR taxi`

## FAQ

- **Q: Can I use the bot without linking?**
  **A:** No, you need to link your Telegram account first using a code from the app.

- **Q: Does the bot work in group chats?**
  **A:** The bot is designed for private (1:1) conversations only.

- **Q: Which account does the bot use?**
  **A:** The bot uses your default account (set during linking or via `/account`). You can also mention an account name in your message, and the AI will automatically use that account for the query.

- **Q: Can I link multiple Telegram accounts?**
  **A:** No, each app user can have one linked Telegram account, and each Telegram account can be linked to one app user.

- **Q: Do bot messages count against my AI request limit?**
  **A:** Yes. AI chat costs 1 request per message, voice messages cost 2 requests (transcription + AI processing), and receipt photos cost 2 requests. Use `/usage` to check your remaining balance. When the limit is reached, the bot will notify you instead of processing the request.

- **Q: What language does the bot respond in?**
  **A:** The bot responds in the same language set in your app (Settings > Appearance). All system messages, commands, and buttons are localized.

---

*See also: [AI Chat](./07-ai-chat.md) | [Accounts](./09-accounts.md) | [Settings](./11-settings.md)*
