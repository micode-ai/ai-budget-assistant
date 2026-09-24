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
- `apps/api/src/modules/ai/services/ai-tools.service.ts` — the function schemas, the `executeAction`
  dispatcher and the read-action cache wrapper
- `apps/api/src/modules/ai/services/user-context-builder.service.ts` — builds `UserContext`
- `apps/api/src/modules/ai/services/prompt-builder.service.ts` — system prompt, language detection
- `apps/api/src/modules/ai/services/embedding.service.ts` — cosine matching of free text against the
  user's own categories, tags and projects. **Not a knowledge base**; there is no RAG here
- `apps/mobile/app/(tabs)/chat.tsx`, `apps/mobile/src/stores/chatStore.ts`
- `apps/mobile/src/components/chat/` — `ActionConfirmationCard`, `ActionResultCard`

Models in use: `gpt-4.1` for chat, `whisper-1` for voice, `text-embedding-3-small` for the matching
above.

## Feature pages

- [chat-conversation-management](features/chat-conversation-management.md) — rename, delete, pin,
  sharing
- [chat-undo-last-action](features/chat-undo-last-action.md) — reverting the most recent confirmed
  write from inside the same conversation
- [receipt-category-split](features/receipt-category-split.md) — the OCR funnel's category splitting
- [ai-statement-import](features/ai-statement-import.md) — inferring a bank statement's column
  mapping when no parser recognises it

## Key concepts

**The function list is the count.** Do not restate it as a numeral here — this page said "11 AI
functions" for four months while the real number reached 18. `CLAUDE.md` carries the authoritative
list; the schemas and dispatch live in `ai-tools.service.ts`, which is the only place that cannot
go stale.

**Confirmation flow.** Write actions return a pending confirmation and the client shows
`ActionConfirmationCard`; read actions execute immediately and are cached. A few write-shaped tools
are deliberate exceptions that execute immediately — the shopping-list add and remove — because
their guard rails differ; see `chat.service.ts`'s dedicated branches.

**Language detection** resolves the reply language from the current message's script first, then the
user's UI locale, then recent history. All nine app locales.

**Usage and cost.** AI usage is metered per user and limits are enforced server-side; `AiUsageBadge`
shows what is left, and the admin dashboard has an AI-usage page. The mobile one-time
cost-confirmation dialog stores its dismissal in **MMKV** (`react-native-mmkv`, store id
`ai-cost-confirmation`), not AsyncStorage.

## Known gaps

- `chat.service.ts` was split down to a "lean orchestrator" and has since grown back to roughly
  twice that size. Worth a look before adding to it.
- There is no knowledge base behind the chat: it answers from `UserContext` plus function calling,
  so it cannot answer questions about the app itself.

## Audit note

Read against the code on 2026-09-22, the first pass after this wiki's revival. Seven claims on this
page were wrong: the function count and its list, the orchestrator's size, "8 languages", the path
to the two chat card components, "Telegram" as the only bot consumer, "GPT-4", and AsyncStorage as
the cost-dialog's storage. Each had been true when written in May.
