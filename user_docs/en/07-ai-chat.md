# AI Chat

> Ask questions about your finances in natural language. Get spending analysis, budget advice, and personalized saving tips — powered by AI.

## Overview

![AI Chat conversation](../img/chat-7.jpg)

The **AI Chat** tab is your personal financial assistant. You can ask questions in plain language and get detailed answers based on your actual spending data.

## How to Use

1. Tap the **AI Chat** tab (the rightmost tab in the bottom navigation)
2. Type a question in the text field at the bottom (placeholder: "Ask about your budget...")
3. Tap the **send** button (arrow icon)
4. Read the AI response in the chat bubble

The AI assistant responds with analysis based on your real transaction data for the current account.

## Quick Action Buttons

Three preset buttons appear for common questions:

| Button | Question sent |
|---|---|
| **Top expenses** | "What did I spend the most on this month?" |
| **Budget status** | "Am I on track with my budget?" |
| **Saving tips** | "Give me tips to save money" |

Tap any button to instantly send that question.

## Voice Input in Chat

1. Tap the **microphone** button (left of the text input)
2. Speak your question
3. The transcribed text is processed and sent

> **Note:** Voice processing status shows as "Processing voice..." while being transcribed.

## Example Questions

**Analysis Questions:**
- "What did I spend the most on this month?"
- "How much did I spend on food last week?"
- "Am I on track with my budget?"
- "Compare my spending this month vs last month"
- "What are my top 3 expense categories?"
- "How much did I spend on transport this year?"
- "Give me tips to save money"
- "When will my monthly budget run out at this rate?"

**Natural Language Commands:**
- "Add expense 500₴ for groceries"
- "Create budget 10000₴ for entertainment for March"
- "Add income 50000₴ from salary"
- "Show my expenses last week"
- "What's my budget status?"
- "Show category breakdown for this month"

## Chat Features

- **Conversation history** — previous messages are preserved during your session
- **Typing indicator** — shows "Thinking..." while the AI processes your question
- **Error handling** — if something goes wrong, you'll see an error message with a retry option
- **Natural Language Commands** — create expenses, income, budgets, categories, and query data using plain language
- **Action Confirmation** — when creating financial records, AI shows a preview and asks for confirmation before saving
- **Smart Language Detection** — AI automatically responds in your language (English, Russian, Ukrainian, Belarusian, German, Spanish, French, Polish)
- **Currency Recognition** — supports symbols: ₴ (UAH), $ (USD), € (EUR), zł (PLN), £ (GBP), ₽ (RUB)
- **Telegram Bot** — use the same AI Chat from Telegram. Send text, voice, or receipt photos directly to the bot
- **Automatic Account Detection** — mention an account name in your message (e.g., "Show expenses in Family") and AI will query that account automatically

## AI Request Limits

Each message you send uses one AI request from your monthly allowance:

| Plan | AI Requests per Month |
|---|---|
| **Free** | 5 |
| **Pro** | 200 |
| **Business** | Unlimited |

When you run out of requests, you'll be prompted to upgrade your plan.

## Natural Language Commands

You can now **execute real actions** directly from the chat:

### Creating Records

1. Type a command like: **"Add expense 500₴ for groceries"**
2. AI shows a **confirmation card** with:
   - Amount and currency
   - Category (auto-detected or default)
   - Date (today by default)
3. Tap **Confirm** to create the expense, or **Cancel** to reject
4. After confirmation, the expense is saved and you'll see a success message

**Supported create commands:**
- **Expenses:** "Add expense 500₴ for groceries", "Spent 1200₴ on transport yesterday"
- **Income:** "Add income 50000₴ from salary", "Received 5000₴ bonus"
- **Budgets:** "Create budget 10000₴ for entertainment for March", "Set monthly budget 3000₴ for food"
- **Categories:** "Create expense category Food", "Add income category Freelance"

### Querying Data

These commands execute **immediately** and show results:

- **"Show my expenses last week"** → displays expense list with total
- **"What's my budget status?"** → shows all budgets with progress bars
- **"Show category breakdown for this month"** → displays spending by category with percentages

## FAQ

- **Q: Does the AI have access to all my financial data?**
  **A:** The AI can access your expenses, income, budgets, and categories for the currently selected account. It does not access other accounts or personal data beyond financial transactions.

- **Q: Can I use AI Chat offline?**
  **A:** No, AI Chat requires an internet connection to process your questions.

- **Q: The AI gave an incorrect answer. What should I do?**
  **A:** AI responses are based on your data but may occasionally be inaccurate. You can rephrase your question for better results, or verify the data in the Analytics tab.

- **Q: Can I undo a confirmed action?**
  **A:** After you confirm an action (like creating an expense), it's saved to your account. You can delete it manually from the Expenses tab.

- **Q: What happens if I reject an action?**
  **A:** If you tap "Cancel" on a confirmation card, the action is rejected and nothing is saved. The AI will acknowledge the rejection.

- **Q: Can I use AI Chat from Telegram?**
  **A:** Yes! Link your Telegram via Settings and chat with the AI bot directly. All features work the same — text, voice, commands, and receipt scanning. See [Telegram Bot](./22-telegram-bot.md) for details.

- **Q: How does AI know which account I'm asking about?**
  **A:** If you mention an account name in your message (e.g., "expenses in Family"), the AI automatically queries that account. Otherwise, it uses your current default account.

---

*See also: [Spending Story](./08-spending-story.md) | [Analytics](./06-analytics.md)*
