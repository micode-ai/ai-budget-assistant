# Contract: AI Chat History

## GET /ai/chat/conversations

Returns the 20 most recently updated conversations for the authenticated user.

**Auth**: `JwtAuthGuard` (no AccountContextGuard — conversations are per-user, not per-account)

**Response**
```json
[
  {
    "id": "uuid",
    "title": "What did I spend this month?",
    "createdAt": "2026-05-10T12:00:00Z",
    "updatedAt": "2026-05-10T12:05:00Z"
  }
]
```

---

## GET /ai/chat/conversations/:id/messages

Returns up to 50 messages for a conversation, ordered oldest-first. Filtered to `user` and `assistant` roles only (`pending_action` rows are omitted).

**Auth**: `JwtAuthGuard`  
**Ownership check**: returns 404 if the conversation does not belong to the requesting user.

**Response**
```json
[
  {
    "id": "uuid",
    "conversationId": "uuid",
    "role": "user",
    "content": "What did I spend on food this month?",
    "tokensUsed": null,
    "createdAt": "2026-05-10T12:00:00Z"
  },
  {
    "id": "uuid",
    "conversationId": "uuid",
    "role": "assistant",
    "content": "You spent €320 on food this month...",
    "tokensUsed": 245,
    "createdAt": "2026-05-10T12:00:03Z"
  }
]
```

---

## Mobile store (`chatStore`)

### `loadConversations(): Promise<void>`
- Reads SQLite cache first (instant paint)
- Refreshes from `GET /ai/chat/conversations`, upserts into SQLite

### `loadConversation(conversationId: string): Promise<void>`
- Sets `isLoading: true`, `currentConversationId`
- Reads SQLite cache first, sets `messages` immediately if rows exist
- Calls `GET /ai/chat/conversations/:id/messages`, maps to `ChatMessage[]`
- Upserts fetched messages into SQLite
- Sets `messages` from API result, `isLoading: false`

---

## SQLite (`chatRepository`)

```ts
getConversations(userId: string): Promise<ChatConversation[]>
upsertConversation(conversation: ChatConversation): Promise<void>
getMessages(conversationId: string): Promise<ChatMessage[]>
upsertMessage(message: ChatMessage): Promise<void>
```

Tables already exist in `apps/mobile/src/db/schema/index.ts`.
