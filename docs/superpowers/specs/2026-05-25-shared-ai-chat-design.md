# Shared AI Chat for Shared Accounts — Design

**Date:** 2026-05-25
**Status:** Approved (pending implementation plan)

## Problem

Today the AI chat (`apps/api/src/modules/ai`, mobile Chat tab) is strictly
per-user: a `ChatConversation` is scoped only by `userId`, messages have no
author identity beyond that single owner, and there is no real-time delivery.

Members of a **shared account** want to talk to the AI assistant *together* in
the same conversation: any member can ask, every member sees the thread, and the
AI answers. When a member is addressing *another person* (not the AI), the AI
should stay quiet. If the addressed person isn't currently viewing the chat,
they should get a push notification.

## Goals

- A conversation can be marked **shared**; shared conversations are a group chat
  visible to all members of the account.
- In a shared conversation, a message that **`@mentions` a member** is treated as
  human-to-human and the **AI stays silent**; a message with **no mention** gets
  an **AI reply** (today's behavior).
- An `@mentioned` member who is **not currently viewing** the conversation gets a
  **push notification**.
- "Shared vs private" is decided **per conversation**, **opt-in** (default
  private), and only the **account owner** can mark a conversation shared.
- Members see each other's messages via **polling while the chat is open**.

## Non-goals (v1)

- True WebSocket real-time delivery (polling-while-open + push is sufficient).
- Reply-threading to suppress the AI when a human replies to a human without a
  mention (see "Known tradeoff").
- Per-account-wide shared setting; granularity is strictly per conversation.
- Editors/viewers creating or toggling shared conversations (owner-only).
- Shared chat in personal (single-member) accounts.

## Behavior model

Each `ChatConversation` carries an `isShared` boolean (default `false`).

**Private conversation (`isShared = false`)** — identical to today:
- Visible only to its creator (`userId`), within the account.
- The AI always replies. No mention handling, no polling, no push.

**Shared conversation (`isShared = true`)** — group chat:
- Visible to every member of the conversation's `accountId`.
- A user message with **no member `@mention`** → AI replies (normal flow,
  including read/write function-calling and the confirmation flow).
- A user message that **`@mentions` one or more members** → message is persisted
  but the AI does **not** respond. Absent mentioned members get a push.
- Only the **account owner** can set `isShared` (on create or via toggle) or flip
  it back to private. Editors/viewers participate in shared conversations but
  cannot create or toggle them — their own conversations are always private.
- The shared affordance only appears when the account has other members
  (owner + ≥1). Personal accounts are unaffected.

### Known tradeoff (accepted for v1)

The AI-silence rule is purely "a human mention is present → AI stays silent." If
member B replies to member A without `@mentioning` A, the AI will treat it as
directed at itself and respond. This is the simplest, most predictable rule.
Reply-threading to suppress that case is explicitly out of scope for v1.

## Data model (Prisma — `apps/api/prisma/schema.prisma`)

`ChatConversation`:
- add `accountId String? @map("account_id")` — FK → `Account`, `onDelete: Cascade`, indexed.
- add `isShared Boolean @default(false) @map("is_shared")`.
- keep `userId` as the **creator** id.

`ChatMessage`:
- add `senderUserId String? @map("sender_user_id")` — null for `assistant`/`system`/internal roles; set to the human author for `user` messages.
- add `mentionedUserIds String[] @map("mentioned_user_ids")` — the members addressed; empty array means AI-directed.

**Migration** (`npx prisma migrate dev`, then `prisma generate`):
- New columns with the defaults above.
- **Backfill** existing `ChatConversation` rows: `isShared = false`, and
  `accountId` = the personal account owned by `userId`
  (`Account where ownerId = userId AND type = 'personal'`, first match). Existing
  conversations are private and per-user, so moving them under the creator's
  personal account preserves today's visibility.
- `ChatMessage.senderUserId` backfill: set to the parent conversation's `userId`
  for rows with `role = 'user'`; leave null otherwise. `mentionedUserIds`
  defaults to empty.

## Scoping & authorization

- **Conversation list** for the active account:
  `accountId = req.accountId AND (isShared = true OR userId = req.user.id)`.
  → each member sees all shared conversations of the account **plus** their own
  private conversations; nobody sees another member's private conversations.
- `getConversationMessages` and the poll endpoint enforce the same predicate
  before returning anything (404 otherwise).
- `AccountContextGuard` already resolved & verified membership in `req.accountId`
  and exposes `req.accountRole`. Owner-only operations additionally require
  `req.accountRole === 'owner'` (throw `ForbiddenException` otherwise).

## API changes (`ai.controller.ts` / `chat.service.ts`)

All endpoints stay under `@UseGuards(JwtAuthGuard, AccountContextGuard)`.

- `POST /ai/chat` — body gains:
  - `mentions?: { userId: string }[]` — addressed members for this message.
  - `isShared?: boolean` — honored **only when creating** a new conversation, and
    **only if** `req.accountRole === 'owner'`; otherwise coerced to `false`.

  Service flow:
  1. Resolve/create conversation (set `accountId = req.accountId`, `userId`
     creator, `isShared` per above on create).
  2. Persist the user message with `senderUserId = req.user.id` and
     `mentionedUserIds` (filtered to valid members of the account; the AI/self is
     never a "mention").
  3. **If conversation is shared AND `mentionedUserIds` is non-empty** → skip
     OpenAI entirely; fire push to absent mentioned members (see Presence/Push);
     return `{ conversationId, aiResponded: false }`.
  4. **Else** → today's AI flow (function-calling, read/write actions,
     confirmation). For shared conversations, the history mapping prefixes each
     human message with its sender name (`[Maria]: …`) so the model knows who
     said what.

- `PATCH /ai/chat/conversations/:id` — body `{ isShared: boolean }`. Owner-only.
  Flips an existing conversation's `isShared`. Validates the conversation belongs
  to `req.accountId`.

- `GET /ai/chat/conversations/:id/poll?since=<iso>` — returns messages with
  `createdAt > since` (role in `user`/`assistant`), including `senderUserId` +
  resolved `senderName`, and **refreshes the caller's presence key**. Used by the
  mobile timer while a shared conversation is focused.

- `GET /ai/chat/conversations` — re-scoped per §Scoping; each item includes
  `isShared` (and a flag indicating whether the caller is the owner, for UI).

- `GET /ai/chat/conversations/:id/messages` — re-scoped per §Scoping; messages
  include `senderUserId` + `senderName`; response carries the conversation's
  `isShared`.

- Confirm/reject (`POST /ai/chat/confirm`, `/ai/chat/reject`) — unchanged. The
  `pendingAction` object is returned only to the initiating client, so write-action
  confirmation naturally stays with the member who triggered it; the executed
  action is attributed to that member's `userId`. Other members see the resulting
  assistant message on their next poll.

## Presence + push (Redis — no schema)

- Presence key `chat:presence:{conversationId}:{userId}` in Redis, value = ISO
  timestamp, TTL ~45s. Set/refreshed on every poll and on conversation open.
- When a shared message carries `mentionedUserIds`, for each mentioned member
  **without** a live presence key → `NotificationsService.sendToUser(memberId,
  title, body, { type, conversationId, accountId }, 'chat_mention')`.
- Add `chat_mention` to `NotificationType`
  (`packages/shared-types/src/entities/index.ts`). Gate it under the **existing**
  `notifySharedActivity` user preference in `notifications.service.ts`
  (`sendToUser`/`sendToUsers` filters) — no new preference/migration/toggle.
- Localized title/body added to `notification-i18n.ts` for all 8 languages
  (e.g. title "{senderName} mentioned you", body the message preview).

## Mobile (`apps/mobile`)

- **shared-types / DTOs** (`packages/shared-types`): `ChatConversation` gains
  `accountId`, `isShared`; `ChatMessage` gains `senderUserId`, `senderName`,
  `mentionedUserIds`. Chat API request/response shapes updated.

- **SQLite** (`src/db/schema/index.ts` + `src/db/chatRepository.ts`): add
  `account_id`, `is_shared` to the conversations table; `sender_user_id`,
  `sender_name`, `mentioned_user_ids` (JSON/text) to the messages table. Cache
  keyed by conversation as today.

- **`chatStore`**:
  - Messages carry `senderUserId`/`senderName`/`mentionedUserIds`; conversations
    carry `isShared`.
  - `sendMessage(content, mentions?)` passes `mentions` and (on first message of a
    new shared conversation) `isShared`.
  - `pollNewMessages(since)` + `startPolling()/stopPolling()` — ~4s interval,
    appends new messages deduped by id. Started/stopped via `useFocusEffect`
    **only when the open conversation `isShared === true`**.
  - `setConversationShared(id, isShared)` calls the PATCH endpoint (owner only).

- **Chat UI** (`app/(tabs)/chat.tsx`):
  - Conversation header shows a **"Shared" badge**; for the **owner** it's a
    toggle (private ⇄ shared). Toggle/badge hidden when the account has no other
    members.
  - In a shared conversation, other members' messages render left-aligned with a
    **name label + colored avatar**; own messages right-aligned (today); AI keeps
    the sparkle avatar.
  - An **`@`-triggered inline suggestion bar** lists account members (from
    `accountStore.members` / `loadMembers`); selecting one inserts an `@Name` chip
    and records the `{ userId }` mention sent with the message.
  - History list marks shared conversations with a small group icon.

- **Members source**: `accountStore.loadMembers(accountId)` already provides the
  member list (with user names) for the mention picker and sender-name display.

## i18n / docs

- New `chat.*` strings (shared badge, "shared conversation", mention hint,
  member-mention placeholder, etc.) added to **all 8 locale files**
  (`en, de, es, fr, pl, ru, ua, be`).
- New `chat_mention` notification strings in `notification-i18n.ts` (8 languages).
- Update `CLAUDE.md` (AI module + mobile sections) and add/extend a help section
  via the help-content workflow.
- Create the `ABA-{N}` GitHub issue at the end (per project convention) and update
  `user_docs/`.

## Implementation order (per CLAUDE.md dependency order)

1. `packages/shared-types` — entity + DTO additions.
2. `apps/api/prisma/schema.prisma` — columns + migration + backfill; `prisma generate`.
3. `apps/api/src/modules/ai` + `notifications` — service/controller logic,
   presence, push, `chat_mention` type, i18n.
4. `apps/mobile/src/db` — SQLite schema + repository.
5. `apps/mobile/src/stores/chatStore.ts` — sender/mention fields, polling, toggle.
6. `apps/mobile/src/services` (chat api) — new params/endpoints.
7. `apps/mobile/app/(tabs)/chat.tsx` — UI (badge/toggle, mention bar, attribution).
8. `apps/mobile/src/i18n/locales/*` — 8 locales.
9. Docs: CLAUDE.md, help section, `ABA-{N}` issue.
