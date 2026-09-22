# Chat conversation management

*Hub: [ai-features](../ai-features.md)*

## What this is

Rename, delete and pin a chat conversation, plus a legible sharing control — on both the phone and
the desktop web layout.

## Entry points

- `PATCH /ai/chat/conversations/:id/title`, `DELETE /ai/chat/conversations/:id`,
  `PUT /ai/chat/conversations/:id/pin`
- `apps/api/src/modules/ai/utils/conversation-list.ts` — `mergeConversationLists`
- `apps/mobile/src/components/chat/desktop/ConversationRowMenu.tsx`, `RenameConversationDialog.tsx`
- `apps/mobile/src/components/chat/ChatHistorySheet.tsx` — the phone's row menu

Migration: `20260907120000_add_chat_conversation_pins`.

## Key concepts

**Rename and delete mirror `setConversationShared` exactly, including its order**:
`findFirst({ id, accountId })` → 404, *then* `conversation.userId !== userId` → 403. That order is
deliberate existence non-disclosure and must not be tidied into one query.

**The delete is hard**, with no undo and no bot cleanup — safe *because* `chat()` self-heals an
unresolvable conversation id by creating a new conversation. A soft delete would instead leave all
three bots appending to a deleted row.

**The pin is per viewer**, in a side table keyed `(user_id, conversation_id)`.

## Invariants

**The rename writes `updatedAt: conversation.updatedAt` back explicitly.** Prisma's `@updatedAt`
honours a value present in `data` and bumps only when the field is absent, so without it renaming
teleports the row to the top of both surfaces.

**The pin is a side table, not a column, because the list is heterogeneous.** `getConversations`
filters `OR: [{ isShared: true }, { userId }]`, so a column would (a) deny a pin to the non-creator
whose row otherwise carries **zero** actions — a pin is the one affordance that makes sense on
someone else's conversation — and (b) turn a creator's pin into shared state nobody else can undo.

**The pin endpoint is deliberately not a `/shared` sibling.** Its predicate is read visibility with
**no** ownership check, because `/shared`'s own `{ id, accountId }` lookup would let a member pin —
and thereby confirm the existence of — a co-member's *private* conversation.

**The pin is part of the QUERY, never a client sort.** A client sort silently loses any pin outside
the twenty most-recently-updated, so `getConversations` runs a second unbounded query for the
caller's pinned set and merges. Client-side, `sortConversationsForDisplay` must run before
`pinnedGroupBoundary` reads a list — that function TRUSTS an already-ordered list.

**Row hover and control hover are two independent booleans.** React Native Web fires the ROW's
hover-out when the pointer moves onto a child, so a single flag goes false exactly as the cursor
reaches the control, which vanishes under the approaching mouse and cannot be aimed at. It also
produced a second symptom: the selected row kept its control while every hovered row's disappeared,
so the only stable `⋯` on screen sat on a row the cursor was not on.

**The control is rendered always and revealed by opacity**, never conditionally rendered — which
would make the title re-truncate under the cursor — and it stays in the tab order at `opacity: 0`
so a keyboard user reveals it via `onFocus`. Reveal on row-hover **or** control-hover **or** focus
**or** `selected`; the last is the whole answer for a touch tablet at ≥1024, which has no hover.

**On the phone the row menu is a plain `View` inside the sheet's overlay**, not a `Modal` (nested
is flaky on iOS) and not inside the sheet body, whose `maxHeight: '70%'` would confine it. It needs
its own full-screen transparent scrim plus a swallowing `onPress` on the menu container, because RN
bubbles an unclaimed touch to the nearest ancestor responder — and the overlay is itself a
`Pressable` that closes the whole sheet.

**`onRequestClose` must branch on whether the menu is open.** Android hardware back dismisses the
topmost layer: the menu first, the sheet on a second press. A bare `onClose` there is a real defect —
the menu survives and the next open renders it unprompted.

**Two simultaneously-presented `Modal`s on the phone are fine and precedented.** The rename dialog
mounts as a *sibling* of the sheet's own, exactly as the shopping-list screen already does. Closing
the sheet first would cost the user their place in the list for a safety the shipped app shows is
unnecessary.

**`accountMembers.length === 0` means unknown or failed, never "single-member".** The current user
is always a member of their own account, so a real single-member account reads `1`. Both render
nothing, which is the safe direction.

**The sharing control is two segments, both always visible**, at zero new i18n keys; pressing the
already-active segment is a deliberate no-op. The phone does **not** get it — two labelled segments
need ~170px against ~110px available at 360px width — so it gets a glyph inside the existing pill,
and only when `canToggleShared`.

## Known gaps

- Unpinning a conversation outside the recent-twenty window leaves the row in the in-memory list
  until the next `loadConversations()`: the optimistic path re-sorts but never removes a row, which
  is right for pinning and narrow for unpinning. Self-healing.
- `ConversationRowMenu` has no `numberOfLines` cap and a fixed estimated height, so a longer label
  may wrap and under-estimate the popover at an extreme viewport edge.
- No key is bound to Delete or Unpin; a pin has no cap and no "Pinned" group header.
- `chat.private` still reads as a privacy word rather than a scope word (`Only me`). Changing its
  value renders outside this feature, so it is the product owner's call.

## History

ABA-514.
