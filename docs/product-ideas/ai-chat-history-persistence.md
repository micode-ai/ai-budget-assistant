---
id: ai-chat-history-persistence
title: Load and browse past AI chat conversations
status: building
priority: P2
created_at: 2026-05-11
jira_ticket:
github_issue: https://github.com/micode-ai/ai-budget-assistant/issues/100
orchestration_run: a32f20e5-5a09-4054-931d-e7abffb4426c
---

# Load and browse past AI chat conversations

## User story
As a power user of the AI chat, I want to reopen a previous conversation and read what the assistant told me, so that I can recall budgeting advice or transaction details from earlier sessions.

## Value hypothesis
The chat tab already shows a "conversations" list, but tapping a past conversation does not load its messages — the store has an explicit `// TODO: Load conversation history from API` stub (`chatStore.ts:207`). This makes the history list feel broken. Completing this makes the AI feel like a persistent advisor rather than a stateless chatbot, which is a key differentiator vs. the built-in calculator or a generic LLM.

## Sketch
- Implement the stub in `chatStore.ts`: call `GET /ai/chat/conversations/:id/messages` (new endpoint) when a user selects a past conversation.
- API: add `GET /ai/chat/conversations` (paginated list) and `GET /ai/chat/conversations/:id/messages` to the AI module. Messages are already persisted server-side (the confirm/reject flow implies persistence).
- Mobile: render past messages as read-only in the chat bubble list; show a "Continue conversation" button to reactivate it.
- Cap loaded history at the last 50 messages per conversation to keep the payload small.
- Persist fetched history to SQLite so it's available offline after first load.

## Open questions
- Are full message bodies already stored in the API DB, or only metadata? Check `ai` Prisma schema.
- Should past conversations be editable (send follow-ups) or read-only?
- Retention policy: how long should conversation history be kept? Does it vary by subscription tier?

## Cost estimate
3–4 days: API endpoints + mobile store + read-only UI rendering. Add 1 day if offline SQLite caching is required.
