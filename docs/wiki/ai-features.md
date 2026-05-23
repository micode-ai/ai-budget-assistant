# AI Features

## What this is
OpenAI-powered functionality exposed through the API (`modules/ai/`) and consumed on mobile (`app/(tabs)/chat`, `src/stores/chatStore.ts`) and Telegram. Includes natural-language financial Q&A, action execution (create expenses/budgets via chat), and voice/photo processing.

## Entry points
- `apps/api/src/modules/ai/ai.controller.ts` — `POST /ai/chat`, `POST /ai/chat/confirm`, `POST /ai/chat/reject`
- `apps/api/src/modules/ai/services/chat.service.ts` — lean orchestrator (~415 lines) for the OpenAI call lifecycle (message assembly → API call → response parsing → pending-action management)
- `apps/api/src/modules/ai/services/user-context-builder.service.ts` — assembles the `UserContext` from Prisma / domain services
- `apps/api/src/modules/ai/services/ai-tools.service.ts` — all 11 OpenAI function schemas + `executeAction` dispatcher + read-action cache wrapper
- `apps/api/src/modules/ai/services/prompt-builder.service.ts` — system prompt construction, language detection, action i18n
- `apps/api/src/modules/ai/utils/` — currency symbol mapping and other helpers
- `apps/mobile/app/(tabs)/chat.tsx` — chat tab UI
- `apps/mobile/src/stores/chatStore.ts` — message history, pending-confirmation state
- `apps/mobile/src/features/chat/` — `ActionConfirmationCard`, `ActionResultCard` components
- `apps/mobile/src/features/voice/` — voice recording → Whisper transcription → chat
- `apps/mobile/src/features/receipt/` — photo capture → OCR → expense extraction

## Key concepts
- **11 AI functions** — `create_expense`, `create_income`, `create_budget`, `create_category`, `get_expenses`, `get_budget_status`, `get_category_breakdown`, `record_debt_repayment`, `create_debt`, `get_debt_summary`, `update_goal_balance`; schemas + dispatch live in `ai-tools.service.ts`
- **Confirmation flow** — write actions (`create_*`) return a pending confirmation; mobile shows `ActionConfirmationCard`; user confirms via `POST /ai/chat/confirm` or rejects via `POST /ai/chat/reject`; read actions (`get_*`) execute immediately
- **Language detection** — API detects user language from message content (8 languages: en, de, es, fr, pl, ru, ua, be) and responds in the same language
- **Currency symbol mapping** — `₴→UAH`, `$→USD`, `€→EUR`, `zł→PLN`, `£→GBP`, `₽→RUB` resolved in `utils/`
- **AI cost confirmation** — `src/hooks/useAiCostConfirmation.ts` shows a one-time dialog before operations costing ≥ 2.0 credits; dismissal stored in AsyncStorage per feature
- **Usage tracking** — AI usage is metered per user; limits enforced server-side; `AiUsageBadge` component shows remaining credits; admin can view usage at `/ai-usage`

## Cross-references
- Talks to: OpenAI API (GPT-4 for chat, Whisper for voice, vision for OCR)
- Used by: `telegram-bot` — `ChatHandler` and `VoiceHandler` call the same AI services
- Monitored by: `admin-dashboard` `/ai-usage` page and dashboard AI cost chart

## Where to look first
Function-calling logic → `ai-tools.service.ts`. Prompt or language-detection issues → `prompt-builder.service.ts`. User-context shape → `user-context-builder.service.ts`. Mobile chat UI → `apps/mobile/app/(tabs)/chat.tsx` and `src/stores/chatStore.ts`.
