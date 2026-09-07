# AI Chat Desktop Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the AI Chat tab a desktop layout — a 280px conversation rail and a 760px reading column — and fix the two correctness defects the design pass found on the way.

**Architecture:** The sixth screen through the ABA-499 shape: the route stays single, one component-level `.web.tsx` decides on width alone, and the mobile JSX keeps exactly one definition. **This wave opens with fixes rather than a move**, for a stated reason: the rail cannot ship without `chatStore` teardown (a rail loaded on mount without an account-switch reset displays another account's conversations, and the composer would post into one of them), and the store also survives sign-out today, which is a privacy defect independent of any layout.

**Tech Stack:** Expo Router, React Native Web, TypeScript, Jest (nothing renders a component in CI).

**Spec:** `docs/design/2026-09-07-chat-desktop-web.md` — **read it before Task 1**, in particular its "One landmine to name before anything else", its file plan under "Component moves", its "The pure modules" section, and its **seventeen-item "What a plan must not do"**, which is the source of most of the Global Constraints below.
**Language:** `docs/contracts/desktop-web-design-language.md` — 1–4 universal, 5a–5h what each screen established (5a's additive-prop pattern and 5h's route-vs-dialog test both bear on this), 6 lists things that look like defects and are not.

## Global Constraints

Copied from the spec's own list where they are binding; every task's requirements include all of them.

- **The mobile rendering must not change — with the two deliberate exceptions in Task 1**, which are fixes the phone has too and must be named as such in their commits' first paragraphs.
- **`ChatMobile.tsx` must be a verbatim move**, plus the one `chat` prop. If the phone renders differently afterwards, that is a bug, not a feature.
- **Zero new i18n keys.** Every string this design needs already exists in all nine locales. If an idea needs a key, the idea is out of scope, not the constraint.
- **Do not route `ChatHistorySheet` through `SheetDialog`** "while we're here": it is phone-only under this design, and the wrapper's mobile branch differs from it in ground colour, scrim colour, padding and `maxHeight`, so it would need all three legacy escape hatches to stay byte-identical.
- **Do not raise the action cards' row caps** (5 items, 8 categories). Width is free on this screen; height is not.
- **Do not hide a scrollbar** — no `showsVerticalScrollIndicator={false}` on the rail or the transcript.
- **Do not bind any key to confirming a pending action.** `Enter` already sends.
- **Do not cap the composer's or the title bar's *surface*** to the column — the bars are full width, their rows are the column. And **do not cap the transcript by wrapping the `FlatList`**: cap its `contentContainerStyle`, so the scrollbar stays at the window's right edge.
- **Do not use `CONTENT_MAX_WIDTH` or `useContentWidth()`** for the column. 1080 is ~125 characters, worse than what it replaces.
- **Do not reimplement** `ChatMessageItem`, `ActionConfirmationCard` or `ActionResultCard` for desktop — additive `desktop?: boolean` defaulting to `false`, per 5a.
- **Do not introduce a page scroll on this screen, or move the rail inside one.** This is the branch's first deliberate departure from the one-page-scroll rule; the spec's Departures section argues it.
- **Do not put the conversation title in `WebTopBar`**, do not delete the History button or the conditional "New Conversation" button from the mobile path, and do not rewire `ChatHistorySheet`'s `isLoading` prop.
- **Do not add a dependency**, and do not reach for a virtualised-list or markdown library. The existing `FlatList` and `react-native-markdown-display` are what render this.
- Nothing under `src/` may import from `app/`. Every colour, spacing and text style from `useTheme()` tokens; `success`/`danger`/`warning`/`onSemantic` are not accent-derived, `textInverse` is.
- **A pure move must not move the test count.** Diff both directions.
- **Record what jest reports; never predict — and do not expect a number here.** This plan deliberately states no baseline count, because task 1 moves it and every brief extracted afterwards would inherit a stale figure (it did once: task 2's brief said 1318/136 when the tree was already at 1325/137, and its reviewer had to reconcile the two). Read the count off the tree at the moment you start: `cd apps/mobile && npx jest`. What matters is the RULE, not the figure — **a pure move must not change it, and a task that adds tests must account for exactly the ones it added.**

---

### Task 1: The two fixes, and delete the decoy

**Files:**
- Modify: `src/stores/chatStore.ts`, `src/stores/authSessionActions.ts`, `src/stores/accountStore.ts`, `src/components/chat/ActionConfirmationCard.tsx`
- Delete: `src/features/chat/useChat.ts`
- Test: whichever store spec covers the teardown

**This task deliberately changes the phone's behaviour, twice.** Both are defects the phone has today. Say so plainly in the commit messages, as this branch has done for the microphone, the viewer permissions, the change-email header key and wave 4's two keyed loads.

- [ ] **Step 1: Establish the leak before fixing it.** I verified three things and you should confirm them rather than inherit them: `chatStore` has **no `reset()`**, it is **absent from `logoutAction`**, and it is **absent from `clearAccountScopedCaches()`**. So a conversation list survives both sign-out and an account switch. The sign-out case is the more serious — it is the same class as `inflationShieldStore` in ABA-507, where a cache readable by the next person to sign in on that browser was the finding.

- [ ] **Step 2: Follow the two mechanisms that already exist.** `logoutAction`'s reset block is one; `accountStore`'s single `useAccountStore.subscribe((state, prev) => …)` → `clearAccountScopedCaches()` is the other, and wave 4's own comment there says why the callers cannot be enumerated. **Decide whether chat needs both** and argue it: a conversation belongs to an account (`accountId` on `ChatConversation`), and sign-out teardown is unconditional because sign-out is also reached from a 401 cascade with the tokens already gone.

- [ ] **Step 3: Test it, red first.** Name the production change each test catches before writing it. The interesting one is the account switch: a test that only proves "conversations reload" passes even if the stale list is still on screen while the reload is in flight, which is precisely the defect wave 4's `tagStore` decision turned on.

- [ ] **Step 4: The contrast fix.** `ActionConfirmationCard.tsx:158` hardcodes `color: '#FFFFFF'` for the Confirm button's label (and line 87 for its spinner) on a fill that is the **accent**, so at a yellow accent it measures ~1.9:1. This is the ABA-450 class — that entry's rule is that a header action must be `textInverse`, and the reason is the same here: `textInverse` is accent-derived and tracks the accent's own on-colour, while a literal white does not. Check all 13 accents' derived on-colour rather than assuming one substitution fixes it, and check whether the sibling Reject button has the same problem.

- [ ] **Step 5: Delete `src/features/chat/useChat.ts`.** Confirm zero consumers yourself (`grep -rn "useChat\b" src app` outside its own file). It holds an older, divergent `sendMessage` that calls `api` directly and bypasses pending actions, shared-chat reconciliation and the 403 paywall — so it is not merely dead, it is a decoy for whoever is next told to put chat state in `src/features/chat/`.

- [ ] **Step 6: Verify and commit.** Two commits are fine — the teardown and the contrast fix are unrelated.

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/stores apps/mobile/src/components/chat apps/mobile/src/features/chat
git commit -m "ABA-513 Tear down the chat store on sign-out and on an account switch"
```

---

### Task 2: Extract, so a second view can share it

**Files:**
- Create: `src/components/chat/ChatMobile.tsx`, `src/components/chat/ChatView.tsx`, `src/components/chat/ChatView.web.tsx`, `src/features/chat/useChatScreenData.ts`
- Modify: `app/(tabs)/chat.tsx`

- [ ] **Step 1: Read `src/components/expenses/ExpensesMobile.tsx` and its gate pair first.** That is the shape, proved on five screens. Every line that leaves the route must reappear.

- [ ] **Step 2: The hook is called in BOTH platform `ChatView` files and its whole return value passed down as ONE `chat` prop** — not called separately inside `ChatMobile` and `ChatDesktop`. The spec gives two concrete reasons and both are load-bearing: the hook fires `trackAction('chat_message', 'started')` once per mount and owns the `completedRef` dedup whose per-visit contract is documented in a comment that must not exist twice; and a browser resize across 1024 swaps the child, so a hook mounted in the child would reset the half-typed draft and emit a second `started`.

- [ ] **Step 3: What the hook owns** is listed exhaustively in the spec's "Component moves" section — lift it unchanged. `historyVisible` stays local to `ChatMobile`: it is the sheet's state and the sheet has no desktop existence.

- [ ] **Step 4: The gate renders `ChatMobile` on both sides for now.** `ChatDesktop` arrives in Task 4, and a `null` stub blanks the chat tab in every desktop browser until then.

- [ ] **Step 5: Verify and commit.** A pure move must not change the test count; diff both directions.

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/components/chat apps/mobile/src/features/chat apps/mobile/app/\(tabs\)/chat.tsx
git commit -m "ABA-513 Extract the chat screen's JSX and state so a second view can share them"
```

---

### Task 3: The pure module and the two constants

**Files:**
- Create: `src/features/chat/chatLayout.ts` and `src/features/chat/__tests__/chatLayout.test.ts`
- Modify: `src/components/webLayout.constants.ts`

- [ ] **Step 1: `CHAT_COLUMN_MAX_WIDTH = 760` and `CHAT_RAIL_WIDTH = 280`** go in `webLayout.constants.ts` beside `DESKTOP_MIN_WIDTH`, `FACET_RAIL_MIN_WIDTH`, `SECOND_RAIL_MIN_WIDTH`, `SETTINGS_NAV_WIDTH` and `WEB_TOP_BAR_PADDING_X` — never inline.

- [ ] **Step 2: The five functions** are named with their signatures in the spec's "The pure modules" section: `resolveRailState`, `railIsVisible`, `chatColumnWidth`, `currentConversationTitle`, `conversationDateLabel`. **`chatColumnWidth` takes the gutter as an argument** rather than importing `theme.spacing[5]`, so the module is theme-free and testable.

- [ ] **Step 3: Test it, red first, and the spec's own table is the fixture** — 1024 / 1080 / 1440 / 1920, each with and without the rail, plus the degenerate narrow case: **it must never return a negative or zero width.** Before each test, name the production change that would make it fail. This project has shipped tests that could not fail; do not add another.

- [ ] **Step 4: `conversationDateLabel` is a deliberate second copy** of the one-line expression inside `ChatHistorySheet`, **not** an extraction from it — collapsing them would edit the phone's file for no functional gain. Say so in its doc comment, in the terms the design language uses for the other deliberate duplications (`financial-month.ts`, `receipt-category-split.ts`), so the next reader does not "fix" it in the direction that touches mobile.

- [ ] **Step 5: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/features/chat apps/mobile/src/components/webLayout.constants.ts
git commit -m "ABA-513 Add the chat column arithmetic and its two constants"
```

---

### Task 4: The desktop shell and the rail

**Files:**
- Create: `src/components/chat/desktop/ChatDesktop.tsx`, `src/components/chat/desktop/ConversationRail.tsx`
- Modify: `src/components/chat/ChatView.web.tsx`

- [ ] **Step 1: Build to the spec's wireframe at 1440** and its "What changes at 1024–1439" section. The band needs no dropdown and no second threshold: the column reaches its cap at exactly 1080, so the whole story between 1024 and 1439 is that the column is 704–760 instead of 760. **Do not invent a threshold constant for it.**

- [ ] **Step 2: The rail's four states** are `hidden | loading | list | retry`, resolved by Task 3's `resolveRailState` — not by conditions written inline. Note the "New Conversation" button in today's top row renders **only when `currentConversationId` is set**, so it is absent exactly when a newcomer arrives; the spec calls that load-bearing for the rail's own affordances.

- [ ] **Step 3: `conversationsStatus` is a new `chatStore` field read by the desktop only.** Do not rewire `ChatHistorySheet`'s existing `isLoading` prop, which is wired to the message-in-flight flag rather than to any conversation-list loading state — that is a real defect, and it is recorded as a follow-up rather than fixed here.

- [ ] **Step 4: The three placement rules**, each of which has a visible failure mode: the title bar and composer bar are **full width with their rows capped to the column** (capping the surface leaves a floating island with the transcript's ground beside it); the transcript is capped through its **`contentContainerStyle`** (wrapping the `FlatList` moves the scrollbar off the window edge); and there is **no page scroll** (the transcript scrolls, the rail scrolls, and RNW's `ScrollView` is `overflowY: auto`, so the rail's scrollbar exists only on overflow).

- [ ] **Step 5: Wire the gate.** `ChatView.web.tsx` stays the only place the decision is made.

- [ ] **Step 5a: Render the three message components WITHOUT a `desktop` prop.** It does not exist yet — Task 5 adds it and passes it. Nothing here should anticipate it, and nothing here should render an empty state: Task 5 owns both.

- [ ] **Step 6: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
cd /d/Work/micode/ai-budget-assistant && bash scripts/build-web.sh
git add apps/mobile/src/components/chat apps/mobile/src/stores/chatStore.ts
git commit -m "ABA-513 Lay out the chat screen for a desktop window"
```

---

### Task 5: The empty state, and the three cards' desktop props

**Files:**
- Create: `src/components/chat/desktop/ChatEmptyState.tsx`
- Modify: `src/components/chat/ChatMessageItem.tsx`, `ActionConfirmationCard.tsx`, `ActionResultCard.tsx`, **and `src/components/chat/desktop/ChatDesktop.tsx`**

**Why this task also touches `ChatDesktop`, settled in the pre-flight scan rather than left to be discovered:** Task 4 renders the transcript, so it renders `ChatMessageItem` — but the `desktop?` prop does not exist until this task. So **Task 4 renders those three components without the prop**, and this task adds each prop *and* passes it from `ChatDesktop`. The same applies to the empty state: Task 4 leaves no seam for it, so wiring `ChatEmptyState` into `ChatDesktop` belongs here too. **Do not revert Task 1's `#FFFFFF` → accent-derived contrast fix** in `ActionConfirmationCard` while adding its `desktop?` prop; the two changes are in the same file and unrelated.

- [ ] **Step 1: The bubble cap stops being a percentage of the viewport.** On desktop the **assistant** bubble has no cap of its own — the column is the cap — while the **user** bubble keeps its percentage of the now-bounded row. The spec's measure is 608–664px, i.e. 72–79 characters, at every width from 1024 up, against ~264px on a phone and ~1510px today. Every prop is `desktop?: boolean` defaulting to `false`; if any of the three cannot be extended that way, stop and report rather than reshaping it.

- [ ] **Step 2: The empty state stays in the same column** so the first message moves nothing horizontally, and spends the room on a capability legend built from the **eleven already-translated `chat.action*` labels**. Zero new keys: only three `*Q` keys exist, so a fourth suggestion chip is impossible and is not the answer.

- [ ] **Step 3: Two width consequences the cards inherit**, both named in the spec: `ActionConfirmationCard`'s two `flex: 1` buttons become ~326px bars, wider than the same pair in any dialog this app draws; and `tabular-nums` is missing wherever these cards line up figures. Fix both on the desktop path only.

- [ ] **Step 4: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/components/chat
git commit -m "ABA-513 Give the chat bubbles and action cards a desktop measure"
```

If a pre-existing test count moves, you changed behaviour rather than extending it — say so before anything else.

---

### Task 6: Verification, docs, and the issue

- [ ] **Step 1: Look at it** — both themes, several accents, at 1920, 1440, 1200 and 1024; with no conversations, with one, with many; with a pending action card on screen; and **with an account switched while the chat tab is open**, which is what Task 1 exists for and the only thing that proves it.

- [ ] **Step 2: Measure the thing the whole design turns on.** The spec claims 72–79 characters at every width from 1024 up. Check it as Montserrat actually renders it, not as the arithmetic predicts.

- [ ] **Step 3: Confirm the phone is untouched** below 1024, except Task 1's two fixes.

- [ ] **Step 4: The native bundle check**, grepping the desktop **UI** and never a component name — a native no-op carries the same name, and a probe goes stale (5f):

```bash
cd apps/mobile && npx expo export --platform android --output-dir /d/tmp/native-check-513 --clear
HBC=$(ls /d/tmp/native-check-513/_expo/static/js/android/index-*.hbc | head -1)
for n in ChatDesktop ConversationRail ChatEmptyState; do echo "$n $(grep -c -a $n $HBC)"; done   # expect 0
```

- [ ] **Step 5: Update the design language doc** with what this screen established — above all the departure from the one-page-scroll rule and its argument, since that is the first on this branch and will otherwise be re-litigated. It is gitignored: `git add -f`. Update CLAUDE.md too.

- [ ] **Step 6: Extend `user_docs/<lang>/30-web-app.md` in all nine locales** and run `npm run generate:help`. ABA-499 set that convention and four issues ignored it before ABA-512 closed the gap; do not reopen it. Only slugs are ASCII — visible copy uses each language's real orthography, and proofread before landing.

- [ ] **Step 7: Create ABA-513.** Name Task 1's two changes as fixes that alter the mobile rendering, and record the follow-ups this pass found but did not fix: `ChatHistorySheet`'s `isLoading` wired to the wrong flag, the four untranslated English "more" strings (which need keys this design may not add), and the "Личный" copy collision the spec's copy note describes.

---

## Deployment notes

- Stays on `feature/desktop-web-screen`. A push to `development` rebuilds and ships the SPA with no separate step — a push IS a release, and that is the product owner's call.
- **Task 1's two fixes reach phones only at the next store release**; the web build gets them on the next push. State that asymmetry in the issue rather than discovering it later.
- Verify in a browser served from a private build directory, never `apps/mobile/dist`. Build it with **`EXPO_PUBLIC_API_URL=http://localhost:8099/api/v1` and `--clear`** — a leading-slash value is rewritten to a Windows path by Git Bash's MSYS layer, and Expo caches the inlined value, so a rebuild without `--clear` silently keeps the old one. Check `index.html` exists; the export's exit code lies when run from the wrong directory.
