# Chat Conversation Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let people rename, delete and pin their chat conversations, and make a conversation's sharing state obvious — on the desktop rail and the phone's history sheet both.

**Architecture:** Four product requests that land on the same list rows, so they are specced and built together rather than four times. Three new endpoints on `AiController`; one new join table; no column on `ChatConversation`. **The pin is per viewer, not per conversation** — the spec's fork, ruled with an argument, and it is what makes every row carry at least one action and therefore what makes the row layout uniform.

**Tech Stack:** NestJS 10 + Prisma 5 (API), Expo/React Native Web (client), Jest (nothing renders a component in CI).

**Spec:** `docs/design/2026-09-07-chat-conversation-management.md` — 1042 lines, and **read it before task 1**, not in excerpts. Its "Corrections to the briefs" section overturns things I believed; its "The pin fork" section is the ruling everything else hangs off; its **twenty-five-item "What a plan must not do"** is the source of most Global Constraints below; and its "API additions" and "The pure modules" sections give exact shapes and test fixtures.
**Language:** `docs/contracts/desktop-web-design-language.md` — 1–4 universal, 5a (one leader; additive props), 5g (naming a mobile change in the commit), 5i (the chat screen's own entry, including why `ChatHistorySheet` is not routed through `SheetDialog`), 6 (things that look like defects and are not).

## Global Constraints

Most of these are the spec's own prohibitions, kept in its words because each names a specific way to be wrong. Every task's requirements include all of them.

- **Do not generalise `expenses/desktop/RowContextMenu.tsx`.** It is hardcoded to three ledger items and reasons about a *role* gate; the chat rail's gate is *ownership*. Write a chat sibling and reuse the **pattern** — viewport clamping, RN `Modal`, raw `<div>` scrim, `menuitem` roles — never the file. It is shipped and product-approved.
- **The phone's row menu is an absolutely-positioned `View` inside `styles.modalOverlay`** — not a `Modal` (nested inside the sheet's own it is flaky on iOS; as a sibling it stacks two presented modals), and **not** inside `styles.modalSheet`, whose `maxHeight: '70%'` would confine it.
- **Do not hand-author a red delete button.** `showAlert` + `style: 'destructive'` already renders `danger`/`onSemantic`. ABA-450 is what a hardcoded red cost.
- **Do not use `common.deleteConfirmTitle`** — it is literally `'Delete Transaction'`.
- **Two delete messages, and the shared one is the whole guard.** Never show the private message for a shared conversation.
- **No soft delete, no undo, no bot cleanup.** `chat()` self-heals an unresolvable id by creating a new conversation, which is what makes a hard delete safe for the three bots; a soft delete would make them keep appending to a deleted row.
- **Do not conditionally render the rail's `⋯`** — opacity-gate it, or the title re-truncates under the cursor.
- **Do not leave `currentConversationId` pointing at a deleted conversation** — call `startNewConversation()` when the open one goes.
- **Do not derive ownership from the SQLite cache.** `loadConversations` writes the current user's id onto every cached row, so the cache *cannot* answer it. Read `ownedConversationIds` (already in `chatStore`, from the `isOwner` the API already returns) and accept that it is empty until the network answers — the cache-first paint shows a **non-owner** menu, never a wrong one.
- **Do not read `accountMembers.length <= 1` as "single-member account".** `0` means unknown or failed; `1` means single.
- **Do not sort pinned rows on the client.** The pin is part of the **query**; a client sort silently loses any pin outside the 20 most-recently-updated. And do not order the pinned block by `pinnedAt` without also exposing and mirroring `pinnedAt`, or the phone's cache-first paint reshuffles it when the fetch lands.
- **Do not write `orderBy: { pins: { _count: 'desc' } }`.** It compiles, and it orders by how many *other people* pinned the row.
- **Do not delete a pin when a conversation is unshared** (it is inert, not orphaned; re-sharing restores it), and **do not add `accountId` to the pin table** (pins are per-account by construction).
- **No `ViewerBlockGuard` on any of the three endpoints**, matching `/shared`.
- **Rename and delete mirror `setConversationShared` exactly, including the order**: `findFirst({ where: { id, accountId } })` → 404, *then* `conversation.userId !== userId` → 403. That order is deliberate existence non-disclosure; do not tidy it into one query. **The pin does not** — its predicate is read visibility (`OR: [{ isShared: true }, { userId }]`) and it has no ownership check; giving it `/shared`'s own `{ id, accountId }` lookup would let a member pin, and thereby confirm the existence of, a co-member's private conversation.
- **Do not forget `updatedAt: conversation.updatedAt` on the rename**, or `@updatedAt` bumps it and the row teleports to the top of both surfaces.
- **Do not put rename/delete/pin in the desktop title bar as well as the rail** (§5a: one leader — the open conversation's own rail row is right there, and its `⋯` is revealed *because* it is selected).
- **Do not bind a key to Delete or Unpin.**
- **Do not route `ChatHistorySheet` through `SheetDialog`**, and do not normalise its ground colour, scrim, padding or `maxHeight` "while we're here".
- **Do not add a width constant for the rename dialog** — `SheetDialog`'s 480 is the one number. **Do not let Save fire on an empty or unchanged title.**
- **Exactly six new i18n keys, all in `chat.*`**, enumerated in the spec's decision 6 with the reason nothing existing serves each. A seventh needs an argument against those six. All nine locales, real orthography — only slugs are ASCII in this project.
- **Three named changes to the mobile rendering and no more**: the trailing `⋯` and long-press on sheet rows, the leading `pin` icon and the new order, and the `swap-horizontal` glyph in the top-bar pill. Each must appear in its commit's first paragraph.
- Nothing under `src/` may import from `app/`; no new dependency; colours, spacing and text styles from `useTheme()` tokens.
- **Record what jest reports; never predict, and expect no baseline figure here** — one went stale mid-wave on the previous plan and its brief had to be reconciled by a reviewer. Read the count off the tree when you start.

---

### Task 1: The pin table, the list query, and the merge

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (+ migration), `apps/api/src/modules/ai/services/chat.service.ts`, `packages/shared-types/src/dto/` (the conversation summary)
- Create: `apps/api/src/modules/ai/utils/conversation-list.ts` and its spec

**Why first:** the fork's ruling is the foundation, and `mergeConversationLists` is the one piece of this whole plan whose correctness is provable in CI.

- [ ] **Step 1: The table.** `chat_conversation_pins`, keyed on (user, conversation), **no `accountId`** — pins are per-account by construction because the list is account-scoped. Cascade from both sides. Follow the repo's migration convention; note this repo authors migrations DB-free via `prisma migrate diff` (see the `inflation_shield_recommendations` precedent) because migrations run against prod from the deploy container.

- [ ] **Step 2: Two queries and a pure merge**, per the spec's "The pin has to be in the query". A pinned conversation three months old is outside the twenty most-recently-updated, so a single query cannot return it — that is the whole reason for two. `mergeConversationLists(pinned, recent)` is pure and lives in the API-local util.

- [ ] **Step 3: Test the merge, red first**, with the spec's own fixtures, and name the production change each catches before writing it. The two that matter: a pinned row that is **also** in the recent 20 must appear **once**, in the pinned block; and a pinned row **outside** the recent 20 must appear **at all** — that second one is the entire justification for the two-query shape, so a suite without it does not defend the design.

- [ ] **Step 4: `isPinned` on the summary.** `ChatConversationSummary` gains it. Do not add `pinnedAt` unless you also mirror it into SQLite — see the Global Constraints for why half of that is worse than neither.

- [ ] **Step 5: Verify and commit.**

```bash
cd apps/api && npx prisma generate && npx tsc --noEmit && npx jest
git add apps/api packages/shared-types
git commit -m "ABA-514 Add per-viewer conversation pins and return them in the list"
```

---

### Task 2: The three endpoints

**Files:**
- Modify: `apps/api/src/modules/ai/ai.controller.ts`, `chat.service.ts`, `apps/api/src/modules/ai/dto/`
- Test: the chat service spec

- [ ] **Step 1: Read `setConversationShared` first** (`chat.service.ts:448`). Rename and delete are its siblings and must reproduce its 404-before-403 order exactly; the pin deliberately is not its sibling. The spec's "API additions" section gives all three signatures.

- [ ] **Step 2: `UpdateConversationTitleDto`** — a local `class-validator` class (`@IsString() @IsNotEmpty() @MaxLength(100)`), not a bare shared-types interface; the `SettleUpPayDto` precedent.

- [ ] **Step 3: The rename's `updatedAt`, and it needs verification rather than assumption.** Writing `data: { title, updatedAt: conversation.updatedAt }` is the intent, but **whether Prisma honours an explicit value on an `@updatedAt` field is listed as unproven in the spec.** Verify it against this Prisma version before relying on it; if it does not, decide the fallback and say what you chose and why. Do not leave the row teleporting to the top of both lists.

- [ ] **Step 4: Tests, red first.** Cover, at minimum: a non-creator renaming (403), a foreign-account id (404 **before** any ownership check — assert the status, since that ordering is the security property), a delete cascading its messages, and a **non-creator pinning a shared conversation succeeding** — that last one is the fork's ruling expressed as a test, and without it nothing stops a later "tidy-up" from adding the creator check.

- [ ] **Step 5: Verify and commit.**

```bash
cd apps/api && npx tsc --noEmit && npx jest
git add apps/api
git commit -m "ABA-514 Add rename, delete and pin endpoints for chat conversations"
```

---

### Task 3: Mobile plumbing and the pure display logic

**Files:**
- Modify: `apps/mobile/src/db/client.native.ts`, `src/db/chatRepository.ts`, `src/services/ai.api.ts`, `src/stores/chatStore.ts`, `src/features/chat/chatLayout.ts`
- Test: `src/features/chat/__tests__/chatLayout.test.ts`

- [ ] **Step 1: The SQLite mirror.** `ALTER TABLE chat_conversations ADD COLUMN is_pinned INTEGER` in `client.native.ts`, the established pattern. `chatRepository.getConversations`' `ORDER BY` becomes **`COALESCE(is_pinned, 0) DESC, updated_at DESC`** — the `COALESCE` is load-bearing: SQLite sorts NULL *below* 0, so without it a legacy row splits the unpinned block in two.

- [ ] **Step 2: Store actions, optimistic with rollback**, following this codebase's established shape (`purchaseRequestStore`'s optimistic vote is the nearest sibling). A rename or a pin that the server refuses must restore the previous value in memory **and** in SQLite.

- [ ] **Step 3: The four pure functions** the spec names — `pinnedGroupBoundary`, `sortConversationsForDisplay`, `conversationMenuItems`, `canSaveRename` — extending `chatLayout.ts`, which is already pure, theme-free and mutation-tested. **Test red first with the spec's fixtures**, and note `sortConversationsForDisplay` exists to reproduce *the server's* order from a shuffled input: it is the optimistic path's only guarantee of agreeing with the server, so a test that merely checks "pinned first" misses the point.

- [ ] **Step 4: `canSaveRename`** on empty, whitespace-only, unchanged, unchanged-modulo-trim, and a null current title. Save must not fire on any of those.

- [ ] **Step 5: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/db apps/mobile/src/services apps/mobile/src/stores apps/mobile/src/features/chat
git commit -m "ABA-514 Wire pins, rename and delete through the client, and add the display logic"
```

---

### Task 4: The desktop rail's row menu, and the rename dialog

**Files:**
- Create: `src/components/chat/desktop/ConversationRowMenu.tsx`, `src/components/chat/desktop/RenameConversationDialog.tsx`
- Modify: `src/components/chat/desktop/ConversationRail.tsx`, `ChatDesktop.tsx`

- [ ] **Step 1: Build to the spec's decision 1 and its "The row menu (desktop)" layout.** Hover **or** focus **or** `selected` reveals the `⋯`, and `|| selected` is the deliberate improvement on the ledger's pair — it is the whole answer for a touch tablet at >=1024, which has no hover. Right-click opens the same menu.

- [ ] **Step 2: The `⋯` slot is unconditional and opacity-gated.** Every row carries at least one action now (the fork's consequence), so every title is the same width — and a conditionally *rendered* control makes the title re-truncate under the cursor.

- [ ] **Step 3: Ownership comes from `ownedConversationIds`, never the cache.** `conversationMenuItems(row, { isOwner })` from Task 3 decides what the menu holds; the menu component renders what it is given.

- [ ] **Step 4: Rename is a dialog** (`SheetDialog`, its 480 and no new constant), not an inline edit, and the deciding fact is in the spec: titles are `message.slice(0, 100)` against a 231px row.

- [ ] **Step 5: Delete uses `showAlert` with `style: 'destructive'`** and the **shared** message when the conversation is shared. Then `startNewConversation()` if the deleted one was open.

- [ ] **Step 6: The pinned group** — pinned rows first with the leading icon becoming `pin`, and **one** divider that appears only when both groups exist. `pinnedGroupBoundary` decides; do not write the condition inline.

- [ ] **Step 7: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
cd /d/Work/micode/ai-budget-assistant && bash scripts/build-web.sh
git add apps/mobile/src/components/chat
git commit -m "ABA-514 Give the conversation rail a row menu, rename dialog and pinned group"
```

---

### Task 5: The phone's history sheet

**Files:**
- Modify: `src/components/chat/ChatHistorySheet.tsx`, `src/components/chat/ChatMobile.tsx`

**This task deliberately changes the mobile rendering, twice** — the trailing `⋯` with long-press on sheet rows, and the leading `pin` icon with the new order. Both must be named in the commit's first paragraph.

- [ ] **Step 1: A permanently visible `⋯`** (there is no hover on a phone) plus long-press, per the spec's decision 2.

- [ ] **Step 2: The menu is an absolutely-positioned `View` inside `styles.modalOverlay`** — not a `Modal`, and not inside `styles.modalSheet`. The Global Constraints say why each of those two would break.

- [ ] **Step 3: Do not touch the sheet's chrome** — ground colour, scrim, padding, `maxHeight` — and do not route it through `SheetDialog`. §5i records why.

- [ ] **Step 4: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/components/chat
git commit -m "ABA-514 Let the phone's history sheet rename, delete and pin a conversation"
```

---

### Task 6: Making sharing obvious

**Files:**
- Modify: `src/components/chat/desktop/ChatDesktop.tsx`, `src/components/chat/ChatMobile.tsx`, `src/components/chat/desktop/ConversationRail.tsx`, all nine `src/i18n/locales/*.ts`

**The third mobile change is here** — the `swap-horizontal` glyph in the top-bar pill — and it must be named in the commit's first paragraph.

- [ ] **Step 1: The desktop's two-segment control**, per the spec's decision 5(a): both options visible, which is what makes the toggle legible rather than a chip that states only the current value. Zero new keys for it.

- [ ] **Step 2: The phone gets the cheapest honest fix instead**, 5(b), and the reason is measured, not aesthetic: two labelled segments need ~170px against ~110px available in that bar.

- [ ] **Step 3: The rail row states sharing in words**, 5(c) — this is the request's actual answer, not a bigger icon, and 5(d) explains why.

- [ ] **Step 4: The two determined cases.** A non-creator can only ever *see* shared conversations, so their case is determined rather than designed (5e); and a single-member account correctly shows nothing at all (5f) — but **`0` members means unknown, not single**.

- [ ] **Step 5: The six i18n keys**, all in `chat.*`, all nine locales, each justified in decision 6. Proofread before landing: only slugs are ASCII here, and a previous wave's German, Belarusian, Ukrainian and Polish drafts each carried an error caught at this step.

- [ ] **Step 6: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/components/chat apps/mobile/src/i18n
git commit -m "ABA-514 Make a conversation's sharing state legible on both surfaces"
```

---

### Task 7: Verification, docs, and the issue

- [ ] **Step 1: Look at it**, both themes, at 1920 and as narrow as the window allows: a row menu for an owned and a non-owned conversation, a rename, a delete of a private and of a shared conversation, a pin and an unpin, the pinned divider with both groups and with only one, and the segmented control across several accents. Then the same on the phone's sheet.

- [ ] **Step 2: The two things only a browser can settle**, both listed as unproven in the spec: whether the popover clamps correctly near a window edge, and whether the pinned divider reads as a boundary or as a stray line.

- [ ] **Step 3: An account switch with the rail open**, since pins are per-account by construction and the rail was made to refetch on `[currentAccountId]` in ABA-513.

- [ ] **Step 4: Confirm the phone is unchanged beyond the three named changes.**

- [ ] **Step 5: The native bundle check**, grepping the desktop **UI** and never a component name:

```bash
cd apps/mobile && npx expo export --platform android --output-dir /d/tmp/native-check-514 --clear
HBC=$(ls /d/tmp/native-check-514/_expo/static/js/android/index-*.hbc | head -1)
for n in ConversationRowMenu RenameConversationDialog ChatDesktop; do echo "$n $(grep -c -a $n $HBC)"; done   # expect 0
```

- [ ] **Step 6: Docs.** The design language (gitignored: `git add -f`), CLAUDE.md's chat entry, and `user_docs/<lang>/30-web-app.md` in all nine locales with `npm run generate:help` — ABA-499 set that convention, four issues ignored it, and ABA-512 closed the gap; do not reopen it.

- [ ] **Step 7: Create ABA-514.** Name the three mobile changes as such, record the pin fork's ruling and its argument, and carry forward the follow-ups this design lists as out of scope.

---

## Deployment notes

- **This one has a migration**, unlike everything else on this branch. It runs against production from the deploy container on the next push to `development`, which is another reason the branch stays unpushed until the product owner says otherwise.
- Tasks 3–6 reach phones only at the next store release; the web build gets them on the next push.
- Verify in a browser served from a private build directory, built with **`EXPO_PUBLIC_API_URL=http://localhost:8099/api/v1` and `--clear`** — a leading-slash value is rewritten by Git Bash's MSYS layer and Expo caches the inlined value, so a rebuild without `--clear` silently keeps the old one.
- **The API half needs the API running to verify by hand.** The client half can be checked against production, but the three new endpoints do not exist there — so either run the API locally against a scratch database, or accept that tasks 1 and 2 are verified by their tests alone and say so.
