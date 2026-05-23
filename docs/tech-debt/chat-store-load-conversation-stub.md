---
id: chat-store-load-conversation-stub
title: chatStore.loadConversation() is a silent no-op
status: closed
priority: P2
module: apps/mobile
created_at: 2026-05-11
orchestration_run: 4a2a1aa4-f4c2-43bd-9ad2-425bfa2db0d5
---

# chatStore.loadConversation() is a silent no-op

## What's wrong

`apps/mobile/src/stores/chatStore.ts` lines 203–218 define `loadConversation(conversationId)`, but the implementation contains only a TODO and sets no messages — it silently switches to the conversation ID without loading any history:

```ts
loadConversation: async (conversationId: string) => {
  set({ isLoading: true, error: null });
  try {
    // TODO: Load conversation history from API
    set({ currentConversationId: conversationId, isLoading: false });
  } catch ...
}
```

Any UI that calls this action (e.g. a conversation list or deep link) will appear to navigate into a past conversation but show an empty message thread.

## Why it matters

If the app ever surfaces past conversations — through a history list, a notification deep link, or the Telegram integration — users land in a blank thread with no explanation. The failure mode is invisible: no error, no loading indicator stuck on, just an empty chat. This is a regression trap for any feature that builds on conversation history.

## Proposed fix

- Add a `GET /ai/conversations/:id` endpoint (or reuse the existing sync endpoint) to retrieve message history for a conversation.
- Implement `loadConversation` to fetch and deserialize messages into the store's `messages` array.
- If the API endpoint doesn't exist yet, either build it first or remove the `loadConversation` export until it can be implemented properly — a stub is more dangerous than an absent function.
- Add an integration test covering a round-trip: create a conversation, reload it, assert messages are present.

## Files involved

- `apps/mobile/src/stores/chatStore.ts`
- `apps/api/src/modules/ai/` (endpoint may need to be added)
