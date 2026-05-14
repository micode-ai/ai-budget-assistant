# Plan: Load and browse past AI chat conversations

**Feature ID**: ai-chat-history-persistence  
**GitHub issue**: https://github.com/micode-ai/ai-budget-assistant/issues/101  
**Status**: done

## Context

The chat tab shows a working AI conversation interface, but tapping a past conversation does nothing — `chatStore.loadConversation()` has an explicit `// TODO` stub at line 207. The database already stores full message bodies (`ChatConversation` + `ChatMessage` in Prisma; matching SQLite tables on mobile). This plan completes the loop.

## Key decisions

- **Conversations continuable** (not read-only): after loading history the user can send new messages which continue the same `conversationId`.
- **History capped at 50 messages** per conversation to keep the payload small.
- **Pending-action rows filtered**: messages with `role = 'pending_action'` are internal API records and must not appear in the UI.
- **SQLite cache**: fetched messages are upserted into `chatMessages` (table already exists) via a new `chatRepository.ts`. On subsequent opens, the cached rows are shown immediately while the API refresh runs in the background.
- **Conversation list**: `GET /ai/chat/conversations` returns the 20 most-recently-updated conversations for the logged-in user (scoped by `userId`, not `accountId` — conversations are per-user).
- **No new Prisma migration**: schema already has `ChatConversation` and `ChatMessage`.

## Checklist

- [x] Write plan + contracts
- [x] `chat.service.ts` — add `getConversations(userId)` + `getConversationMessages(userId, conversationId)`
- [x] `ai.controller.ts` — add `GET /ai/chat/conversations` + `GET /ai/chat/conversations/:id/messages`
- [x] `chatRepository.ts` — SQLite read/upsert for conversations + messages
- [x] `api.ts` — add `getChatConversations()` + `getChatConversationMessages(id)`
- [x] `chatStore.ts` — implement `loadConversations()` + `loadConversation(id)`
- [x] `chat.tsx` — add history button in header + conversation list modal
- [x] i18n — add new strings to all 8 locale files
- [x] Update product-ideas frontmatter `status: building`

## Dependency order

```
chat.service.ts (API logic)
  → ai.controller.ts (HTTP routes)
  → api.ts (mobile client)
  → chatRepository.ts (SQLite)
  → chatStore.ts (Zustand store)
  → chat.tsx (UI)
  → i18n/*.ts (strings)
```
