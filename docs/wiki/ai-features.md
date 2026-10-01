# AI features

*Hub. Audited 2026-09-22 — see the note at the bottom for what this page used to claim.*

## What this is

OpenAI-powered functionality exposed through `modules/ai/` and consumed by the mobile app and by
**all three chat bots** (Telegram, WhatsApp, Slack), which call the same `ChatService`. Covers
natural-language financial Q&A, action execution through function calling, voice transcription and
receipt OCR.

## Entry points

- `apps/api/src/modules/ai/ai.controller.ts` — `POST /ai/chat`, `/ai/chat/confirm`, `/ai/chat/reject`
- `apps/api/src/modules/ai/services/chat.service.ts` — the orchestrator for the call lifecycle
  (message assembly → API call → response parsing → pending-action management)
- `apps/api/src/modules/ai/services/ai-tools.service.ts` — the thin `executeAction` dispatcher,
  `isWriteAction`, and the read-action cache wrapper (`executeWithCache`). The function schemas
  are data-only in `ai-tool-schemas.ts`; the handlers are split by domain across
  `ai-expense-tools.service.ts`, `ai-budget-tools.service.ts`, `ai-debt-goal-tools.service.ts`,
  `ai-shopping-tools.service.ts` and `ai-undo-tools.service.ts` (ABA-591)
- `apps/api/src/modules/ai/services/chat-action-lifecycle.service.ts` and
  `apps/api/src/modules/ai/services/chat-conversation.service.ts` — the confirm/reject/undo
  lifecycle and conversation CRUD, split out of `chat.service.ts` (ABA-592)
- `apps/api/src/modules/ai/services/user-context-builder.service.ts` — builds `UserContext`
- `apps/api/src/modules/ai/services/prompt-builder.service.ts` — system prompt, language detection
- `apps/api/src/modules/ai/services/embedding.service.ts` — cosine matching of free text against the
  user's own categories, tags and projects. **Not a knowledge base**; there is no RAG here
- `apps/mobile/app/(tabs)/chat.tsx`, `apps/mobile/src/stores/chatStore.ts`
- `apps/mobile/src/components/chat/` — `ActionConfirmationCard`, `ActionResultCard`

Models: the main chat turn uses the model the user picked (`User.aiModel`, resolved by
`resolveAiModel` in `apps/api/src/modules/ai/services/model-resolver.ts`); short formatting and
narration calls use `resolveCheapModel()`. `whisper-1` transcribes voice and
`text-embedding-3-small` does the matching above. Model ids live in those files, not here.

## Feature pages

- [chat-architecture](features/chat-architecture.md) — one chat turn end to end: service boundaries,
  the confirmation flow, the read cache, `UserContext`, language detection, the `chat/*` endpoints
- [goals](features/goals.md) — savings goals, the `update_goal_balance` tool, the contribution log
- [safe-to-spend](features/safe-to-spend.md) — the deterministic engine behind the home hero number
  and the `check_affordability` tool
- [income-voice-and-receipt-capture](features/income-voice-and-receipt-capture.md) — voice and
  receipt capture for incomes, `POST /ai/parse-income`, `Income.source`

- [chat-conversation-management](features/chat-conversation-management.md) — rename, delete, pin,
  sharing
- [chat-undo-last-action](features/chat-undo-last-action.md) — reverting the most recent confirmed
  write from inside the same conversation
- [receipt-category-split](features/receipt-category-split.md) — the OCR funnel's category splitting
- [ai-statement-import](features/ai-statement-import.md) — inferring a bank statement's column
  mapping when no parser recognises it
- [categorize-uncategorized](features/categorize-uncategorized.md) — one batched model call that
  clusters an account's uncategorized expenses into a reviewed set of categories
- [bot-categorize-command](features/bot-categorize-command.md) — the same pass exposed as a
  sequential Yes/Skip/Stop chat command on Telegram, WhatsApp and Slack
- [merchant-category-rules](features/merchant-category-rules.md) — learning a merchant's category
  from a manual edit or a bulk recategorization, applied at import and categorize time

## Key concepts

**The function list is the count.** Do not restate it as a numeral here — this page said "11 AI
functions" for four months while the real number reached 18. `CLAUDE.md` carries the authoritative
list; the schemas live in `ai-tool-schemas.ts` and dispatch in `ai-tools.service.ts`, which are the
only places that cannot go stale. Adding a new function touches: one schema object in
`ai-tool-schemas.ts`, one handler on whichever domain provider it belongs to (or a new provider if
it starts a new domain), and one `case` in `ai-tools.service.ts`'s switch — never a single
thousand-line file.

**Confirmation flow.** Write actions are stored as a `pending_action` chat message and execute only
from `POST /ai/chat/confirm`, scoped to the member who proposed them; read actions execute
immediately and are cached for 10 minutes under a key that includes the caller's display currency.
The two shopping-list writes are the deliberate exceptions that execute immediately. Full detail:
[chat-architecture](features/chat-architecture.md#the-confirmation-flow).

**Language detection** resolves the reply language from the current message's unique letters first,
then the user's UI locale, then recent history — all nine app locales. See
[chat-architecture](features/chat-architecture.md#language).

**Usage and cost.** AI usage is metered per user and limits are enforced server-side; `AiUsageBadge`
shows what is left, and the admin dashboard has an AI-usage page. The mobile one-time
cost-confirmation dialog stores its dismissal in **MMKV** (`react-native-mmkv`, store id
`ai-cost-confirmation`), not AsyncStorage.

## Known gaps

- Long conversations lose their recent turns: `chat()` loads the *first* 20 messages as model history,
  not the last 20 — see [chat-architecture](features/chat-architecture.md#known-gaps).
- There is no knowledge base behind the chat: it answers from `UserContext` plus function calling,
  so it cannot answer questions about the app itself.

## Audit note

Read against the code on 2026-09-22, the first pass after this wiki's revival. Seven claims on this
page were wrong: the function count and its list, the orchestrator's size, "8 languages", the path
to the two chat card components, "Telegram" as the only bot consumer, "GPT-4", and AsyncStorage as
the cost-dialog's storage. Each had been true when written in May.
