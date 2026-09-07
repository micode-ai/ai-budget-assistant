# Settings Desktop Shell — Wave 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the last three links to panes — `account/list`, `tags/manage`, `projects` — taking the count from twelve to fifteen of seventeen, and carry the account-switch fix that two of them need.

**Architecture:** Nothing about the shell changes, and **no child route changes at all**. The wave-4 addendum settled the question this wave opens with: *a pane's child is a route.* Both a detail of the list a pane shows and a form that creates something are reached with `router.push`, render as a full page under `WebShell`, and return by the stack header's back arrow — which restores the pane because **the selection is the URL**. There is no third entry kind; the registry stays binary.

**Tech Stack:** Expo Router, React Native Web, TypeScript, Jest (nothing renders a component in CI).

**Spec:** `docs/design/2026-09-06-settings-desktop-web.md` — **read its wave-4 addendum in full before Task 1.** It is the third addendum, at the end of the file. Its "Five corrections first" section overturns three things the controller believed, and its "What a plan must not do" list is the source of this plan's Global Constraints.
**Language:** `docs/contracts/desktop-web-design-language.md` — 5e/5f/5g are waves 1–3. 5g is the one to read: the account-switch defect, and a measurement that lied.

## Why this order, and it is not the spec's

The spec lists `account/list`, `tags/manage`, `projects`. This plan runs **tags, projects, account/list** — the wave-1 lesson: schedule the risk probe while the wave is still small. `tags` carries every wrinkle this wave has (a `<Stack.Screen>`, a `useEffect([])` data-correctness change, and an edit modal that becomes a `SheetDialog`) in the smallest file. `account/list` is the only pure move and goes last.

## Global Constraints

Ten of these come verbatim from the addendum's own list. Every task's requirements implicitly include all of them.

- **The mobile rendering must not change — with one deliberate exception, in Tasks 1 and 2.** Keying those two loads on the account changes the phone's behaviour in the direction of correctness (a backgrounded route now refetches on an account change). **The commit must say so in its first paragraph**, as this branch does for every change that alters the phone.
- **Do not add any child route to `SETTINGS_ENTRIES`**, and **do not touch their `headerShown: true` in `app/_layout.tsx`.** Their absence from the registry is exactly what keeps that header, and its back arrow is the return path the whole ruling depends on.
- **Do not call `settingsHeaderShown('projects/index')`.** `isShellHostedSettingsRoute` compares against the registry's `route` **exactly**, and `/projects/index` is not `/projects`, so the expo screen name returns `false` **silently** and the pane renders with both the shell and a stack header. `account/list` and `tags/manage` match under either spelling — which is what makes the third one easy to miss. Pass `'/projects'`.
- **No `<Stack.Screen>` inside an extracted body.** Wave 3's ruling: under `src/` it renames whichever route later hosts the component. Both `tags/manage` and `projects/index` have one; it stays a sibling of `SettingsRoute` in the route file.
- **All three panes are `width: 'form'`, not `'full'`.** Each is a single-column list of short rows. `account/list`'s footer Create/Join buttons are block buttons with no `flex: 1`, so at `'full'` they become two 900px dashed bars — the appearance-chips defect in another costume.
- **Do not host `projects/[id]` in a dialog on the grounds that it is a detail.** Its only edit and delete affordances live in `<Stack.Screen>`'s `headerRight`; a dialog has no stack header, and re-homing them is reimplementing, which section 3 forbids.
- **Do not move `app/projects/new.tsx`, and do not give it a left-pane row.** Only `src/components/ProjectPicker.tsx` reaches it; it is a sibling route, not this hub's create affordance.
- **Zero new i18n keys.** `accounts.manage`, `settingsNav.tags` and `settingsNav.projects` already label these rows and are unchanged by the flip.
- Nothing under `src/` may import from `app/`. Every colour, spacing and text style from `useTheme()` tokens.
- **A pure move must not move the test count.** Diff both directions.
- The mobile suite stood at **1311 tests across 134 suites**, and a `SheetDialog` change landed alongside this plan's writing, so **that number may have moved before Task 1 starts.** Record what jest reports; never predict.

---

### Task 1: Tags — the wave's risk probe, and the type-meaning edit

**Files:**
- Create: `src/components/settings/tags/TagsSettings.tsx`
- Modify: `app/tags/manage.tsx`, `src/features/settings/settingsRegistry.ts` and its spec, and possibly `src/stores/tagStore.ts` + `src/stores/projectStore.ts` + `src/stores/accountStore.ts`

**Why first:** 289 lines, the smallest of the three, and it carries all three of this wave's wrinkles at once. If any of them is harder than the addendum predicts, finding out here is cheap.

- [ ] **Step 1: The extraction**, same pattern as the twelve before it. Flip the registry entry from `kind: 'link'` to `kind: 'pane'` with `width: 'form'`; the route becomes a thin wrapper. Its `<Stack.Screen options={{ title }} />` stays in the route file as a sibling of `SettingsRoute`.

- [ ] **Step 2: The type-meaning edit, once, here.** `SETTINGS_PANE_KEYS` gains three keys that are **not** under `app/settings/`, so its doc comment must say the new thing rather than the old thing plus three exceptions: the meaning changes from "lives under `app/settings/`" to "configures the app and has been extracted". `SettingsLinkKey` loses `accounts`, `tags` and `projects` in the same edit. Do not restate the count as twelve anywhere.

- [ ] **Step 3: The data-correctness change, and it alters the phone.** The load is `useEffect(() => { loadTags(); }, [])`. A pane stays mounted across an account switch, so it would show the previous account's tags. Key it on `currentAccountId`. Say in the commit's first paragraph that this changes mobile behaviour.

- [ ] **Step 4: Settle the one-frame flash, for both stores, and argue the choice.** Section 5g's fix empties caches **synchronously inside `set()`** before any `[currentAccountId]` effect runs — but `clearAccountScopedCaches()` covers only `priceHistoryStore` and `merchantRulesStore`, and **neither `tagStore` nor `projectStore` has a `reset()` at all**. So keying alone leaves a possible one-frame flash of the previous account's rows. Two options, and the addendum says to decide rather than inherit:

  **(a)** give both stores a `reset()` and add them to `clearAccountScopedCaches()` — consistent with wave 3, and it makes that one function the single place this class is handled; **(b)** accept the flash.

  **The deciding fact is not aesthetic: establish who else reads these two stores and whether each consumer reloads on an account change.** `tagStore` is read by the tag picker in the expense and income forms; `projectStore` by `ProjectPicker`. A `reset()` that empties a list which some consumer never reloads is **worse** than the flash — a permanently empty picker beats no argument. Report what you found, then choose. If (b), say so in the report and in a code comment where the keying lives, so the next reader knows it was decided.

- [ ] **Step 5: The edit modal becomes a `SheetDialog`.** In a pane a raw RN `Modal` slides up the full width of the window from its bottom edge, covering the list being edited. `SheetDialog` is the shared chrome; ten call sites use it. **Keep `keyboardAvoiding`** — this modal wraps its overlay in `KeyboardAvoidingScreen` today and contains a `TextInput`, and no desktop check would catch its loss. **Drop the screen's own `insets.bottom` read in the same change**, or the phone gains a second gap. Note the wrapper's `sheetStyle`/`handleStyle`/`scrimColor` escape hatches exist for sheets whose phone pixels may not move — say which you passed and why, or that the boxes already matched.

- [ ] **Step 6: `canEdit`.** This screen gates its write affordances on it today; viewers are a real role here. A pane must keep doing so.

- [ ] **Step 7: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/components/settings apps/mobile/src/features/settings apps/mobile/src/stores apps/mobile/app/tags/manage.tsx
git commit -m "ABA-512 Move the tags screen into a pane, and refetch it on an account switch"
```

---

### Task 2: Projects — and the predicate that fails silently

**Files:**
- Create: `src/components/settings/projects/ProjectsSettings.tsx`
- Modify: `app/projects/index.tsx`, `src/features/settings/settingsRegistry.ts` and its spec

- [ ] **Step 1: The extraction**, `width: 'form'`, `<Stack.Screen>` stays in the route.

- [ ] **Step 2: The trap.** Pass `'/projects'` to `settingsHeaderShown`, never `'projects/index'` — see the Global Constraints. **Confirm by observation, not by reading**: a wrong value renders the pane with the shell *and* a stack header, which is visible.

- [ ] **Step 3: Same three items as Task 1** — the `useEffect([])` → `[currentAccountId]` keying (again a stated mobile change), the edit modal through `SheetDialog` with `keyboardAvoiding` and its own `insets.bottom` read dropped, and `canEdit` preserved. Task 1 settled the store-reset question for both stores; **inherit that decision, do not re-litigate it** — if you think it was wrong for `projectStore` specifically, report before acting.

- [ ] **Step 4: Its one outbound push stays a push.** A row pushes `/projects/[id]`. That route is not extracted, not moved, not registered, and gets no dialog.

- [ ] **Step 5: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/components/settings apps/mobile/src/features/settings apps/mobile/app/projects/index.tsx
git commit -m "ABA-512 Move the projects screen into a pane, and refetch it on an account switch"
```

---

### Task 3: Accounts — the pure move

**Files:**
- Create: `src/components/settings/accounts/AccountsSettings.tsx`
- Modify: `app/account/list.tsx`, `src/features/settings/settingsRegistry.ts` and its spec

- [ ] **Step 1: The extraction**, `width: 'form'`. Root is `SafeAreaView edges={[]}` + a plain `ScrollView`, no `<Stack.Screen>` of its own, no modal.

- [ ] **Step 2: It needs no `[currentAccountId]` treatment — do not add one by analogy with its two siblings.** It has **no mount effect at all**: it reads `accounts` from the app-global store the account switcher already maintains, as a live subscription. Adding a key would discard state and re-fetch to get a byte-identical answer, which is wave 2's stated rule.

- [ ] **Step 3: Its three pushes stay pushes** — `/account/[id]`, `/account/create`, `/account/join`. None is extracted, moved, registered or made a dialog. The addendum's shape-2 argument is mechanical and load-bearing: `account/create`'s trip card pushes `/trip/new`, which finishes with `router.dismissAll()` (`POP_TO_TOP`), and an RN `Modal` is not a route, so a dialog-hosted create form would be left floating over the tabs.

- [ ] **Step 4: The `'form'` cap is the point of this task's visible half.** Its footer Create/Join buttons have no `flex: 1`; at `'full'` they become two 900px dashed bars. Look at them.

- [ ] **Step 5: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
cd /d/Work/micode/ai-budget-assistant && bash scripts/build-web.sh
git add apps/mobile/src/components/settings apps/mobile/src/features/settings apps/mobile/app/account/list.tsx
git commit -m "ABA-512 Move the account list into a pane"
```

---

### Task 4: Verification, docs, and the issue

- [ ] **Step 1: Walk the chains, because the return path IS the ruling.** The addendum names one that breaks and four that do not. Verify each by clicking, not by reading:
  - `/account/{id}` → back → `/account/list` pane, Accounts selected.
  - `/account/create` → successful create → `router.back()` → same.
  - `/projects/{id}` → back → `/projects` pane.
  - **The one that breaks:** `/settings` → `/account/list` → `/account/create` → `/trip/new` → `POP_TO_TOP` → `/account/{id}`; back from there lands on the tabs, not the Accounts pane. **Pre-existing and identical on mobile today**, and arguably fine (you just made a trip and are looking at it). Record it; do not fix it in this wave.

- [ ] **Step 2: The acceptance criteria are in the addendum** — run them at 1920. In particular: the three rows lose their outbound arrow and gain a selected state (the visible half of the flip), and a pushed child renders as a full page with a stack header carrying a working back arrow.

- [ ] **Step 3: An account switch with each of the two keyed panes open.** That is what Tasks 1 and 2's data change exists for and the only thing that proves it.

- [ ] **Step 4: Confirm the phone is untouched** below 1024, except the two keyed loads.

- [ ] **Step 5: The native bundle check, read properly.** Grep for the desktop **UI**, never a component name — a native no-op carries the same name by construction, and a probe goes stale (5f).

```bash
cd apps/mobile && npx expo export --platform android --output-dir /d/tmp/native-check-512 --clear
HBC=$(ls /d/tmp/native-check-512/_expo/static/js/android/index-*.hbc | head -1)
for n in SettingsShell SettingsNav SettingsOverviewPane WebTopBar; do echo "$n $(grep -c -a $n $HBC)"; done   # expect 0
```

- [ ] **Step 6: Update the design language doc** with what this wave established — above all the ruling's own test (*is this a leaf?*, not *detail or form?*) and the `dismissAll()` fact that closed it, since both will be re-derived otherwise. It is gitignored: `git add -f`. Add the settings shell's CLAUDE.md entry too: it says twelve of seventeen.

- [ ] **Step 7: Create ABA-512.** Name the two keyed loads as changes that alter the mobile rendering. State what remains: two links that stay links on purpose (`import`, and the non-settings destinations), and the rejected option worth revisiting — giving a pane's child the left pane — with the reason it was rejected.

---

## Deployment notes

- Stays on `feature/desktop-web-screen`. A push to `development` rebuilds and ships the SPA with no separate step — a push IS a release, and that is the product owner's call.
- **Tasks 1 and 2 reach phones only at the next store release**; the web build gets them on the next push. State that asymmetry in the issue rather than discovering it later.
- Verify in a browser served from a private build directory, never `apps/mobile/dist` — agents rebuild that underneath you. Do not trust the export's exit code: check that `index.html` exists, because a build run from the wrong directory reports success and produces nothing.
- Chrome silently ignores a resize of a **maximized** window and this harness blocks the zoom shortcuts, so a sub-1024 viewport may not be forcible. `SettingsRoute.web.tsx`'s early return is the structural evidence; use it rather than claiming a check you could not run.
