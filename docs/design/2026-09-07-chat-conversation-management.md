# Chat conversation management — rename, delete, pin, and making sharing obvious

Four product-owner requests that land on the same two row surfaces — the
desktop `ConversationRail` and the phone's `ChatHistorySheet` — and therefore
have to be designed once rather than four times. Extends the "The conversation
rail" section of `docs/design/2026-09-07-chat-desktop-web.md`.

Everything below was read out of the code. Where a claim is arithmetic on a
stated font advance, or a judgement only a person on the deployed build can
settle, it says so.

## Corrections to the briefs

**One line reference is off.** The rail's shared indicator is
`ConversationRail.tsx:162`, not `:169` (169 is `const createStyles`). The
substance is exactly right: it is `size={12}` there against `size={14}` in
`ChatHistorySheet.tsx:56`, so the big screen's indicator is genuinely smaller
than the phone's.

**Everything else in both briefs checks out**, including the details it would
have been easy to get wrong: `setConversationShared` really does resolve
`findFirst({ where: { id, accountId } })` and 404 **before** the
`conversation.userId !== userId` 403 (`chat.service.ts:449-456`); the chip
really is gated on `hasOtherMembers` (`accountMembers.length > 1`) and
interactive only on `canToggleShared = hasOtherMembers && currentIsOwner`
(`useChatScreenData.ts:83`); `ChatMessage.conversation` really is
`onDelete: Cascade` with no soft-delete column anywhere on either model; and
`getConversations` really is `where: { accountId, OR: [{ isShared: true }, {
userId }] }, orderBy: { updatedAt: 'desc' }, take: 20`.

**Seven facts the briefs did not have, five of which changed a decision.**

1. **Per-row ownership is already on the client.** `getConversations` returns
   `isOwner` per row (`ChatConversationSummary.isOwner`), and
   `chatStore.loadConversations` already stores
   `ownedConversationIds: remote.filter(c => c.isOwner).map(c => c.id)`. So
   deciding actionability per row needs **no new API field** — only a read of a
   store field that has existed since shared chats shipped and is currently
   used for exactly one thing (`currentIsOwner`).
2. **…but the SQLite cache cannot answer ownership, because it is written
   wrong.** `loadConversations` maps every remote row with `userId` set to the
   *current* user (`chatStore.ts:293-301`) and `upsertConversation` persists it,
   so another member's shared conversation is cached under **my** id. Its
   `getConversations` query is `WHERE user_id = ? OR (is_shared = 1 AND
   account_id = ?)`, and the same mapper writes `accountId: undefined` →
   `account_id = NULL`, so the cache is also not account-scoped for own rows.
   Consequence for this design: on the phone's cache-first paint,
   `ownedConversationIds` is empty until the network answers, and the row menu
   must be **absent rather than wrong** in that window. Recorded as a defect
   under "Findings outside this design's scope" — do not fix it inside this
   work.
3. **A hard delete cannot break the bots, and this is the fact that makes hard
   delete defensible.** All three bots persist a `conversationId` in their link
   state (`TelegramUserState.conversationId`,
   `linkService.updateConversationId`), so a deleted conversation leaves a
   dangling reference in `telegram_links` and the WhatsApp/Slack equivalents.
   But `ChatService.chat()` resolves `findFirst({ id, accountId, OR: [...] })`
   and, on `!conversation`, **silently creates a new one**
   (`chat.service.ts:110-117`); each bot then notices
   `response.conversationId !== conversationId` and re-stores it. So the next
   bot message starts a fresh conversation with no error surface. **A plan must
   not add bot cleanup.**
4. **`AlertDialogHost` already implements `style: 'destructive'`** as a
   `theme.colors.danger` fill with `theme.colors.onSemantic` text, with the
   `textInverse`-is-accent-derived reasoning in a comment on the line
   (`AlertDialogHost.tsx:78-95`). So the "must survive all 13 accents"
   constraint is satisfied by *using `showAlert` and authoring no button*, not
   by picking a colour.
5. **The anchored-popover and focusable-twin patterns already ship.**
   `expenses/desktop/RowContextMenu.tsx` is a viewport-clamped popover on RN's
   own `Modal` with a raw `<div>` scrim, and `TransactionTable.tsx`'s
   `RowMenuButton` keeps a `⋯` **in the tab order at `opacity: 0`**, revealing
   it via `onFocus`, with `accessibilityLabel={t('expensesDesktop.rowActions')}`
   and both a `⋯`-click and an `onContextMenu` path into the same menu. This
   design reuses the *pattern*, not the file — see "What a plan must not do".
6. **`common.deleteConfirmTitle` is literally `'Delete Transaction'`** and
   cannot be reused for a conversation. `common.deleteConfirmMessage` —
   `'Are you sure? This action cannot be undone.'` — is generic and is reused.
7. **A rename would teleport the row to the top of the list.**
   `ChatConversation.updatedAt` is `@updatedAt`, and both surfaces order by it,
   so a plain `update({ data: { title } })` re-sorts a three-week-old
   conversation to position one. The rename must write `updatedAt` back
   explicitly. (`/shared` has the same behaviour today; left alone — sharing is
   an event, a rename is not.)

## Goal

Give a conversation the three things a document needs — a name you chose, a way
to throw it away, and a way to keep it where you can find it — on both
surfaces, without letting a destructive, cross-member action hide behind a
generic "are you sure"; and make a conversation's sharing state legible enough
that a household actually discovers the feature.

## What each affordance becomes

| Today | Desktop rail | Phone history sheet | Why |
|---|---|---|---|
| A row is a single-action `Pressable` (select) | Row keeps select; gains a hover/focus/**selected**-revealed `⋯` opening an anchored popover; right-click on the row opens the same popover | Row keeps select; gains a **permanently visible** trailing `⋯` opening an in-sheet action overlay; long-press on the row opens the same overlay | Hover does not exist on the phone, and a desktop affordance reachable only by hover is unreachable by keyboard (§2/§5) |
| — (no rename) | `⋯ → Rename` opens `RenameConversationDialog` | Same item, same dialog | One dialog for both platforms, so there is nothing to drift — see decision 3 |
| — (no delete) | `⋯ → Delete` (danger) → `showAlert` confirmation | Same | `showAlert` is the only confirmation that renders on web (§3), and it already owns the destructive styling |
| — (no pin) | `⋯ → Pin` / `Unpin`; pinned rows sort first, leading icon becomes `pin` | Same | Per viewer, not per conversation — see the pin fork |
| Shared state: a 12px `people` glyph on line 1 (rail) / 14px (sheet) | Icon **and** the existing `chat.shared` word move to line 2 beside the date; line 1 becomes uniform `[icon][title][⋯]` | Unchanged 14px trailing glyph (a one-line row has no room for a word) | Request 3 for a list is about scanning 20 rows; an icon+word composite reads at a glance and returns 20px to the title |
| Sharing control: one filled pill showing the *current* state only | Two-segment control, both options visible, current one filled | Same pill, plus a `swap-horizontal` glyph when it is interactive | A single filled pill is a status badge; the segmented control does not fit the phone's top bar — see decision 5 |
| Sharing control for a non-creator | Static single chip, unchanged | Static single chip, unchanged | A non-creator can only ever see **shared** conversations, so their state is always `Общий` and always read-only — determined, not designed |
| Sharing control on a single-member account: absent | Absent | Absent | Correct, and argued in decision 5 — not an oversight to fix |
| Order: `updatedAt desc`, 20 rows | Server-supplied order: pins first, then `updatedAt desc`; one divider only when both groups exist | Same order, same divider rule | The pin must be in the **query**, never a client sort — see the pin fork |

## The pin fork — ruled: per viewer

**Per viewer, in its own join table.** The cheap column on `ChatConversation`
is rejected, and the argument that decides it is a property of *whose rows are
in this list*.

`getConversations`' `OR: [{ isShared: true }, { userId }]` means the list is
**heterogeneous**: it contains other people's shared conversations, and
`isOwner` exists precisely to tell them apart. So a pin-as-column produces two
outcomes that are both wrong:

- **The user who most needs a pin cannot have one.** A non-creator reading the
  household's "Grocery budget" every day cannot rename it, cannot delete it,
  and under a creator-only pin cannot pin it either. Their row would carry zero
  actions. A pin is the *only* affordance that makes sense for someone else's
  conversation, and a column takes it away from exactly them.
- **A creator pinning their own shared conversation pins it for everyone**,
  permanently, with no affordance for anyone else to undo it. That is a
  shared-state write wearing the costume of a personal preference. Sharing
  itself has that property and it is fine there — sharing *is* about other
  people. Ordering my own sidebar is not.

The precedent in this codebase points the same way, and it is structural rather
than rhetorical: the app already treats display currency, theme mode and accent
as per-`User`, and `exchange_rate_watches` is a per-`userId` side table with
**no `accountId` at all**, described in its own design as "a personal watch";
`user_payment_methods` is the same shape. A small per-user join table is an
established pattern here, not a novelty.

The honest cost of choosing it: the pin endpoint is **not** a sibling of
`/shared`, because it does not touch `ChatConversation` and its permission is a
different rule (below), and `getConversations` needs a second query. That is
the whole difference. It does not buy a wrong semantic.

### The model

```
model ChatConversationPin {
  userId         String   @map("user_id")
  conversationId String   @map("conversation_id")
  pinnedAt       DateTime @default(now()) @map("pinned_at")

  user         User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  conversation ChatConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@id([userId, conversationId])
  @@index([userId])
  @@map("chat_conversation_pins")
}
```

The composite id **is** the uniqueness constraint and the dedup, so pinning is
idempotent as `createMany({ data: [row], skipDuplicates: true })` (the
`WalletCurrencyService.ensureCurrencies` convention) and unpinning is
`deleteMany({ where: { userId, conversationId } })`, which is idempotent and
404-free. Neither runs inside a `$transaction` — a constraint violation would
poison it (ABA-313/401).

**No `accountId` column.** Pins are per-account *by construction*: the
conversation carries the account, and `getConversations` filters on it, so a
pin can only ever surface in the account whose conversation it points at.
Adding one is the obvious-looking wrong move.

### The two questions the fork carries

**A deleted conversation** takes its pins with it — `onDelete: Cascade`, the
same mechanism that makes the message delete safe. Nothing to design, nothing
to clean up.

**A conversation unshared by its creator keeps its pin, and the pin must not be
deleted.** Once `isShared` goes false, `getConversations`' `OR` stops matching
for every non-creator, so the row leaves their list and the pin has nothing to
order — it is *inert*, not broken. If the creator re-shares, the row comes back
**still pinned**, which is the friendly outcome and costs no code. Deleting the
pin on unshare would silently destroy a preference in response to a reversible
action, and is explicitly forbidden below. It leaks nothing: a pin row is never
returned to anyone but its owner, and the conversation row stays behind the
existing visibility filter.

### The permission is read visibility, NOT the creator rule

This is the one place where "mirror the sharing toggle" is wrong, and it must
be loud in the plan: rename and delete are **creator-only**, and pin is
**anyone who can see the conversation**. So the pin endpoint resolves with
`getConversationMessages`' predicate —
`findFirst({ where: { id, accountId, OR: [{ isShared: true }, { userId }] } })`
→ 404 — and then performs the write with no ownership check. Using
`findFirst({ id, accountId })` there (the `/shared` predicate) would let any
account member pin a co-member's **private** conversation, and the round trip
would confirm its existence.

### The pin has to be in the query

`take: 20` ordered by `updatedAt desc` means a conversation pinned three months
ago is **not in the payload at all**, so a client-side sort of what arrives
would make the pin silently do nothing — the same failure this branch already
found in the deep-link path, where a conversation outside that window cannot
resolve its own title. Two queries, then a merge:

1. **Pinned:** `chatConversation.findMany({ where: { accountId, OR: [{ isShared:
   true }, { userId }], pins: { some: { userId } } }, orderBy: { updatedAt:
   'desc' } })` — deliberately **unbounded**; see the note below.
2. **Recent:** today's query, byte for byte, `take: 20`.
3. **Merge** in a pure, unit-tested API util
   (`modules/ai/utils/conversation-list.ts`, `mergeConversationLists`): pinned
   block first, then recent minus anything already in the pinned block, dedupe
   by `id`. Both blocks arrive already `updatedAt desc`. Payload = 20 + P rows,
   each carrying a new `isPinned: boolean`.

Start both queries from `chatConversation` (not from the pin table) so **one**
mapper produces both blocks; two mappers over the same shape is how the two
blocks acquire different fields.

**Rejected, because it compiles and looks right:**
`orderBy: [{ pins: { _count: 'desc' } }, { updatedAt: 'desc' }]`. Prisma's
relation-`_count` ordering takes no `where`, so it would order by *how many
people pinned it*, not by whether **I** did. Also rejected: a raw-SQL
`LEFT JOIN … ORDER BY (pin IS NOT NULL) DESC` — correct, but services here do
not use raw SQL.

**Within the pinned block the order is `updatedAt desc`, not `pinnedAt desc`,**
and this is a deliberate trade. `pinnedAt desc` is more stable (a pinned block
that never reshuffles), but it needs `pinnedAt` exposed in the payload **and**
mirrored into SQLite, or the phone's cache-first paint would order the pinned
block one way and then visibly reshuffle it when the fetch lands. Ordering both
groups by `updatedAt` makes the pin a **partition key, not a sort key**, gives
the whole rail one rule ("pins first, then recency"), and lets the cache
reproduce the server's order exactly from a single boolean column. `pinnedAt`
is stored but never ordered on. The cost, stated: a pinned shared conversation
rises within the pinned block when a co-member posts.

**No product cap on pins, and no `MAX_PINNED`.** A cap needs a number in two
places (the API has no build step and cannot import a shared runtime constant)
plus a seventh i18n string to explain itself, and it bounds no server work —
the pinned query is scoped to one `userId` behind an indexed FK, and the only
way to grow it is to click Pin. The one thing a cap would buy is preventing "a
rail where everything is pinned", which users self-regulate. If a bound is ever
needed it must arrive with a visible `+N more`, never a silent `take` that
drops the oldest pins (§5g: truncation must be unrepresentable as silent).

### What the rail shows

**Pinned rows first, no group header, and one divider only when both groups are
non-empty.** A header costs a seventh i18n key and states what the rows already
show; a pinned row is marked by its **leading icon becoming `pin`**, which
costs nothing because the `chatbubble-ellipses-outline` it replaces carries no
information at all — every row in this list is a conversation. That swap is
strictly more informative at zero width, and it is the same on both surfaces.

The divider is a pure function of the ordered list, so it belongs in
`chatLayout.ts` rather than in JSX: `pinnedGroupBoundary(conversations): number
| null` returns the index after which to draw it, and `null` when either group
is empty. Everything pinned → no divider. Nothing pinned → no divider. Both →
one.

**Pinning survives an account switch by construction and needs no new code.**
`accountStore.clearAccountScopedCaches()` already calls `chatStore.reset()` on
the `[currentAccountId]` subscription (teardown), and `ChatDesktop`'s
`[currentAccountId]` effect already refetches (refill, the §5i idiom) — so the
new account's list arrives with its own pins already ordered by the server.

## Decision 1 — where the actions live on a rail row

**A hover/focus/**selected**-revealed `⋯` at the row's right edge, opening an
anchored popover; plus `onContextMenu` on the row into the same popover.** The
alternatives and why they lose:

- **Two or three hover-revealed icons.** Each needs its own focusable twin, and
  the row has 231px of content width (280 − 1 border − 24 scroll padding − 24
  row padding). Three icons plus a two-line title is a toolbar in a sliver.
- **Long-press.** Works with a mouse in react-native-web, but
  `ChatMessageItem` already owns long-press for copy on this screen, and a
  management action that exists only behind a 400ms press is undiscoverable on
  the surface that has a perfectly good pointer.
- **Inline edit on double-click.** Rejected with rename in decision 3.

The `⋯` is **opacity-gated, never conditionally rendered** — `RowMenuButton`'s
shipped shape — and here that matters for a second reason beyond keyboard
reachability: conditional rendering would change the title's available width on
hover, so the title would visibly re-truncate under the cursor. With the slot
reserved, every title is 183px wide, always.

**Touch at ≥1024 — a tablet in landscape gets the desktop layout and has no
hover.** This is where the design deliberately diverges from the ledger, whose
`⋯` is `hovered || focused` and therefore invisible to a touch tablet (it still
*responds* to a tap at `opacity: 0`, which is worse than absent). The rail adds
a third reveal condition: **the selected row's `⋯` is always visible**. That
gives touch a guaranteed path — tap the row to read it, which you were doing
anyway, and the menu button is there — with no hover-capability detection, no
media query, and no new state. It helps the mouse too.
`revealed = hovered || focused || selected`.

Do **not** rely on `contextmenu` firing from a touch long-press: some browsers
emit it, some do not, and none of them is a design.

**Keyboard.** Tab order within a row is the row `Pressable`, then its `⋯` — 20
conversations is 40 stops, the same arithmetic the ledger already accepts. The
`⋯` reveals itself on `onFocus`, so a keyboard user finds a control rather than
activating an invisible one, and the anchor comes from the button's own
`getBoundingClientRect()` because a keyboard activation carries no pointer
position (`handleMenuButtonPress`' shape). Inside the popover, items are
`accessibilityRole="menuitem"` `Pressable`s, so Tab reaches them and Enter
activates; RN's `Modal` supplies the focus trap, `Escape` and focus
restoration.

**Which items a row's menu carries is decided by ownership, and the fourth
request changed this answer.** Before pin, a non-creator's row had no actions
at all and therefore no `⋯` — which left two rows in one rail with different
title widths. With pin scoped to read visibility, **every row has at least one
action, so every row has a `⋯`**, the slot is unconditional, and every title is
the same width. The fourth request resolved a wart the first three left.

- Creator's own row: `Pin`/`Unpin` · `Rename` · ─── · `Delete`
- Another member's shared row: `Pin`/`Unpin` only

A one-item menu is accepted rather than replaced by a direct pin button. A
direct button would have to be a *different control in the same position*
depending on the row's ownership, and on a pinned row the pin glyph is already
drawn as **state** — making that glyph pressable would create a control that
exists in only one of its two states. One affordance per row is what 231px can
carry.

## Decision 2 — the same, on the phone's history sheet

There is no hover, so nothing can be revealed. **A permanently visible trailing
`⋯` on every row, plus long-press on the row as a second path into the same
menu.** This is one of the three deliberate changes to the mobile rendering in
this design, and it is named as such.

Row geometry, at 360px: the sheet's rows are `paddingHorizontal: spacing[5]`
(20) → 320 content, currently `[icon 18 + 8][title flex, marginRight 12][shared
14 + 4] … [date]`. The `⋯` is a 20px glyph with `hitSlop` to a 44pt target —
`hitSlop` costs no layout — so the row spends about 28px and the title goes
from roughly 224px to roughly 196px, still comfortable for a
`numberOfLines={1}` title. The date stays; the row stays one line.

**Rejected: putting rename/delete/pin in the chat top bar instead**, acting on
the conversation you have open. It reads plausibly (on a phone you open a
conversation before wanting to manage it) and it avoids touching the sheet, but
the top bar already carries New Conversation, the sharing pill and History at
360px, and deleting the conversation whose transcript you are reading leaves
you staring at a dead screen. A list is where you tidy.

**The phone's menu is an in-sheet overlay, not a second `Modal`.**
`ChatHistorySheet` is itself a `Modal`; nesting another inside it is flaky on
iOS, and mounting one as a sibling in `ChatMobile` puts a second presented
modal over the first. Neither is necessary: inside an already-presented `Modal`
an overlay is just an absolutely-positioned `View`. It goes as the last child
of `styles.modalOverlay` — the full-screen `flex: 1` container, **not**
`styles.modalSheet`, whose `maxHeight: '70%'` would confine it — and the
sheet's own `onRequestClose` still handles the Android back button. The desktop
popover *is* a real `Modal`, because there it needs `Escape` and a focus trap.

Bottom inset: the overlay is bottom-anchored, so it needs
`useSafeAreaInsets().bottom` added to its padding (ABA-483), exactly as its
host sheet already does on line 76.

## Decision 3 — rename opens a dialog, not an inline edit

**A dialog, and the deciding fact is the width of a real title.** Titles are
auto-generated as `message.slice(0, 100)` (`chat.service.ts:114`), so a typical
row is *"What did I spend the most on this month?"* — 42 characters — and the
ceiling is 100. The rail's title box is 183px and the sheet's is about 196px.
Editing a 100-character string through a 190px window means dragging a caret
along a sliver. Inline editing is not a small dialog here; it is a worse
dialog.

Three further reasons, each independent:

- **Commit semantics.** Inline editing has to answer "does blur save?" — and on
  the phone the field would be inside a `FlatList` inside a `Modal` that closes
  on a scrim tap, so blur-to-save is a lost-edit trap and blur-to-cancel is a
  lost-edit trap the other way. Cancel/Save answers it once.
- **The keyboard.** The sheet is `maxHeight: '70%'` and bottom-anchored; a
  field in its lower rows sits under the keyboard. `SheetDialog`'s
  `keyboardAvoiding` prop exists for precisely this and cannot help a row
  inside someone else's list.
- **§5h's own test is "is this a leaf?", and this is one.** One field, Cancel,
  Save, nothing to navigate to, nothing to push. §3 applies cleanly, so the
  dialog is the *conforming* answer rather than a workaround.

**`RenameConversationDialog` is one component on `SheetDialog`**, which already
decides mobile-vs-desktop itself: a bottom sheet on the phone, a 480px centred
panel on desktop. Pass `keyboardAvoiding`, `titleId`, and **none** of the three
legacy escape hatches (`sheetStyle`/`handleStyle`/`scrimColor`) — it is a new
sheet and takes the canonical defaults.

**On §3's "a dialog HOSTS an existing component; it never reimplements one":**
there is no existing rename component to host, and that rule exists to stop a
desktop dialog re-authoring a mobile screen's edit behaviour. Here the dialog
**is** the one definition, rendered by both platforms — which is a stronger
guarantee than hosting, because there is no second implementation for it to
drift from.

Contents: a single-line `TextInput` prefilled with the current title (empty
when the title is null), `maxLength={100}` to match what the server
auto-generates, `chat.conversationUntitled` as the placeholder — it is
literally the fallback title, so it is the honest placeholder — and Cancel /
Save. **Save is disabled when the trimmed value is empty or unchanged**:
unchanged would spend a request to write what is already there, and empty would
leave the row reading "Conversation" one second after the user deliberately
named it. Clearing a title back to null is therefore not offered, and the
endpoint's contract stays narrow (`{ title: string }`, non-empty, ≤100).

## Decision 4 — what confirms a delete

**`showAlert` with a `style: 'destructive'` button, and two messages.**

`showAlert` is the only confirmation that renders on web (§3/§5a — found
twice), and `AlertDialogHost` already paints a destructive button
`theme.colors.danger` with `theme.colors.onSemantic` text. So the "must survive
all 13 accents" requirement is met by **authoring no button at all**. A
hand-rolled red button is forbidden below; ABA-450 is what that costs.

```
title:   chat.deleteConversationTitle          "Delete conversation?"
message: private → common.deleteConfirmMessage "Are you sure? This action cannot be undone."
         shared  → chat.deleteSharedConversationMessage
                   "This conversation is shared. Deleting it removes it for
                    everyone in this account, along with their messages.
                    This cannot be undone."
buttons: [ common.cancel (style 'cancel'), common.delete (style 'destructive') ]
```

**Is creator-only enough of a guard on its own? No — and the reason is specific
rather than cautious.** Creator-only answers *who may*, not *whether they
understood*. The creator of a shared conversation is not its only author:
`ChatMessage.senderUserId` and `mentionedUserIds` are populated per message and
`getConversationMessages` resolves co-members' names for display, so a shared
transcript contains other people's words. Deleting it destroys content the
deleter did not write, for people who receive no notification of it.
Creator-only plus a generic "cannot be undone" would let that happen behind a
sentence that never mentions the other people. **The two-tier message is the
guard.**

**One tier of confirmation, not two.** Explicitly rejected: a
type-the-title-to-confirm step. That is for irreversible account-level
destruction; a user tidying twenty conversations would find it hostile, and
hostility in a routine action trains people to click through the real warnings.

**Rejected: soft delete and undo.** An `isDeleted` column on
`ChatConversation` means every read path grows a filter — `getConversations`
(both queries now), `getConversationMessages`, `pollMessages`, `chat()`'s own
`findFirst`, plus the SQLite mirror — and it makes the bots *worse*, not
better: their stored `conversationId` would resolve to a deleted row and keep
appending to it, where today it fails to resolve and self-heals into a fresh
conversation. Hard delete with a truthful confirmation is the smaller and more
honest system, and fact 3 above is what makes it safe.

**The post-delete state must be handled explicitly, or the screen lies.** If
the deleted conversation is the open one, the client removes the row from
`conversations` **and** calls `startNewConversation()` — which clears
`currentConversationId`, `messages`, `currentIsShared` and `currentIsOwner`.
Without it: `ChatDesktop`'s `[currentConversationId]` effect fires a pointless
refetch, `currentConversationTitle` returns null so the title bar falls back to
"Conversation", and the transcript keeps painting a conversation that no longer
exists.

**What cannot be fixed here, and is named rather than designed around:** a
co-member with that shared conversation open keeps their transcript until they
navigate away — `pollNewMessages` catches its own errors, so the 404 from the
next poll is silent. Telling them would need a push, and a push saying "someone
deleted a conversation" is worse than the stale screen. Open question, not
scope.

## Decision 5 — making sharing obvious

**Diagnose before designing: there are four reasons it is missed, and a bigger
icon answers none of them.**

1. **It is not where the decision is made.** You decide to share when you are
   about to ask something the household should see — at the composer, or when
   starting a conversation — not by scanning a chip in the top-right corner.
2. **A single filled pill is a status badge, not a switch.** `sharedToggle`
   already has `backgroundColor: surfaceSecondary` and `borderRadius.lg`, so
   the problem is *not* a missing track: it is that only one option is ever
   visible and there is no glyph saying anything would happen if you pressed
   it. Compare `CurrencyPill`, which carries a `▾`.
3. **It is absent exactly when it would teach you.** `hasOtherMembers` is
   `accountMembers.length > 1`, and `members[accountId]` is `undefined` until
   `loadMembers` resolves — so the pill *appears late*. Worse, on web
   `loadMembers`' catch falls back to a SQLite mock that returns `[]`, so a
   failed `getMembers` reads as a single-member account and the control never
   appears at all.
4. **The word collides.** `chat.private` is `Личный` and `accounts.personal` is
   `Личный`.

### (a) The chip becomes a two-segment control — desktop only

`[ 👤 Личный | 👥 Общий ]`, both options always visible, the current one filled
with `primary`, the other quiet on `surfaceSecondary`. This is the single
highest-value change and it costs **no new key**: it renders `chat.private` and
`chat.shared`, both of which already exist in nine locales. An unshared
conversation now *shows* that "Общий" is a thing you could choose — which is
reason 1 and reason 2 answered at once, and it weakens reason 4 for free,
because `Личный` beside `Общий` in one track reads as a pair of options about
this conversation, where `Личный` alone beside an account name reads as an
account type.

**It does not fit the phone, measured rather than assumed.** `ChatMobile`'s top
bar is `paddingHorizontal: spacing[4]` (16) with `topBarRight` `gap:
spacing[2]`, holding "New Conversation" (icon + `bodySm` label) on the left and
the pill plus "History" (icon + `bodySm` label) on the right. At 360px that
leaves roughly 110px for the pill against roughly 170px that two labelled
segments need at Montserrat's advance. Cramming it in would truncate one of the
two words, which is worse than today.

### (b) So the phone gets the cheapest honest fix instead

A `swap-horizontal` glyph inside the existing pill **when and only when
`canToggleShared`** — about 18px inside a pill that already exists, no layout
change, no new string. It says "pressing this switches to the other one", and
it makes the creator's control visually distinct from the non-creator's badge,
which today are identical apart from colour. Named as a deliberate mobile
change.

That platform divergence is precedented and it is a measurement, not a taste:
§5a licenses moving or dropping *presentation* per platform, and the shipped
chat design already made History desktop-absent and the rail desktop-only.

### (c) The rail row states sharing in words

Line 1 becomes uniformly `[icon][title][⋯]`; the shared indicator moves to line
2 as `👥 Общий · 3 сент`, at **14px**, matching the phone. Three things at
once: 20px of title width returned, the state legible rather than glyph-only,
and the rail/sheet size parity defect fixed — as a by-product rather than as
the answer, because a 12→14px glyph was never going to answer this request.

Line 2 has room: it currently holds only a date in `caption` (11px), and
`Общий · 3 сент` is roughly 90px inside 183px+.

This is icon-plus-label, which is what the title-bar chip itself is — not the
§5a redundancy the shipped design already ruled on (the row icon is a property
of *another* conversation; the chip is a control for *this* one).

The phone's sheet keeps its trailing icon only: a one-line row with a date and
a `⋯` has no room for a word, and the phone's answer to request 3 is (b).

### (d) The free lever, which is why (a) beats a bigger icon

`chat()` honours `initialIsShared`, and `chatStore.setConversationShared` on a
fresh conversation (`currentConversationId === null`) sets local state with **no
server call** — so the control on an empty chat already decides how the
conversation will be *born*. Nobody notices today because it is a dim
single-state badge in a corner. As a two-segment control beside the title, it is
a visible pre-flight choice. **No new mechanism at all.**

### (e) The non-creator case is determined, not designed

`getConversations` filters `OR: [{ isShared: true }, { userId }]`, so **a
non-creator can only ever see shared conversations**. Their state is therefore
always `Общий` and always read-only, and the control degrades to exactly
today's static single chip: the filled segment only, no second segment, no swap
glyph. Nothing to decide and nothing changes for them.

### (f) The single-member account: absent is right, and stays absent

On an account with one member, sharing has no referent — there is nobody to
share with. A disabled toggle would advertise a feature the user cannot use and
cannot interpret ("share with whom?"), and the surface for "you could share
this if you invited someone" is the account/invite flow, which already exists.
**Keep it absent.**

What *is* wrong is reason 3: `accountMembers.length` collapses three states
into one. The discriminator needs no new store field, because **`0` is never a
legitimate answer** — the current user is always a member of their own account
— so `0` means "not loaded, or the fetch failed" and `1` means "genuinely a
single-member account". The behaviour does not change (both render nothing,
which is the safe direction); what this design adds is a comment at the read
site saying so, because the next person to write `length <= 1 → definitely
single` will be wrong. A retry is deliberately not folded in.

### (g) Copy

Recommended and **not** done here: `chat.private` → a scope word rather than a
type word. With both segments visible the pair should read as a scope pair —
`Только я` / `Общий`, `Only me` / `Shared`, `Tylko ja` / `Udostępniona`. That
is one existing key's *value* changed in nine locales, not a new key, and it is
a separately authorised change exactly as the shipped design already
recommended. (a) mitigates the collision without it.

## Decision 6 — i18n: exactly six new keys, all in `chat.*`

Reused, verified present in all nine locales: `common.cancel`, `common.save`,
`common.delete`, `common.deleteConfirmMessage`, `chat.shared`, `chat.private`,
`chat.conversationUntitled`.

New:

| Key | Used for | Why nothing existing serves |
|---|---|---|
| `chat.renameConversation` | the menu item **and** the dialog title | `common.edit` is "Edit" — vague, and would be the app's only "Edit" meaning "change the title". `merchants.rename` is another feature's namespace |
| `chat.deleteConversationTitle` | the confirm title, **both** tiers | `common.deleteConfirmTitle` is literally `'Delete Transaction'` |
| `chat.deleteSharedConversationMessage` | the shared-delete message | This string *is* decision 4's guard. Nothing can be borrowed for it, and reusing the private message is the one thing this design must not do |
| `chat.conversationActions` | the `⋯` `accessibilityLabel` | `expensesDesktop.rowActions` is a desktop-table namespace; this button exists on **both** platforms |
| `chat.pinConversation` | menu item | No `pin` key exists anywhere in the locale files (checked) |
| `chat.unpinConversation` | menu item | One key cannot honestly cover both states of a toggling label |

**Six is the floor, and the zero-key alternative is not neutral.** It is either
(a) shipping none of these actions, or (b) labelling them with borrowed strings
("Edit", "Delete Transaction") behind a delete confirmation that lies by
omission about shared conversations. Three of the six exist *because* the
actions are new and one of them is destructive and cross-member.

**`chat.*`, not a new `chatDesktop.*`.** `expensesDesktop.*` exists for strings
only a desktop table has — column headers, facet groups. All six of these
render on the phone too.

Three keys were considered and cut: a "Pinned" group header (the pin glyph and
the position already say it), a pin-limit message (no cap — see the fork), and
a "why can't I rename this" explanation for non-creators (a non-creator sees no
rename affordance, so there is nothing to explain).

## Layout

### The rail row, at every desktop width

The rail is **width-invariant across the whole desktop band** — the shipped
design gives it a fixed `CHAT_RAIL_WIDTH` at every width from 1024 up, and only
the transcript column reflows. So there is one wireframe, not two.

```
CHAT_RAIL_WIDTH = 280
280 - 1 border - 24 (scrollContent pad) - 24 (row pad) = 231 content

+----------------------------------------------+
| (+) Новый разговор                           |   inert on a fresh conversation
|----------------------------------------------|   existing divider
| РАЗГОВОРЫ                                    |   chat.historyTitle
|                                              |
| [pin ] Продукты за август           [...]    |  <- pinned, selected:
|        (people) Общий · 3 сент               |     [...] always visible
| [pin ] Бюджет на ремонт             [...]    |  <- pinned
|        1 сент                                |
|- - - - - - - - - - - - - - - - - - - - - - - |  <- boundary divider: ONLY
| [chat] Где дешевле молоко           [...]    |     when both groups exist
|        28 авг                                |
| [chat] Итоги за июль                [...]    |  <- another member's shared row:
|        (people) Общий · 24 авг               |     menu has Pin/Unpin only
+----------------------------------------------+

line 1  leading 16 + gap 6 + title + gap 6 + menu 20  = 231  ->  title 183px
        the menu slot is RESERVED (opacity-gated), so 183 never changes
line 2  people 14 + gap 4 + chat.shared + " · " + date, in caption (11px)
leading icon  `pin` when pinned, else `chatbubble-ellipses-outline`
```

### The row menu (desktop) — an anchored popover

```
        Продукты за август           [...]  <- anchor: getBoundingClientRect()
                                     +---------------------------+
                                     | (pin-outline)  Закрепить  |
                                     | (create-outline) Переим…  |
                                     |---------------------------|
                                     | (trash-outline)  Удалить  |  danger
                                     +---------------------------+

width 176, viewport-clamped both axes, RN `Modal`, raw <div> scrim.
Another member's shared row: the first item alone, no divider.
```

### The title bar's sharing control (desktop)

```
| 20 |<----------------------- 760 column ----------------------->| 20 |
|    Продукты за август            [ (person) Личный | (people) Общий ] |
                                     ^ filled `primary`  ^ quiet
non-creator (always a shared row):   [ (people) Общий ]   static, no track
single-member account:               (absent)
```

### The phone's history sheet row — the one mobile layout change

```
360 - 40 (paddingHorizontal 20 x2) = 320 content

+--------------------------------------------------+
| Разговоры                                    (X) |
|--------------------------------------------------|
| (pin ) Продукты за август  (ppl)  3 сент   (...) |
| (chat) Где дешевле молоко         28 авг   (...) |
|- - - - - - - - - - - - - - - - - - - - - - - - - |
| (chat) Итоги за июль       (ppl)  24 авг   (...) |
+--------------------------------------------------+

`...` is a 20px glyph with hitSlop to 44pt (hitSlop costs no layout).
title: ~224px -> ~196px.  date stays.  row stays one line.
```

### The phone's row menu — an in-sheet overlay, not a Modal

```
+--------------------------------------------------+
|  (dimmed history sheet, still mounted behind)    |
|                                                  |
|            +--------------------------+          |
|            | Закрепить                |          |
|            | Переименовать            |          |
|            |--------------------------|          |
|            | Удалить            danger|          |
|            +--------------------------+          |
|   paddingBottom: spacing[N] + insets.bottom      |
+--------------------------------------------------+

Rendered as the last child of ChatHistorySheet's `styles.modalOverlay`
(flex: 1, full screen) — NOT of `styles.modalSheet` (maxHeight: '70%').
```

## States

**The rail's four existing states are unchanged.** `resolveRailState(status,
count)` is unaffected — `count` is simply longer now. Pinned rows are always in
the payload by construction, so the rail's list is never a partial view of the
pins.

**Empty.** Nothing pinned and nothing to pin: unchanged (`ready` + 0 → the rail
is `hidden`).

**Loading, first paint on web.** SQLite is a mock, so the list starts empty and
the rail shows `chat.loadingHistory` under its existing bounded 5s wait. The
row menu does not exist yet because there are no rows.

**Loading, first paint on the phone.** The cache paints first, and
`ownedConversationIds` is empty until the network answers (fact 2). So in that
window **every row's menu shows `Pin`/`Unpin` only** — correct-by-accident and
correct-by-intent: a non-owner menu is the safe degradation, and Rename/Delete
appear the moment ownership is known. The `⋯` itself is always present, so
nothing appears or disappears; only the menu's contents grow.

**Renaming.** Save disabled while the value is empty or unchanged; disabled
with a spinner while the request is in flight, so a second tap cannot fire a
second write. On failure the dialog stays open with the typed value intact and
reports through `showAlert` — the `errors.chatError` precedent — rather than
closing and silently reverting.

**Deleting.** Optimistic: the row leaves the list immediately, and
`startNewConversation()` runs if it was the open one. On failure the row is
restored and `showAlert` reports it. A hard delete has no undo, so an
optimistic removal that is *reverted on failure* is the honest shape — never a
removal that stays after the request failed.

**Pinning.** Optimistic `isPinned` flip and re-sort, reverted on failure.
Because the sort is server-supplied, the optimistic path must apply the *same*
rule the server does — pins first, then `updatedAt desc` — which is why that
rule lives in one tested pure function used by both the optimistic reorder and
the render.

**Error.** The rail's existing `retry` state covers a failed list load. None of
the four actions gets its own persistent error surface; each reports through
`showAlert` and leaves the list as it was.

**Viewer role.** Nothing is gated by `canEdit`, and **no new endpoint takes
`ViewerBlockGuard`** — matching `/shared`, which has none. Creator-only is a
stricter and more appropriate gate than a role, a viewer may already use the
chat, and a viewer's own conversation is their own data: renaming it writes no
financial record. Adding `ViewerBlockGuard` here is the codebase's usual reflex
and would be wrong.

## Interactions

- **Hover:** rail rows keep their `surfaceSecondary` wash. The `⋯` is revealed
  by `hovered || focused || selected`, opacity-gated and permanently mounted.
- **The focusable twin of every hover affordance:** the `⋯` is the only
  hover-revealed control introduced, it stays in the tab order at `opacity: 0`,
  and `onFocus` reveals it. There is nothing else on either surface that hover
  alone can reach.
- **Right-click:** `onContextMenu` on a rail row opens the same popover at the
  pointer; a second right-click anywhere closes it (`RowContextMenu`'s existing
  behaviour). It is a shortcut, never the only path.
- **Long-press:** on the phone's sheet rows only, opening the same overlay the
  `⋯` opens. `ChatMessageItem`'s long-press-to-copy on transcript messages is
  untouched and is a different surface.
- **Keyboard:** row → its `⋯` → next row. Inside a menu, Tab across
  `menuitem`s, Enter activates, `Escape` closes and focus returns to the `⋯`
  (RN `Modal`). In the rename dialog, Tab reaches the field then Cancel then
  Save; `Escape` cancels.
- **No key is bound to Delete or to Unpin.** The shipped design already forbids
  a shortcut for confirming a pending action, and the reasoning is stronger
  here: `Delete`/`Backspace` while a rail row holds focus would be a data-loss
  keystroke one stray press away, on a screen whose primary input is a text
  composer.
- **Selection:** none, and none proposed. There is no bulk action on
  conversations, and a checkbox column in a 280px rail would be the ledger's
  List-specific rule carried across by analogy (§5).
- **Touch at ≥1024:** covered by the `selected` reveal condition in decision 1.

## API additions

Three endpoints on `AiController`, which already carries class-level
`@UseGuards(JwtAuthGuard, AccountContextGuard)`.

```
PATCH  /ai/chat/conversations/:id/title    { title: string }    -> { id, title }
DELETE /ai/chat/conversations/:id                               -> 204
PUT    /ai/chat/conversations/:id/pin      { pinned: boolean }  -> { id, isPinned }
```

**Rename and delete mirror `setConversationShared` exactly**, including the
order that matters: `findFirst({ where: { id, accountId } })` → 404, *then*
`conversation.userId !== userId` → 403. That order is deliberate existence
non-disclosure and must be preserved, not tidied into one query.

**Pin does not** — its predicate is read visibility, `findFirst({ where: { id,
accountId, OR: [{ isShared: true }, { userId }] } })` → 404, with no ownership
check. See the fork.

`UpdateConversationTitleDto`: `@IsString() @IsNotEmpty() @MaxLength(100)`. A
local `class-validator` class, not a bare shared-types interface (the
`SettleUpPayDto` precedent).

**The rename must write `updatedAt` back explicitly** —
`data: { title, updatedAt: conversation.updatedAt }` — or `@updatedAt` bumps it
and the row teleports to the top of both surfaces. Whether Prisma honours an
explicit value on an `@updatedAt` field is listed under "unproven"; if it does
not, the fallback is decided at implementation time, and the plan must verify
rather than assume.

`ChatConversationSummary` gains `isPinned: boolean`. `PUT` rather than `POST`
for the pin because the body carries the desired state and the operation is
idempotent in both directions.

SQLite mirror: `ALTER TABLE chat_conversations ADD COLUMN is_pinned INTEGER` in
`client.native.ts` (the established migration pattern), and
`chatRepository.getConversations`' `ORDER BY` becomes `COALESCE(is_pinned, 0)
DESC, updated_at DESC` — **`COALESCE` is load-bearing**: SQLite sorts NULL
below 0, so without it a legacy row (NULL) would sort after an
explicitly-unpinned row (0) regardless of date, splitting the unpinned block in
two.

## The pure modules, because nothing renders in CI

Extending `src/features/chat/chatLayout.ts`:

```
pinnedGroupBoundary(conversations): number | null
sortConversationsForDisplay(conversations): ChatConversation[]
conversationMenuItems(row, { isOwner }): ConversationMenuItem[]
canSaveRename(current: string | null, next: string): boolean
```

New in the API, `modules/ai/utils/conversation-list.ts`:

```
mergeConversationLists(pinned, recent): ConversationRow[]
```

Test fixtures worth stating, because each is a way this can be numerically
wrong: `pinnedGroupBoundary` on all-pinned, none-pinned, both, and empty;
`sortConversationsForDisplay` reproducing the server's order from a shuffled
input (it is the optimistic path's only guarantee of agreeing with the server);
`mergeConversationLists` where a pinned row is **also** in the recent 20 (it
must appear once, in the pinned block) and where a pinned row is **outside**
the recent 20 (it must appear at all — that is the whole point of two queries);
`canSaveRename` on empty, whitespace-only, unchanged, unchanged-modulo-trim,
and a null current title.

Everything else — the 231px row's real truncation points, the phone row at
320px, hover and focus order, the popover's clamping near a window edge, the
segmented control across 13 accents in both themes, and whether the pinned
divider reads as a boundary or as a stray line — is verified by a person on the
deployed build. Nothing in this repo renders a component in CI.

## What a plan must not do

1. **Must not generalise `expenses/desktop/RowContextMenu.tsx`.** It is
   hardcoded to three ledger items and its `canEdit` doc comment reasons about
   a ledger viewer; the chat rail's gate is ownership, not role. Write a chat
   sibling under `src/components/chat/desktop/`. Reuse the *pattern* — viewport
   clamping, RN `Modal`, raw `<div>` scrim, `menuitem` roles — never the file.
   Touching it risks the shipped, product-approved ledger.
2. **Must not render the phone's menu as a `Modal`.** Nested inside
   `ChatHistorySheet`'s `Modal` it is flaky on iOS; as a sibling in
   `ChatMobile` it stacks two presented modals. It is an absolutely-positioned
   `View` inside `styles.modalOverlay` — and **not** inside `styles.modalSheet`,
   whose `maxHeight: '70%'` would confine it.
3. **Must not hand-author a red delete button.** `showAlert` +
   `style: 'destructive'` already renders `danger`/`onSemantic`. ABA-450 is
   what a hardcoded red costs.
4. **Must not use `common.deleteConfirmTitle`** — it is `'Delete Transaction'`.
5. **Must not show the private delete message for a shared conversation.** That
   single string is the whole guard in decision 4.
6. **Must not add a soft-delete column, an undo, or bot cleanup.** `chat()`
   self-heals an unresolvable id by creating a new conversation; a soft delete
   would make the bots keep appending to a deleted row.
7. **Must not conditionally render the rail's `⋯`.** Opacity-gate it, or the
   title re-truncates under the cursor.
8. **Must not leave `currentConversationId` pointing at a deleted
   conversation.** Call `startNewConversation()` when the open one goes.
9. **Must not derive ownership from the SQLite cache.** `loadConversations`
   writes the current user's id onto every cached row, so the cache cannot
   answer it. Read `ownedConversationIds`, and accept that it is empty until
   the network answers.
10. **Must not read `accountMembers.length <= 1` as "single-member account".**
    `0` means unknown or failed; `1` means single.
11. **Must not sort pinned rows in the rail or the sheet.** The pin is part of
    the query. A client sort silently loses any pin outside the 20
    most-recently updated.
12. **Must not order the pinned block by `pinnedAt`** without also exposing
    `pinnedAt` and mirroring it into SQLite — otherwise the phone's cache-first
    paint reshuffles the pinned block when the fetch lands.
13. **Must not `orderBy: { pins: { _count: 'desc' } }`.** It compiles and
    orders by how many *other people* pinned the row.
14. **Must not delete a pin when a conversation is unshared.** The pin is
    inert, not orphaned, and re-sharing should restore it.
15. **Must not add `accountId` to the pin table.** Pins are per-account by
    construction.
16. **Must not put `ViewerBlockGuard` on any of the three endpoints.**
    `/shared` has none, for the reasons in "States".
17. **Must not give the pin endpoint the `/shared` predicate.** It would let a
    member pin — and thereby confirm the existence of — a co-member's private
    conversation.
18. **Must not forget `updatedAt: conversation.updatedAt` on the rename.**
19. **Must not put rename/delete/pin in the desktop title bar as well as the
    rail.** §5a: one leader. The open conversation's own rail row is right
    there and its `⋯` is revealed *because* it is selected.
20. **Must not bind a key to Delete or Unpin.**
21. **Must not route `ChatHistorySheet` through `SheetDialog`** (§5i records
    why that was rejected), and must not normalise its ground colour, scrim,
    padding or `maxHeight` "while we're here".
22. **Must not add a new width constant for the rename dialog.**
    `SheetDialog`'s 480 is the one number.
23. **Must not let Save fire on an empty or unchanged title.**
24. **Must not add a seventh i18n key** without arguing it against the six
    here.
25. **Must not change the mobile rendering beyond the three changes this design
    names** — the trailing `⋯` and long-press on sheet rows, the leading `pin`
    icon and the new order, and the `swap-horizontal` glyph in the top-bar
    pill. Each must appear in the commit's first paragraph (§5g's precedent).

## Departures from the design language

**§5a's "resolve redundancy by choosing a leader" — honoured, and the ruling is
recorded here so it is not relitigated.** The rail row's icon+word and the
title bar's segmented control describe the same property. They are not
redundant, for the reason the shipped design already gave: the row states a
property of *another* conversation, the control changes *this* one. The leader
for *acting* is the control; the leader for *scanning* is the row.

**§3's "a dialog HOSTS an existing component" — satisfied in spirit, not in
letter.** `RenameConversationDialog` hosts nothing, because nothing exists to
host. It is the one definition for both platforms, which is what the rule is
for.

**§5's List-specific rules are again deliberately not inherited.** No facet
rail, no day grouping, no per-currency subtotal, no checkbox selection. The
pinned/unpinned divider is *not* a day-group header: it is one boundary between
two groups, computed from a boolean, with no subtotal and no label.

**One deliberate divergence from the ledger, and it is an improvement rather
than a departure:** the ledger's `⋯` is `hovered || focused`, which leaves it
invisible (though still tappable at `opacity: 0`) on a touch tablet at ≥1024.
The rail adds `|| selected`. Worth back-porting to the ledger, where the
checkbox column gives touch a visible target but the menu does not; out of
scope here.

**Three deliberate changes to the mobile rendering**, listed in "What a plan
must not do" item 25. §5g's precedent governs how they ship.

No other departures.

## Findings outside this design's scope

Each needs its own decision; none should be folded in silently.

1. **`chatStore.loadConversations` corrupts the conversation cache.** It maps
   every remote row with `userId` set to the *current* user and
   `accountId: undefined`, and `upsertConversation` persists both. So another
   member's shared conversation is cached under my id, the cache cannot answer
   ownership, and `getConversations`' `WHERE user_id = ? OR ...` returns my own
   conversations **from every account**. On the phone that means a stale
   cross-account row can paint for one frame after an account switch. Web is
   unaffected (the cache is a mock). Fixing it means carrying the real `userId`
   and `accountId` through the mapper and adding an `is_owner` column, and it
   changes the phone's cache behaviour.
2. **A pinned rail can overflow, which makes one sentence in the shipped chat
   design false.** Its Departures section reasons that the rail "holds at most
   20 rows (`LIMIT 20`, server-side); at about 48px a row that is about 960px,
   so it overflows only below roughly a 1000px viewport". With pins the payload
   is 20 + P, so a user with five pins is at about 1200px and gets a scrollbar
   on any laptop. Nothing breaks — RNW's `ScrollView` is `overflowY: auto` and
   the scrollbar is never hidden — but that paragraph needs correcting when
   this ships.
3. **`chat.andMore` already exists** (`'+{{count}} more'`, all nine locales),
   so finding 2 of the shipped chat design — four hardcoded English `"more"`
   strings in `ActionResultCard` — is a one-line-per-site fix with **no new
   key**, not the copy decision it was recorded as.
4. **`/shared` bumps `updatedAt` too**, teleporting a row when its sharing is
   toggled. Left alone: sharing is arguably an event. Worth a decision now that
   the rename establishes the opposite convention.
5. **A failed `getMembers` on web permanently removes the sharing control**, via
   `loadMembers`' catch falling back to a SQLite mock that returns `[]`. This
   design documents the `0`-means-unknown discriminator but adds no retry.

## What this design leaves unproven

- **Whether Prisma honours an explicit value on an `@updatedAt` field** in an
  `update`. The whole "a rename must not teleport the row" requirement rests on
  it. If it does not, the fallback is decided at implementation time and the
  plan must verify rather than assume.
- **Whether 183px of title in the rail is enough** once a `⋯` slot is reserved,
  against real auto-generated titles that run to 100 characters. Arithmetic
  says the truncation point moves by about 3–4 characters; only eyes on the
  deployed build settle whether that reads as tighter or as broken.
- **Whether two labelled segments fit the desktop title bar's 760 column beside
  a long title.** Roughly 170px of 760 is comfortable on paper; a
  100-character title next to it is the case to look at.
- **Whether the pinned/unpinned divider reads as a boundary.** It reuses the
  rail's existing `divider` style, which currently separates New Conversation
  from the list — so the rail would have two dividers doing different jobs. If
  it reads as a stray line, the fallback is a group header, which costs the
  seventh i18n key this design declined.
- **Whether two stacked overlays on the phone behave** — the action overlay
  inside `ChatHistorySheet`'s already-presented `Modal`. Chosen specifically to
  avoid nested `Modal`s, but an in-`Modal` absolute overlay with a safe-area
  inset is not a shape this app has used before. Verified only on a device.
- **Whether `hitSlop` genuinely gives the phone's `⋯` a 44pt target** inside a
  `FlatList` row in a `Modal`. It should; it is not measurable in CI.
- **Whether a one-item menu reads as broken** on another member's shared row.
  The alternative — a direct pin button on those rows only — was rejected as a
  different control in the same position, but the product owner's eye is the
  judge.
- **Whether an unbounded pinned query is acceptable.** It is scoped to one
  `userId` behind an indexed FK and can only grow by clicking Pin, so it is not
  the unbounded-table-scan class ABA-457 fixed. If a bound is ever added it
  must come with a visible `+N more`.
- **Whether "pins first, then recency" is what a pinner expects**, versus a
  pinned block frozen in `pinnedAt` order. The trade is stated; only use
  decides it, and reversing it costs one exposed field and one SQLite column.
- **Whether the two-segment control actually answers request 3.** It is a
  diagnosis-led guess: the segmented control addresses "it looks like a badge"
  and "you cannot see the other option", and (d) addresses "it is not where the
  decision is made". Whether a household then *discovers* sharing is a question
  only the deployed screen and ABA-497's telemetry can answer — and that
  telemetry has no data yet.
