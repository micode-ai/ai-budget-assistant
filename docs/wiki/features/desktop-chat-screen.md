# Desktop chat screen

*Hub: [ai-features](../ai-features.md) · conversation CRUD: [chat-conversation-management](chat-conversation-management.md)*

## What this is

The chat tab at ≥1024px: a 280px conversation rail beside a 760px reading column. The sixth screen
and the last of the five tabs to get a desktop layout.

## Entry points

- `apps/mobile/src/components/chat/ChatView.{tsx,web.tsx}` — the only file that decides
- `ChatMobile.tsx` — the phone's JSX, in exactly one definition
- `ChatDesktop.tsx`, `ConversationRail.tsx`
- `apps/mobile/src/features/chat/chatLayout.ts` — `resolveRailState`, `railIsVisible`,
  `chatColumnWidth`, `currentConversationTitle`, `conversationDateLabel`
- `apps/mobile/src/features/chat/useChatScreenData.ts`

## Key concepts

**The hook is called in BOTH platform `ChatView` files** and its whole return value passed down as
one prop — never inside `ChatMobile` / `ChatDesktop`. It fires a telemetry `started` once per mount
and owns a dedup ref, and a resize across 1024 swaps the child: a hook mounted in the child would
emit a second `started` and reset a half-typed draft.

**The title bar and composer are full width; their ROWS are capped** to the column. Capping the
surface instead leaves a floating island. The transcript is capped through its
`contentContainerStyle` — wrapping the `FlatList` moves the scrollbar off the window edge.

**No page scroll.** The transcript scrolls, the rail scrolls, the composer is docked. This is the
branch's first departure from the one-page-scroll rule and is argued as such in the design.

**The 1024–1439 band needs no threshold constant.** The column reaches its cap at exactly 1080, so
that band is simply a 704–760px column.

## Invariants

**The assistant bubble loses its own `maxWidth` on desktop; the own-message bubble keeps its
percentage.** The answer is the document, the question is a margin note — inverting it widens
one-line questions and narrows markdown tables.

**All arithmetic lives in the pure module and must be CALLED, never paraphrased inline.** Nothing
renders a component in CI, so a condition rewritten by hand in the component is untested by
construction. `chatColumnWidth` takes the gutter as an **argument**, which keeps the module
theme-free.

**Teardown and refill are two halves and both are required.** `chatStore` had no `reset()` and was
absent from both the logout action and the account-scoped cache clear, so a conversation list
survived sign-out — readable by the next person on that browser — and survived an account switch,
letting the composer post into the account just left. But the teardown alone left the rail stuck on a
visible `loading` forever, because the reset returns the status to `idle` and the only fetch was
keyed on the current conversation id, which the reset clears. The refill is an effect keyed on the
**account id** in the always-mounted `ChatDesktop`.

**When a list leaves a sheet, re-create its refresh trigger deliberately.** The phone needed neither
fix, for the same reason the desktop was vulnerable: opening the history sheet calls
`loadConversations()` every time, so a sheet-hosted list gets a refresh trigger free that permanent
furniture does not.

**`conversationDateLabel` is a deliberate second copy** of an expression in the phone's history
sheet. Collapsing them would edit the phone's file for no gain.

## Known gaps

- `markdownStyles.body` sets no `fontFamily`, so every assistant answer renders in the platform's
  default face while the app is Montserrat. The design's 72–79 character measure assumed Montserrat;
  the system face carries ~86 in the same 649px line. Fixing it needs `fontFamily` **plus**
  replacing all five `fontWeight` usages with concrete weight files — `fontWeight` on a named static
  family does nothing — which changes every assistant message on the phone.
- `ChatHistorySheet`'s `isLoading` prop is wired to the message-in-flight flag rather than any
  conversation-list state.
- A conversation reached by the `?conversationId=` deep link cannot resolve its title or rail
  selection when it falls outside the twenty most-recently-updated, because there is no per-id
  lookup.

## History

ABA-513. `src/features/chat/useChat.ts` was **deleted** in the same change — dead with zero
consumers, holding a divergent `sendMessage` that bypassed pending actions, shared-chat
reconciliation and the paywall, i.e. a decoy for anyone told to put chat state under
`src/features/chat/`.
