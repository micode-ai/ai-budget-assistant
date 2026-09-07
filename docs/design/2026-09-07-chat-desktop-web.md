# AI Chat — Desktop Web Design

The sixth and last tab, and the only one with **no width awareness at all**:
`app/(tabs)/chat.tsx` is 562 lines containing zero occurrences of
`isDesktopWeb`, `useContentWidth`, `CONTENT_MAX_WIDTH` or `maxWidth`. Everything
below is read from the code, not inferred from the brief.

## Corrections to the brief — one premise was wrong, two need sharpening

**Wrong premise: "`ChatHistorySheet` is a raw RN `Modal`, not yet routed through
`SheetDialog`" is factually right, but the implied next step — route it through
`SheetDialog` — is the wrong move here, and doing it carelessly changes the
phone's pixels.** `ChatHistorySheet` paints `theme.colors.background` (not
`surface`), a literal `rgba(0,0,0,0.4)` scrim (not `theme.colors.overlay`),
`maxHeight: '70%'`, no horizontal padding on the sheet box (its rows own their
own `paddingHorizontal`), and its own header with a close X.
`SheetDialog`'s mobile branch is `surface` + `theme.colors.overlay` +
`paddingHorizontal: spacing[6]` + `paddingTop: spacing[6]` and no `maxHeight`.
Routing it through the wrapper therefore needs all three legacy escape hatches
(`sheetStyle`, `handleStyle`, `scrimColor`) just to keep the phone
byte-identical — which is what those props exist for, but it is work that buys
nothing here, because **under the design below this component is not rendered on
desktop at all**. See "The conversation rail" and "What a plan must not do".

**Sharpen: the bubble is ~1510px at 1920, not ~1530.** `messageList` carries
`padding: theme.spacing[4]` (16), so the row is 1888 and 80% of it is 1510.
The substance of the point stands and then some: the phone's own measure at
360px is ~264px of text, so today's desktop rendering is **5.7× the line length
this type was set for**.

**Sharpen: the composer's controls are ~1876px apart at 1920, and the top row's
"New conversation" button is conditional the other way round from what the
brief implies.** `inputContainer` has `padding: spacing[3]` (12), so the mic
centre sits at x≈34 and the send centre at x≈1886. And the top row's left slot
renders "New Conversation" **only when `currentConversationId` is set** — it is
absent on a fresh conversation, which is exactly when a newcomer sees this
screen. That conditionality is right on a phone and is load-bearing for the rail
decision below.

Everything else in the brief checks out: `bubbleTouchable` is `maxWidth: '80%'`
(a container percentage); the mention bar, the polling gate (`useFocusEffect`,
shared conversations only), `ActionConfirmationCard` and `ActionResultCard` all
behave as described; and the action cards render **inside** the assistant bubble,
so today they inherit that same 80% cap.

## One landmine to name before anything else

**`src/features/chat/useChat.ts` is dead code with zero consumers** — verified:
`grep -rn "useChat\b" src app` outside its own file returns nothing. It holds an
older, divergent `sendMessage` that calls `api` directly and bypasses
`chatStore.sendMessage` entirely: no pending actions, no shared-chat
reconciliation, no 403 paywall. An implementer told to "extract the chat
screen's state into `src/features/chat/`" will find it and may extend it. It is
**not** the hook. The new hook is a new file; `useChat.ts` should be deleted in
the same pass, as a one-line cleanup.

## Goal

Let someone hold a real conversation with their money on a laptop: a transcript
set at a readable measure instead of a 1510px line, their past conversations
permanently in view and one click away instead of two, and the action cards —
the reason this tab exists — given the width to be read as data rather than
squeezed into a phone-shaped bubble.

### Whether anything on this screen answers the same question twice

Per §5a, redundancy is a desktop problem before it is a design problem. Three
candidates, one real:

1. **Real: the History button and a conversation rail are the same
   affordance.** If a rail lists conversations permanently, a button whose only
   job is to open a modal list of conversations states the same thing twice and
   costs a click. Resolved by dropping the button **on desktop only** (§5a:
   drop duplicates on desktop only — the argument does not hold on a phone, and
   the mobile rendering may not change regardless).
2. **Not redundant, though it looks it: the shared/private chip and the rail
   rows' `people` icon.** The chip is the state of *the conversation you are in*
   and is a control (creator-only `PATCH /:id/shared`); the row icon is a
   read-only property of *each other* conversation. Different objects.
3. **Not redundant: `AiUsageBadge` above the composer.** Nothing else on this
   screen or in `WebTopBar` reports remaining AI quota. §5e's lesson applies
   directly — a route's chrome once carried "the only place a paid flow showed
   its remaining quota", and this badge is in that class. It stays, in the
   column.

## What each mobile affordance becomes

| Mobile today | Desktop | Why |
|---|---|---|
| Top row, left: "New Conversation" (only when `currentConversationId` is set) | Moves into the rail as its permanent first row, inert when already on a fresh conversation | §5f: "selecting the thing you are already on must be a no-op". In the rail it is always present and always in the same place, instead of appearing and disappearing |
| Top row, right: shared/private chip (a control for the conversation's creator, a read-only badge otherwise; hidden on a single-member account) | Same behaviour, relocated beside the current conversation's **title** in the content column's own title bar | Puts the chip on the object it describes, which also disambiguates the copy — see "Copy note" |
| Top row, right: History button opening `ChatHistorySheet` (bottom sheet) | **Dropped on desktop.** Replaced by the persistent conversation rail | §2/§3 (a sheet is a phone idiom) plus the redundancy above. `ChatHistorySheet` is untouched and stays the phone's history |
| `FlatList` of `ChatMessageItem`; bubbles capped at 80% of the viewport | Same list, same component, inside a bounded reading column; the bubble cap becomes the column | Line length is the whole defect — see "The measure" |
| `ChatMessageItem` long-press to copy (`showAlert` with a Copy action) | Unchanged, and still the only copy affordance | Long-press works with a mouse in react-native-web (`delayLongPress: 400`). A hover-revealed copy button would need a focusable twin AND a new i18n key; this path needs neither |
| `ActionConfirmationCard` in the bubble, Confirm/Reject as two `flex: 1` buttons | Same component, `desktop` prop; the button pair stops being two half-card bars | See "The action cards" |
| `ActionResultCard` (10 result shapes, capped at 5 or 8 rows with "+N more") | Same components, **unchanged row caps**, about 2.4x the text measure | Width is free here; vertical space is not |
| Mention bar (chips above the composer while typing an @ in a shared conversation) | Unchanged, aligned to the column | Already a wrapping chip row; in a 760px column it reads as intended instead of as a 1900px band |
| `AiUsageBadge`, centred above the composer | Unchanged, centred on the column | §5e's quota-surface rule |
| Composer: mic, then 1876px, then send | Bar spans the content area (full width, own border and ground); the row inside it is capped and centred on the same column, at the same 16px inset as the bubbles | See "Where the composer lives" |
| `KeyboardAvoidingScreen` wrapper | Plain `View` on desktop | Verified from source: react-native-web's `Keyboard.addListener` is a no-op stub that never emits and `isVisible()` always returns `false`, so `useKeyboardHeight()` is permanently 0 and the wrapper is already inert on web |
| Empty state: 120px icon disc, title, subtitle, three canned-question chips | Same content, same column, plus a capability legend built from **existing** action labels | See "The empty state" |
| `isLoading` row ("Thinking...") between list and composer | Unchanged, on the column | — |
| `isProcessing` voice overlay (absolute, `bottom: 80`) | Unchanged | Already an overlay, not a sheet |
| Polling (`useChatPolling`, shared conversations only, `useFocusEffect`) | Unchanged | Focus still changes on desktop: `WebSidebar` pushes routes |
| Deep link `?conversationId=` from a `chat_mention` push | Unchanged | It selects the conversation; the rail highlights it for free |
| — (new) | Content-column title bar naming the current conversation | The screen has never said which conversation you are in. On a phone that is acceptable; with a rail beside it, the absence is conspicuous |
| — (new) | Conversation rail, 280px, left of the content area | See "The conversation rail" |

## Layout

### The measure, and why the cap stops being a percentage — Q1

**The cap becomes the column, and the percentage is deleted rather than replaced
by a second number.** Two constants go into
`src/components/webLayout.constants.ts` — never inline (§5e/§5f on hand-copied
literals drifting invisibly at exactly one width):

```
CHAT_COLUMN_MAX_WIDTH = 760
CHAT_RAIL_WIDTH       = 280
```

The transcript's **content container** is capped to `CHAT_COLUMN_MAX_WIDTH` and
centred; the `FlatList` itself still spans the content area, so its scrollbar
stays at the window's right edge (§2's "general" page-scroll preference — cap
the content, never the list). Inside that column, `ChatMessageItem` takes
`desktop?: boolean`, default `false`, so the phone keeps `'80%'` *by
construction* rather than by discipline (§5a's first rule):

- **assistant / other-member bubble: no width cap of its own.** The column is
  the cap; the bubble fills the row minus the avatar lane.
- **own-message bubble: `'80%'` unchanged** — but now 80% of a 728px row rather
  than of an 1888px one.

Why the asymmetry instead of one rule for both: the assistant's answer is the
document (prose, markdown tables, result cards); your question is a margin note.
Both stay flush right, so the only visible difference is where the left edge
begins — the standard chat reading, and it is what hands the action cards the
widest box on the screen without a special case for them.

The arithmetic, with `theme.spacing[5]` (20) as the page gutter and the
transcript keeping its existing `spacing[4]` (16) content inset:

| Window | Rail | Column | Row | Assistant bubble | Text measure |
|---|---|---|---|---|---|
| 1024 | 280 | 704 | 672 | 632 | **608** |
| 1080 | 280 | 760 (cap reached) | 728 | 688 | **664** |
| 1440 | 280 | 760 | 728 | 688 | **664** |
| 1920 | 280 | 760 | 728 | 688 | **664** |
| any, rail hidden | — | 760 | 728 | 688 | **664** |
| phone, 360 | — | 360 | 328 | 288 | **264** |

Montserrat is a wide face; at its average advance of about 0.56em the 15px
markdown body works out at about 8.4px per character, so **the measure never
leaves the 72-79 character band at any desktop width** — against about 31
characters on a phone and about 180 in today's desktop rendering. That single
property is the answer to Q1: a percentage of the viewport cannot hold a band,
an absolute column can, and one number does it for the whole range.

*(Those character counts are arithmetic on a stated average advance, not
measured glyph runs. They are the right order and the right band; the final call
is by eye on the deployed build, as everything about type here has to be.)*

**Why not `CONTENT_MAX_WIDTH` (1080) or `useContentWidth()`.** 1080 is the "fill
the laptop, keep the scrollbar at the edge" number for a page of cards and
charts; as a measure it is about 125 characters, worse than most of what it
would replace. And `useContentWidth()` is documented as single-column-screen
only, for *measured* content sizing itself against a window. A transcript is
neither.

### Where the composer lives — Q2

**The bar is full width; the row inside it is the column.** Not the other way
round. A composer capped as a *surface* would float as an island with the
transcript's ground visible on both sides of it, and would stop reading as
docked; §2's "every container paints its own ground" applies to the bar, which
keeps its `surface` fill and its top border right across the content area.

Inside it, the mic / input / send row is capped to `CHAT_COLUMN_MAX_WIDTH`,
centred, and inset **16px** — the same inset as the transcript rows, not the
composer's current 12 — so the mic and send buttons line up exactly with the
bubbles' outer edges above them. At the 760 column the text input is 632px wide
and the two controls are about 700px apart instead of about 1876.

The same treatment applies to the title bar at the top and to the
`AiUsageBadge` and mention-bar strips: full-width bars, column-width contents,
one shared inset. Four things aligned on one vertical rule is what makes a
bounded column read as designed rather than as a cap bolted on.

### The conversation rail — Q3

**A persistent left rail, at every desktop width, with no dropdown fallback
band.** The reasoning, in the order that decided it:

1. **It is a selector — neither a leaf nor a form.** §3's own test is "is this a
   leaf a dialog can host in full?", and §5h's ruling is that a pane's child is
   a route. A list of past sessions is neither: it is the thing you choose
   *from*. Every established answer in this codebase for a selector on desktop —
   `FacetRail` on transactions, `SettingsNav` in the settings shell — is a
   persistent left rail. This is the third instance of one structural idea, not
   a fourth idea.
2. **Chat is the only screen where one content area hosts many independent
   documents**, and the only one that currently never says which one you are in.
   The rail supplies that signal permanently and for free, and it is what makes
   the new title bar meaningful rather than decorative.
3. **The arithmetic permits it at 1024, and that is what removes the band.** The
   facet rail was pushed to 1440 because a five-column table needs the width;
   this content wants at most 760 and gets 704 at 1024 — a 56px shortfall from
   the cap, still inside the same character band. So the rail costs the
   transcript nothing anyone can read. **The column reaches its 760 cap at
   exactly 1080px of window**, so the entire story of the 1024-1439 range is:
   below 1080 the column is 704-760 instead of 760. There is no width at which
   the rail does not fit, therefore no dropdown, and `FacetRail`'s
   collapse-to-a-trigger pattern is deliberately not inherited — §5's warning
   against carrying a List-specific rule across by analogy.

**What is in it**, top to bottom: a `+ New conversation` row; a
`chat.historyTitle` section label; then the conversations newest first, exactly
as the server returns them (`ORDER BY updated_at DESC LIMIT 20` — no grouping,
no new copy). Each row reuses `ChatHistorySheet`'s own row content: chat icon,
title (or `chat.conversationUntitled`), a `people` icon when shared, and the
short date. The visual idiom is `SettingsNav`'s, literally: `width:
CHAT_RAIL_WIDTH`, `flexShrink: 0`, `borderRightWidth: 1` in `borderLight`,
`backgroundColor: surface`, rows as `Pressable` with `onHoverIn`/`onHoverOut` to
`surfaceSecondary`, selected as `primary + '15'` with a `primary` label. The
content area beside it is `flex: 1, minWidth: 0` — the `SettingsShell.pane`
literal, because without `minWidth: 0` a react-native-web flex child will not
shrink below its content.

**It carries exactly one action per row — select — and therefore no hover-only
affordance.** There is no rename or delete endpoint for a conversation (the API
is `GET conversations`, `GET messages`, `poll`, `PATCH shared`), so the question
of a focusable twin does not arise here. Hover is a background wash over a
`Pressable`, which react-native-web makes focusable and Enter-activatable.

**When the rail is absent**, the column keeps its 760 cap and simply centres in
the whole content area. So the rail's appearance is a *translation* of the
column at 1080 and above, and a re-wrap only between 1024 and 1080.

**The one visible seam, named rather than hidden:** a brand-new account has no
conversations, so the rail is suppressed; it appears the moment the first
message creates conversation #1, shifting the column right by 140px. That
happens exactly once per account, inside the same paint that replaces the empty
state with a transcript — a bigger change that hides it. It is on the eye-check
list; the fallback, if it reads badly, is to render the rail from the start with
only its `+ New conversation` row.

**What the rail forces us to fix, and it is a real bug on both platforms.**
`chatStore` has **no `reset()` at all**, is **not in `logoutAction`'s reset
block**, and **nothing subscribes to `currentAccountId`** to clear it. So
`conversations`, `messages` and `currentConversationId` survive both a sign-out
and an account switch. Today that is invisible — the screen shows no title and
no list, so nobody notices — and the rail turns it into a visibly wrong answer:
the §5g class exactly ("a pane that outlives a switch is a data-correctness
problem, not a layout one"). Required, and it changes the phone's behaviour,
which the commit must say in its first paragraph per §5g's own precedent:

- add `chatStore.reset()`;
- call it from `logoutAction`'s existing reset block, **unconditionally** (§5d:
  sign-out is also reached from a 401 cascade with the tokens already gone,
  which is exactly the case a token-gated teardown would miss);
- clear it at the account boundary from **one** `useAccountStore.subscribe(
  (state, prev) => ...)`, not from call sites — `currentAccountId` is written
  from eight places (§5g's "the fix belongs at the value, not the callers").

The account case is not cosmetic: `X-Account-Id` comes from `accountStore`, so
after a switch the composer would post into a conversation belonging to the
account you just left.

**And one flag it needs.** `loadConversations` sets no loading state and
swallows every error (`catch {}` — "Non-fatal: leave whatever is in state"), and
`ChatHistorySheet` is handed the store's global `isLoading`, which is the
*message-in-flight* flag, not a conversation-list flag. On web, where
`db/client.web.ts` returns `[]` for the SQLite cache, that means a failed fetch
and an empty account are indistinguishable — §5c/§5d's finding, verbatim. Add
`conversationsStatus: 'idle' | 'loading' | 'ready' | 'error'` to `chatStore`,
set it in `loadConversations` (including `'error'` in the catch), and read it
**only from the desktop rail**. Do not rewire `ChatHistorySheet`'s `isLoading`
prop — that is the mobile rendering, and its mis-wiring is a separate
pre-existing defect, recorded below.

### The empty state — Q4

Today it is a centred stack: a 120px `primaryLight` disc, `chat.title` at h2,
`chat.subtitle`, and three chips that send `chat.topExpensesQ`,
`chat.budgetStatusQ` and `chat.savingTipsQ`. "Acceptable" is the right reading —
and it is also the screen that sells the product's distinctive feature to
someone who has never used it, seen at the widest the app ever gets, with no
rail beside it.

**The zero-key constraint decides the shape, and improves it.** There are
exactly three `*Q` keys, so a fourth suggestion chip is impossible without new
copy; the interactive part therefore stays at three. What *is* available for
free is **eleven already-translated labels naming what the assistant can do** —
`chat.actionGetExpenses`, `actionGetBudgetStatus`, `actionGetCategoryBreakdown`,
`actionCreateExpense`, `actionCreateIncome`, `actionCreateBudget`,
`actionCreateCategory`, `actionAddShoppingList`, `actionRemoveShoppingList`,
`actionShoppingSuggestions`, `actionInflationShield` — each of which already has
an icon chosen for it in `ACTION_ICONS` or in its result card. That is precisely
the "what is this thing for" answer a newcomer needs, in nine languages, at no
cost.

So the desktop empty state is: the disc (smaller, 96px), `chat.title`,
`chat.subtitle`, the three suggestion chips, then a **capability legend** — a
two-column grid of icon-plus-label rows, static and non-interactive, sitting
quietly below the chips. It is a legend, not a control surface: the three chips
above it are the interactive part, and a chip that sent its own label as a
message would be a worse question than the three real ones.

**It stays inside the same 760 column, and that is a deliberate answer rather
than laziness.** Two reasons. The empty state and the transcript then have
identical width, so sending the first message moves nothing horizontally. And
this is the one screen where widening the pitch makes it worse to read — §5c's
standing "density is a feature" direction is about a dashboard of figures, not
about the one surface whose job is to be understood in five seconds.

At 1024x768 the whole stack is roughly 570px against roughly 560px of available
height, so at short viewports it scrolls in the transcript's own existing
scroller. No new scroller, no clipping.

### The action cards — Q5

**Yes, they get more room — and by construction rather than by a special
case.** They render inside the assistant bubble, and the assistant bubble now
takes the column: a card is about 664px wide against about 264px on a phone,
2.4x. That is the whole of the "do they get more room" answer, and it needed no
rule of its own, which is the reason the assistant/user cap asymmetry above is
worth having.

What that width actually buys, concretely: every card is a stack of
label-then-amount rows with `numberOfLines={1}` on the label. At 264px the
labels truncate constantly ("Biedronka Warszawa Wojsk..."); at 664px they
essentially stop truncating, and the right-hand amounts form a real column.

**Two things must change on the desktop path, both consequences of width:**

1. **`ActionConfirmationCard`'s button pair must stop being two `flex: 1`
   bars.** In a 664px card they are about 326px each — 40% wider than the same
   pair in the widest dialog this app draws (`SheetDialog`'s 480px panel, where
   `flex: 1` gives about 230px). The family of defect is the appearance-chips
   one (§5e) and `account/list`'s two ~900px dashed bars (§5h). Behind the
   `desktop` prop the row becomes right-aligned, natural-width buttons with
   Reject before Confirm, matching `ExpenseDialog`'s footer order. A
   confirmation should read as a decision, not as two banners.
2. **Money in these cards should carry `fontVariant: ['tabular-nums']`** (§4:
   money that lines up in a column carries it) — `listItemAmount`, `totalValue`,
   `detailValue`. It does not today, on either platform. Gate it behind
   `desktop` so the phone's rendering is untouched, and see the findings section
   for why the phone should get it too, separately.

**Does a confirmation behave differently when it can be seen in full? Yes, and
the difference is already free.** A pending action is always the last message,
and the transcript auto-scrolls to the end, so on desktop it is always fully
visible with the composer below it — whereas on a phone the soft keyboard covers
it and has to be dismissed first. Nothing needs building to get that.

What must **not** be built on top of it: **no keyboard shortcut for Confirm.**
Enter in the composer sends a message (`onKeyPress`, web-only, already shipped),
and a screen where one keystroke either sends text or commits a write is a
screen that will commit writes by accident. §3's own reasoning about a
destructive action at the bottom edge of a dialog that Esc dismisses "without
deciding anything" points the same way. Both buttons are `TouchableOpacity`,
hence tab-reachable and Enter-activatable once focused, which is the accessible
path and requires an explicit act of focusing.

The row caps (5 items, 8 categories) **stay**. Width is free here; vertical
space is not, and the "+N more" row already makes the truncation
unrepresentable-as-silent (§5g).

### Wireframe at 1440 (the column is at its cap from 1080 up)

```
+==============================================================================+
| AI Budget  Dashboard Transactions Budgets Analytics [AI Chat]   Acct | (!) * |  56
+==============================================================================+
|<-- 280 --->|<--------------------- 1160 content area --------------------->|
| + New      | +-------------------------------------------------------------+
|   conversa.| | 20 |<----------- 760 column ----------->| 20   (centred)    |
|------------| |    Grocery spend last month      [ person Private v ]      | title bar
| Rozmowy    | +-------------------------------------------------------------+
|            | |                                                             |
| >  Grocery | |  (*) +-------------------------------------------+           |
|    spend   | |      | You spent **1 240,50 PLN** on groceries   |           |
|     3 Sep  | |      | in August, 18% more than in July...       |           |
|            | |      |                                           |           |
|    Budget  | |      | +---------------------------------------+ |           |
|    check ++| |      | | Expenses (12)                         | |           |
|     1 Sep  | |      | | Biedronka Wojska Polskiego 132,40 PLN | |           |
|            | |      | | Lidl Piotrkowska            98,10 PLN | |           |
|    Where's | |      | | +7 more                               | |           |
|    cheapest| |      | | Total:                   1 240,50 PLN | |           |
|    28 Aug  | |      | +---------------------------------------+ |           |
|            | |      +-------------------------------------------+           |
|    ...     | |                                                             |
|            | |                       +--------------------------------+    |
|            | |                       | And in July?                   |    |
|            | |                       +--------------------------------+    |
|            | |                                                             |
|            | |  (*) +-------------------------------------------+           |
|            | |      | Add a 240 PLN groceries expense?          |           |
|            | |      | +---------------------------------------+ |           |
|            | |      | | Confirm Action                        | |           |
|            | |      | | Amount:                    240,00 PLN | |           |
|            | |      | | Category:                   Groceries | |           |
|            | |      | |            [ Cancel ]  [ Confirm ]    | | <- not    |
|            | |      | +---------------------------------------+ |    2 bars |
|            | |      +-------------------------------------------+           |
|------------| +-------------------------------------------------------------+
|            |                        [ 4/50 AI ]                            |
|            | +-------------------------------------------------------------+
|            | | 16 | mic |  Ask about your budget...           | send | 16   | composer
|            | +-------------------------------------------------------------+
+==============================================================================+

  rail          full height; its own scrollbar appears ONLY on overflow
  title bar     full-width bar, column-width contents, 16px inset
  transcript    FlatList spans the content area; its CONTENT is capped to 760
  composer      full-width bar; its ROW is the column, same 16px inset
```

### What changes at 1024-1439

Almost nothing, and that is the finding. The rail is present throughout. The
only variable is the column:

- **1080 and up:** the column is at its 760 cap, centred in the content area;
  the void either side grows (180px each at 1440, 420px each at 1920) and stays
  empty. Widening a transcript past its measure makes it worse to read, so the
  void is the honest answer here — unlike the dashboard, where more width means
  more figures visible. What could occupy it at `SECOND_RAIL_MIN_WIDTH` (1680,
  the constant already exists) is under Open questions, not in this design.
- **1024 to 1080:** the column is 704-760, the measure 608-664, still inside
  the 72-79 character band. No layout concession, no dropdown, no collapsed
  rail.
- **Below 1024:** the mobile view, byte for byte, in a browser exactly as on
  native — one early return in `ChatView.web.tsx`.

**Centred, not left-aligned — and the settings precedent deliberately does not
transfer.** `SettingsShell` left-aligns its pane content ("centred content
inside a left-aligned shell reads adrift") because that content is a form or a
list whose rows share their left edge with fifteen sibling rows in the nav
beside them. A transcript is a document with its own two margins, and its
composer must sit under it; left-aligning at 1920 would hang the send button at
x=1080 with 840px of nothing to its right. The visual centre of the content area
is not the window's centre once the rail is there, which is correct, and is what
every mail and chat client does.

## States

**Loading, first paint on web.** SQLite is a mock, so both the transcript and
the conversation list start empty from a cold load. The transcript's emptiness
is *correct and permanent until you choose*: opening this tab starts a fresh
conversation on both platforms, and **desktop deliberately does not auto-open
the most recent conversation** — a screen that opens on a document you did not
ask for, and appends your next message to it, is worse than one that starts
blank. So: empty state in the column, no rail row highlighted (which correctly
says "you are in none of these"), rail in its own loading state.

**The rail's four states, and the three-valued rule.** `resolveRailState(status,
count)` is pure and tested:

| `conversationsStatus` | cached count | rail |
|---|---|---|
| `idle` / `loading` | 0 | `loading` — the `chat.loadingHistory` row (**wait**) |
| `loading` | N | `list` — paint what we have, refresh underneath |
| `ready` | 0 | `hidden` — genuinely nothing to show (**suppress**) |
| `ready` | N | `list` (**show**) |
| `error` | 0 | `retry` |
| `error` | N | `list` — a loaded list beats nothing |

`ready` + 0 is the only state allowed to claim "no conversations", and it is the
only one that has actually established it. `error` + 0 renders the rail with an
empty list and its header row pressable, labelled with the existing
`chat.history` key plus a refresh icon — a button labelled "History" that
reloads the history list is honest and key-free. **The wait is bounded** (§5d):
a 5s `setTimeout` started with the fetch flips `loading` to `error` if the
status has not moved, with `clearTimeout` in the effect teardown (the
`attemptRestoreSession` precedent), so a request that never settles cannot leave
a user with no route to their conversations.

**Populated.** As the wireframe. The rail highlights the current row, the title
bar names it, the transcript is bottom-anchored.

**Error, message send.** Already handled, and needs nothing new: `sendMessage`
catches its own failures and appends an assistant-role bubble carrying
`errors.chatError`, or `subscription.limitReachedBody` on a 403 — and the 403
also opens the global paywall through `useUpgradeStore`, which `UpgradeGate`
mounts at the root and which therefore already works on desktop.

**Error, voice.** `showAlert` — never `Alert.alert`, verified absent from every
file on this path — which on web renders the in-app `AlertDialogHost`. Correct
as-is, and worth stating because §5a records that trap being found twice.

**Viewer role.** Nothing is gated. A viewer may use the chat, and the AI chat's
own write actions are blocked server-side in `chat.service.ts`. No `canEdit`
check exists on this screen today and none is added.

## Interactions

- **Hover:** rail rows wash to `surfaceSecondary` (the `SettingsNav` idiom).
  That is the only hover state on the screen, it is decoration over a
  `Pressable`, and there is therefore **no hover-only affordance anywhere** —
  see the rail section for why (the conversation API offers no per-row action
  but select).
- **Keyboard:** Tab reaches, in order, the rail's new-conversation row, its
  conversation rows, the title bar's shared toggle, then the composer's mic,
  input and send, and any Confirm/Reject buttons in the transcript. Enter sends
  from the composer, Shift+Enter inserts a newline (already shipped, web-only).
  **No global key confirms a pending action**, by design.
- **Focus, on the one thing that is a dialog:** nothing new here opens a
  `Modal`. The only overlays on this screen are `AlertDialogHost` (voice error)
  and the root-mounted `UpgradeGate`, both of which already follow §3.
- **Selection:** none, and none is proposed. A transcript has no bulk action and
  the conversation API has no delete.
- **Right-click:** nothing. `ChatMessageItem`'s long-press already carries the
  copy action on both platforms.
- **Auto-scroll:** unchanged (`scrollToEnd` on every `messages` change, plus
  `onContentSizeChange`). Known consequence, deliberately not changed: a user
  who has scrolled up to re-read is yanked to the bottom when a poll delivers a
  message in a shared conversation. Making that conditional needs
  scroll-position tracking; it is under Open questions, not folded in here.

## Component moves and the file plan

Nothing moves out of `app/`: every component this screen renders already lives
under `src/`, so §3's "if the component lives under `app/`, move it to `src/`
first" does not bite. The route file itself becomes thin, matching the ABA-499
shape exactly.

| File | What it is |
|---|---|
| `app/(tabs)/chat.tsx` | Thin: calls the shared hook, renders the platform view. Route registration in `(tabs)/_layout.tsx` untouched |
| `src/components/chat/ChatMobile.tsx` | **Today's JSX and `createStyles`, moved verbatim.** The one definition of the mobile rendering. If it renders differently after this, that is a bug (§1) |
| `src/components/chat/ChatView.tsx` | Native: renders `ChatMobile`, nothing else |
| `src/components/chat/ChatView.web.tsx` | The one file that decides, on width alone: desktop above 1024, `ChatMobile` below |
| `src/components/chat/desktop/ChatDesktop.tsx` | The shell: rail, title bar, capped transcript, strips, composer bar |
| `src/components/chat/desktop/ConversationRail.tsx` | The rail and its four states |
| `src/components/chat/desktop/ChatEmptyState.tsx` | The desktop empty state and its capability legend |
| `src/features/chat/useChatScreenData.ts` | The state both views need |
| `src/features/chat/chatLayout.ts` | Pure, tested — see below |
| `src/features/chat/__tests__/chatLayout.test.ts` | Its tests |
| `src/components/chat/ChatMessageItem.tsx` | Extended with `desktop?: boolean`, default `false` |
| `src/components/chat/ActionConfirmationCard.tsx` | Same: `desktop?` gates the button row and the numeric styles |
| `src/components/chat/ActionResultCard.tsx` | Same: `desktop?` gates the numeric styles only |
| `src/components/chat/ChatHistorySheet.tsx` | **Untouched.** Phone only; not in the desktop tree |
| `src/components/webLayout.constants.ts` | Adds `CHAT_COLUMN_MAX_WIDTH` and `CHAT_RAIL_WIDTH` |
| `src/stores/chatStore.ts` | Adds `conversationsStatus` and `reset()` |
| `src/stores/authSessionActions.ts` | `chatStore.reset()` in `logoutAction`'s reset block |
| `src/features/chat/useChat.ts` | **Deleted** — dead, and a decoy (see the landmine section) |

**Where the shared hook is called, and why it matters.** `useChatScreenData()`
is called in **both platform `ChatView` files**, and its whole return value is
passed down as **one** `chat` prop — not called separately inside `ChatMobile`
and `ChatDesktop`. Two concrete reasons: the hook fires
`trackAction('chat_message', 'started')` once per mount and owns the
`completedRef` dedup whose per-visit contract is documented in a comment that
must not exist twice; and a browser resize across 1024 swaps the child, so a
hook mounted in the child would reset the half-typed draft and emit a second
`started`. One prop rather than twenty keeps `ChatMobile` a verbatim move in
everything but its parameter list.

What the hook owns, all of it lifted unchanged from today's `ChatScreen`:
`inputText`, the `flatListRef` and its two auto-scroll effects, the telemetry
mount effect and `completedRef`, `handleSend`, the voice wiring
(`useVoiceInput`, its two effects, `handleVoicePress`, `handleVoiceLongPress`),
`useMentionBar`, `useChatPolling`, the `loadMembers` effect, the
`?conversationId=` deep-link effect, `canToggleShared`, and the store
selections. `historyVisible` stays local to `ChatMobile` — it is the sheet's
state, and the sheet has no desktop existence.

## The pure modules, because nothing renders in CI

`src/features/chat/chatLayout.ts`, theme-free so that it is testable:

```
export type ConversationListStatus = 'idle' | 'loading' | 'ready' | 'error';
export type RailState = 'hidden' | 'loading' | 'list' | 'retry';

resolveRailState(status: ConversationListStatus, count: number): RailState
railIsVisible(state: RailState): boolean
chatColumnWidth(windowWidth: number, gutter: number, railVisible: boolean): number
currentConversationTitle(conversations, currentConversationId): string | null
conversationDateLabel(updatedAt: Date): string
```

`chatColumnWidth` takes the gutter as an **argument** rather than importing
`theme.spacing[5]`, so the module has no theme dependency and the table under
"The measure" is literally its test fixture: 1024 / 1080 / 1440 / 1920, each
with and without the rail, plus the degenerate narrow case — it must never
return a negative or zero width.

`conversationDateLabel` is a deliberate second copy of the one-line expression
inside `ChatHistorySheet`, **not** an extraction from it: collapsing them would
edit the phone's file for no functional gain. Say so in the doc comment, so
that the next reader does not "fix" it in the direction that touches mobile.

Everything else — layout, hover, focus order, the 13 accents, both themes, and
the 72-79 character band as Montserrat actually renders it — is verified by a
person on the deployed build. Nothing in this repo renders a component in CI.

## What a plan must not do

1. **Must not let `ChatMobile.tsx` be anything but a verbatim move** (plus the
   one `chat` prop). §1: if the mobile rendering changes, that is a bug.
2. **Must not add an i18n key.** Every string above already exists in all nine
   locales. If a design idea needs a key, the idea is out of scope, not the
   constraint.
3. **Must not route `ChatHistorySheet` through `SheetDialog` "while we're
   here".** It is phone-only under this design, and the wrapper's mobile branch
   differs from it in ground colour, scrim colour, padding and `maxHeight`.
4. **Must not raise the action cards' row caps** (5 items, 8 categories). Width
   is free on this screen; height is not.
5. **Must not give the rail or the transcript
   `showsVerticalScrollIndicator={false}`.** §2: never hide a scrollbar to make
   the page look calmer.
6. **Must not bind any key to confirming a pending action.**
7. **Must not cap the composer's or the title bar's *surface* to the column.**
   The bars are full width, their rows are the column; capping the surface
   leaves the transcript's ground showing beside a floating island.
8. **Must not cap the transcript by wrapping the `FlatList`** — cap its
   `contentContainerStyle`, so the scrollbar stays at the window's right edge.
9. **Must not use `CONTENT_MAX_WIDTH` or `useContentWidth()` for the column.**
10. **Must not reimplement `ChatMessageItem`, `ActionConfirmationCard` or
    `ActionResultCard` for desktop.** Additive `desktop?: boolean` props
    defaulting to `false`, per §5a.
11. **Must not introduce a page scroll, or move the rail inside one.** There is
    no page scroll on this screen and there must not be — see Departures.
12. **Must not ship the rail without the `chatStore` teardown.** A rail loaded
    on mount without the account-switch reset displays another account's
    conversations, and the composer would post into one of them.
13. **Must not rewire `ChatHistorySheet`'s `isLoading` prop.** Add
    `conversationsStatus` and read it from the desktop only.
14. **Must not delete the History button from the mobile path**, nor the
    conditional top-row "New Conversation" button there.
15. **Must not put the conversation title in `WebTopBar`.** §2 forbids a page
    title beside the brand; the title bar here names a *document inside* the
    screen, which is a different thing, and it belongs in the content column
    where the transcript it names begins.
16. **Must not build on `src/features/chat/useChat.ts`.** It is dead; delete it.
17. **Must not add a dependency**, and must not reach for a virtualised-list or
    markdown library "for desktop". The existing `FlatList` and
    `react-native-markdown-display` are what render this.

## Departures from the design language

**§2's "one page scroll per screen" — a genuine departure, and the first one on
this branch.** Both existing rails sit *inside* their screen's single page
`ScrollView`: `ExpensesDesktop` renders `<FacetRail layout="stack">` inside its
`pageScroll`, and `SettingsShell`'s doc comment says so in as many words ("Both
panes sit inside this component's single `ScrollView`... so there is never a
second scroller"). Chat cannot do that, for two reasons that are properties of a
transcript rather than preferences: its primary control (the composer) must stay
put while the content moves, and its content is anchored to its **end**, not its
start. A document scroll can express neither.

Three things make this a narrow departure rather than a licence:

- **The fixed-height shell is not something this design introduces.** The
  shipped mobile screen is already `SafeAreaView flex:1` then
  `KeyboardAvoidingView flex:1` then `FlatList`, so the deployed web build at
  1920 today already has a docked composer and an internally-scrolling
  transcript. What this design adds is the rail — the *second* scroller — not
  the absence of a page scroll.
- **The second scrollbar usually does not exist.** Verified from
  react-native-web's source: `ScrollView`'s vertical base style is
  `overflowY: 'auto'`, so a scrollbar appears only on overflow. The rail holds
  at most 20 rows (`LIMIT 20`, server-side); at about 48px a row that is about
  960px, so it overflows only below roughly a 1000px viewport and is bar-less on
  a typical laptop.
- **The rule's intent is honoured.** Its targets are a scroller per pane inside
  a document, and dead gutters. Here there is one document scroller, positioned
  so its bar is at the window's right edge, and a list beside it — the
  mail-client shape, which is what a screen with a docked composer is.

**§5's List-specific threshold pattern is deliberately not inherited.** The rail
does not collapse to a labelled dropdown below 1440, because the arithmetic says
it fits at 1024 with the measure still inside its band. Carrying
`FACET_RAIL_MIN_WIDTH` here by analogy is exactly what §5 warns against.

**A behavioural difference from the phone, stated plainly:** on desktop the
History button is gone and the conversation list is always visible; and once
`chatStore.reset()` is wired to the account boundary, switching accounts clears
the open conversation **on both platforms**. The second of those is a bug fix
that changes the mobile behaviour, and §5g's precedent governs how it ships —
the commit says so in its first paragraph.

No other departures. The absence of a facet rail, day grouping, per-currency
totals and checkbox selection on this screen is conformance to the
Universal/List-specific split, not divergence from it.

## Findings outside this layout's scope

Four pre-existing defects found while reading, none of them layout, all of them
touching the phone. They are listed here so they are not folded in silently;
each needs its own decision.

1. **`ActionConfirmationCard`'s Confirm button hardcodes `#FFFFFF`** for both
   its label (`confirmButtonText`, line 158) and its in-flight
   `ActivityIndicator` (line 87), on a `theme.colors.primary` fill. `primary`
   *is* the user's accent, and `deriveAccentColors` picks the on-accent
   foreground by luminance precisely so this stays legible — which is what
   `textInverse` is for. With the amber preset (`#EAB308`) that button is white
   on light amber, roughly 1.9:1; cyan, green and sky are marginal. Same class
   as ABA-450's invisible header actions. A one-token fix
   (`theme.colors.textInverse`), visible on the phone, and made more conspicuous
   by this design because the confirmation card becomes the widest, most
   prominent element on the tab.
2. **Four hardcoded English `"more"` strings** in `ActionResultCard` —
   `+{n} more` at lines 90, 179, 195 and 232 — untranslated in all nine
   locales, and now rendered in a 664px card that draws the eye.
3. **`ChatHistorySheet` is handed the wrong loading flag.** It receives
   `isLoading` from `chatStore`, which is the message-in-flight flag; nothing
   reports conversation-list loading today. So opening History with no message
   in flight shows "No conversations yet" until the fetch lands. The
   `conversationsStatus` flag this design adds is the fix for the phone too, in
   a follow-up that is allowed to touch the mobile rendering.
4. **`chatStore` survives sign-out.** No `reset()`, and not in `logoutAction`.
   On web, signing out and signing in as someone else in the same tab leaves the
   previous user's `messages` and `conversations` in memory for the chat tab to
   paint — the §5d class, and the same sentence that was written about
   `inflationShieldStore` ("had no `reset()` at all"). Required by this design
   anyway (see the rail), but worth naming as a privacy defect in its own right
   rather than as rail plumbing.

One more, a smell rather than a defect: `QuickActions` and `EmptyChat` are
declared **inside** `ChatScreen`'s body, so their component identity changes on
every render — meaning the empty state remounts on every keystroke in the
composer while the transcript is empty. Harmless today (neither holds state).
The desktop empty state is a real module and does not inherit it; the mobile one
keeps it, because that fix belongs to the verbatim move's follow-up rather than
to the move.

## Copy note — "Личный", and the zero-key answer

The brief is right that `chat.private` is `'Личный'` in Russian while
`accounts.personal` is also `'Личный'`, so the two words can collide. Read
precisely, `AccountSwitcher` renders the account's own *name* and falls back to
`accounts.personal` only when there is no account, so a literal
same-string-twice collision is the fallback case — but the ambiguity is real
without it: "Личный" beside an account name reads as *this account is personal*
rather than *this conversation is not shared with the household*.

**The layout answer costs no keys, and this design already takes it:** the chip
moves out of a screen-level top bar and sits immediately beside the current
conversation's title, on the object it describes. A word attached to a
conversation's name is read as a property of that conversation.

If the copy should change as well — `chat.private` towards "Only me" / "Только
я" / "Tylko ja" — that is a nine-locale i18n change, and this body of work has
shipped without adding a key. Recommended as a separate, explicitly authorised
change, not smuggled in here.

## Open questions

- **The rail at 1024.** The arithmetic says 280 plus a 704 column fits with the
  measure intact; whether 27% of a 1024px window given to a secondary list
  *feels* right is a judgement for the product owner's eye. If it does not, the
  remedy is a `CHAT_RAIL_MIN_WIDTH` threshold below which the rail collapses and
  the History button returns — which is why nothing in the mobile history path
  is deleted.
- **Whether 760 is the right column.** It puts the measure at 72-79 characters
  with Montserrat's wide advance, chosen at the upper end of the comfortable
  band because the assistant emits markdown tables and multi-column result
  cards. A narrower 700 would read slightly easier as prose and slightly worse
  as data. Only eyes on the deployed build can settle it, and it is one
  constant.
- **The 420px void either side at 1920.** Deliberately empty, argued above. The
  standing candidate for it is a pinned-result panel at `SECOND_RAIL_MIN_WIDTH`
  (1680) holding the most recent `actionResult` while you keep chatting —
  genuinely desktop-only, and immediately in tension with §5a's redundancy rule,
  since the same card is also in the transcript. Named, not designed.
- **Whether the rail appearing after the first message reads as a jump.** Once
  per account, inside a bigger transition; fallback stated in the rail section.
- **Whether the capability legend is a good use of the empty state, or clutter
  that dilutes the three suggestions.** It is eleven already-translated labels;
  the alternative is more whitespace. A product-owner call, and cheap to drop.
- **Whether the mic actually works on web.** The evidence says it is meant to:
  `uriToBase64` has an explicit web branch whose comment says "recorded/picked
  URIs are `blob:`/`data:` URLs anyway", which only matters for a recording made
  in a browser. But `expo-av`'s web recorder, and whether Whisper accepts what
  it produces, are unverified here — and if the mic is dead it is a dead control
  at the left edge of every desktop composer. Deliberately not designed around
  either way: removing it on a guess would be a content loss.
- **The auto-scroll yank in a shared conversation.** Fixing it needs
  scroll-position tracking ("stick to the bottom only if already at the
  bottom"), which is a real behaviour change and is desktop-shaped — a mouse
  wheel makes it easy to scroll up mid-conversation in a way a phone does not.
  Deferred, and named.
- **Whether a 200-message conversation performs.** `loadConversation` fetches up
  to 50 and the list is virtualised, so probably yes — but §5g's measurement
  lesson applies: any claim here needs a keystroke-timed falsification in a real
  browser, not an argument.
