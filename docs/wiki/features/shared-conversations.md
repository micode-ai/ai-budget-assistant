# Shared AI chat conversations

*Hub: [ai-features](../ai-features.md)*

## What this is

A per-conversation, opt-in group chat for shared accounts. A shared conversation is visible to
every member of the account; a private one stays with its creator. Members can talk to each other
with `@mentions`, and the AI answers any message that mentions nobody. Rename, delete, pin and the
sharing control itself are on [chat-conversation-management](chat-conversation-management.md).

## Entry points

- `apps/api/src/modules/ai/services/chat.service.ts` — `chat()` (mentions, presence, AI history),
  `setConversationShared`, `touchPresence` / `isPresent`, `sanitizeName`
- `apps/api/src/modules/ai/ai.controller.ts` — `GET /ai/chat/conversations` (account-scoped),
  `…/:id/messages`, `…/:id/poll?since=`, `PATCH …/:id/shared`, `POST /ai/chat/confirm|reject`
- Schema: `ChatConversation.accountId`, `.isShared`; `ChatMessage.senderUserId`, `.mentionedUserIds`
- Mobile: `apps/mobile/src/stores/chatStore.ts` (polling, optimistic send, `currentIsOwner`),
  `src/db/chatRepository.ts` (SQLite cache), `src/hooks/useNotificationDeepLink.ts`

## Key concepts

**Visibility**: a conversation is readable when it belongs to the caller's account (`X-Account-Id`)
**and** is shared or was created by the caller.

**A mention silences the AI.** Mentions arrive as `{ userId }[]`, validated against the account's
members with the sender removed. A message with at least one valid mention is stored, pushes a
`chat_mention` to each mentioned member **not currently present**, and returns with
`aiResponded: false`. A message with no mention goes to the AI as usual.

**Presence** is a Redis key `chat:presence:{conversationId}:{userId}` with a 45 s TTL, refreshed by
the poll. The `chat_mention` push is gated by `user.notifySharedActivity`.

**The AI sees who said what**: in a shared conversation each member's message in the history is
prefixed with `[Name]: `, the name passed through `sanitizeName`.

**The phone polls** `…/poll?since=` every 4 s, only while a shared conversation is focused, and
reconciles its optimistic message id to the server's `userMessageId`. Other members' messages
render left-aligned with a name label; an `@` suggestion bar offers members.

## Invariants

**Only the creator can change a conversation's sharing** — any member may share a conversation
they created, and nobody, not even the account owner, can share someone else's. The check is
`conversation.userId === caller`, not the account role, and it runs after the
`{ id, accountId }` lookup (404 before 403, so existence is not disclosed across accounts).

**Confirm and reject check both the account and the action's initiator.** The pending action is
scoped by its `senderUserId`, so in a shared conversation one member cannot confirm a write another
member asked for.

**The poll dedupes against state read after its network await.** While `api.chat()` was in flight,
the poll could return the server copy of the just-sent message while the local optimistic copy
still had its temporary id, and the sender saw their message twice. The `tempId → serverId`
reconciliation also drops duplicate ids.

**Read tools run with the real user id.** `handleReadAction` threads `userId` into
`executeWithCache`; it was once a hard-coded `''`. The cache key (account, args, display currency)
is unchanged.

**Do not act on a cold-start notification until the navigator exists.** Tapping a `chat_mention`
push switches account and opens the chat tab with `conversationId`. On a cold start,
`getLastNotificationResponseAsync()` is stored and flushed only once initialisation is done, the
user is authenticated and fonts are loaded: navigating while the root navigator still renders `null`
wedged expo-router on a black screen, and `switchAccount` no-opped against an empty account list.
This gate must stay symmetric with the `Linking` deep-link gate.

## Known gaps

- Polling, not a socket: four-second latency and a request per focused client.

## History

Shared conversations (the original feature) · ABA-264 (cold-start deep-link gate) · ABA-334 (any
member may share their own conversation; the sender-side duplicate; the read-action user id).
