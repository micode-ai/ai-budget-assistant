# Settings Desktop Shell — Wave 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give settings a two-pane desktop layout, and land six screens in it — enough to prove the shell and fix the reported defect, with the remaining rows staying honest links until later waves convert them.

**Architecture:** The extraction is the work; the redesign is one flag per screen. Measured, not assumed: no settings screen reads `Dimensions`, `useContentWidth` or route params, and none uses `Alert.alert`. The reported defect — language and theme chips stretched to a third of the viewport — has a one-line cause: `appearance.tsx` sets `flex: 1` on chips inside an unbounded parent. Give the screen a bounded parent and it is correct.

**Tech Stack:** Expo Router, React Native Web, TypeScript, Jest (nothing renders a component in CI).

**Spec:** `docs/design/2026-09-06-settings-desktop-web.md`
**Language:** `docs/contracts/desktop-web-design-language.md` — 5c and 5d are what the dashboard work established; 6 lists things that look like defects and are not.

## Global Constraints

- **The mobile rendering must not change.** Every extraction is `app/settings/X.tsx` → `src/components/settings/X/…`, with the route left as a thin wrapper. Below 1024 the shell does not exist and `/settings` keeps all 20 rows.
- **Zero new i18n keys.** This entire body of work has shipped without one, and a key that was authorised turned out to already exist. The spec names left-pane grouping as the first thing that would need one — which is why there is no grouping.
- **No `app/settings/_layout.tsx`.** Route-level resolution is unverified in this repo; seventeen mechanical one-line route files beat one clever change to app-wide routing.
- **One page scroll.** Both panes live in the screen's single `ScrollView`. The left pane does not get its own scroller.
- Nothing under `src/` may import from `app/`. Every colour, spacing and text style from `useTheme()` tokens.
- The mobile suite stands at **1218 tests across 127 suites**. Record what it reports; never predict.

---

### Task 1: The shell, the registry, and the route gate

**Files:**
- Create: `src/components/settings/SettingsShell.tsx`, `src/features/settings/settingsRegistry.ts` and its spec, `src/components/settings/SettingsRoute.tsx`
- Modify: `src/components/webLayout.constants.ts`, `app/settings/index.tsx`

- [ ] **Step 1: The registry is the single source of truth.** One entry per left-pane row: its label key, whether it is a **pane** or a **link**, its route, and for panes `width: 'form' | 'full'`. Wave 1 has six panes; every other row is a link. Later waves flip entries from link to pane and change nothing else — that is the property to preserve.
- [ ] **Step 2: The rule for links, from the spec.** *If it changes how the app behaves for you it is a pane; if it is a place you work it is a link.* Links sit below a divider with an outbound arrow and navigate out of the shell. `/wallet`, `/shopping-list`, `/purchase-requests` and `/subscriptions` have **no top-bar tab**, so settings is currently their only entry point — they cannot be dropped.
- [ ] **Step 3: `SETTINGS_NAV_WIDTH = 280`** in `webLayout.constants.ts`, beside `DESKTOP_MIN_WIDTH`, `FACET_RAIL_MIN_WIDTH`, `SECOND_RAIL_MIN_WIDTH` and `WEB_TOP_BAR_PADDING_X`. Not inline.
- [ ] **Step 4: `/settings` with nothing selected** shows the profile card and logout — the two things that belong to settings as a whole. **Nothing is auto-selected**, so the URL never claims a selection the user did not make.
- [ ] **Step 5: Test the registry, red first.** Name the production change each test catches. Cover: every pane entry has a `width`; no entry is both pane and link; the link set contains the four that have no other entry point.
- [ ] **Step 6: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/components/settings apps/mobile/src/features/settings apps/mobile/src/components/webLayout.constants.ts apps/mobile/app/settings/index.tsx
git commit -m "ABA-508 Give settings a two-pane desktop shell"
```

---

### Task 2: Appearance — the first pane, and the visible fix

**Files:**
- Create: `src/components/settings/appearance/AppearanceSettings.tsx`
- Modify: `app/settings/appearance.tsx`, `src/features/settings/settingsRegistry.ts` and its spec

**Why this one first:** it is the reported defect, and a pure-presentation leaf with no data and no actions — the safest screen to prove the shell on.

- [ ] **Step 1: Pure move.** Params become props; the route becomes a thin wrapper. Check what the route renders *around* the body **and check `app/_layout.tsx`** — the voice extraction found that route's chrome was not in the route file at all.
- [ ] **Step 2: The fix is the shell's, not the screen's.** `width: 'form'` caps content at **720px, left-aligned** — never centred; centred content inside a left-aligned shell reads adrift. Do not edit the chips' `flex: 1`; a bounded parent is the fix. If you find yourself changing the screen's own styles, stop and say why.
- [ ] **Step 3: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/components/settings apps/mobile/app/settings/appearance.tsx
git commit -m "ABA-508 Move the appearance screen into a settings pane"
```

A pure move must not change the test count.

---

### Task 3: Three small leaves, one dispatch

**Files:**
- Create: `src/components/settings/widgets/WidgetsSettings.tsx`, `src/components/settings/ai/AiSettings.tsx`, `src/components/settings/about/AboutSettings.tsx`
- Modify: the three matching route files, `src/features/settings/settingsRegistry.ts` and its spec

These are 152, 152 and 115 lines and structurally identical to Task 2 — one dispatch, three moves, reviewed as one diff.

- [ ] **Step 1: Same pattern three times.** No new decisions; if one of them needs a decision, that is the signal to stop and report rather than improvise.
- [ ] **Step 2: Two things to confirm while you are in there.** `widgets` exercises a **drag interaction inside a pane** — check the drag still works when the pane is not the whole screen. `about` has an outbound link to `/help`, which proves a pane can navigate out.
- [ ] **Step 3: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/components/settings apps/mobile/app/settings
git commit -m "ABA-508 Move the widgets, AI and about screens into panes"
```

---

### Task 4: Notifications

**Files:**
- Create: `src/components/settings/notifications/NotificationsSettings.tsx`
- Modify: `app/settings/notifications.tsx`, `src/features/settings/settingsRegistry.ts` and its spec

464 lines, structurally trivial (toggle rows), and the highest-traffic settings screen after profile.

- [ ] **Step 1: Pure move**, same pattern.
- [ ] **Step 2: Check the new defect class the spec predicts.** A pane keeps its component mounted across an accent or theme change **and across an account switch**. A screen that loaded its data once in a mount effect, and was previously remounted on every visit, may now show another account's data. `notifications` reads account-scoped state — establish whether it does load once, and if so key the pane on `currentAccountId`. Say what you found either way.
- [ ] **Step 3: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/components/settings apps/mobile/app/settings/notifications.tsx
git commit -m "ABA-508 Move the notification settings into a pane"
```

---

### Task 5: Data — the wave's risk probe

**Files:**
- Create: `src/components/settings/data/DataSettings.tsx`
- Modify: `app/settings/data.tsx`, `src/features/settings/settingsRegistry.ts` and its spec

493 lines and the first with real actions — export, restore, share. Done while the wave is still small, deliberately.

- [ ] **Step 1: Pure move**, same pattern.
- [ ] **Step 2: The lifecycle question, and it is the real one here.** The spec names this screen for **an export or share in flight**. A screen that assumed "unmount when the user navigates away" now unmounts when the *pane switches*. The voice extraction found a microphone left open by exactly this shape of assumption; look for the same. If you find it, **report it before fixing** — a resource left held is a behaviour change and needs authorising, not improvising.
- [ ] **Step 3: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
cd /d/Work/micode/ai-budget-assistant && bash scripts/build-web.sh
git add apps/mobile/src/components/settings apps/mobile/app/settings/data.tsx
git commit -m "ABA-508 Move the data settings into a pane"
```

---

### Task 6: Verification, docs, and the issue

- [ ] **Step 1: Look at it** — both themes, several accents, at 1920, 1440 and 1200; with a pane selected and with none; and after switching account with a pane open.
- [ ] **Step 2: Confirm the phone is untouched** below 1024: `/settings` keeps all 20 rows and no shell exists.
- [ ] **Step 3: The native bundle check.** Read a non-zero result before believing it — the grep matches substrings.

```bash
cd apps/mobile && npx expo export --platform android --output-dir /tmp/native-check-508 --clear
grep -c -a SettingsShell /tmp/native-check-508/_expo/static/js/android/index-*.hbc   # expect 0
grep -c -a settingsRegistry /tmp/native-check-508/_expo/static/js/android/index-*.hbc # expect 0
```

- [ ] **Step 4: Update the design language doc.** It is gitignored: `git add -f`.
- [ ] **Step 5: Create ABA-508.** English, Problem / Implementation / Out of scope. Name the waves that remain, so the six-of-seventeen state is recorded as deliberate rather than unfinished.

---

## Deployment notes

- Stays on `feature/desktop-web-screen`. A push to `development` rebuilds and ships the SPA with no separate step — a push IS a release, and that is the product owner's call.
- **Verify in a browser served from a private build directory**, never `apps/mobile/dist` — `scripts/build-web.sh` bakes the production API URL and agents rebuild that directory underneath you.
- Waves 2–4 and the permanent exclusions (`import`, and the non-settings links) are in the spec's "The order" section. Nothing after wave 1 changes the shell.
