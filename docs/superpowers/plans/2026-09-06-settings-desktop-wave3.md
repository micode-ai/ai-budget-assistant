# Settings Desktop Shell — Wave 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the three reference-data list screens into the shell — `categories`, `merchants`, `products` — taking the pane count from nine to twelve, and fix the account-switch data leak they carry.

**Architecture:** Nothing about the shell changes. But unlike waves 1 and 2, this wave opens with a **fix rather than a move**: two of these screens show the previous account's data after a switch, verified by wave 1's audit and unfixed since. The fix lives in the stores, is not desktop-specific, and is worth landing on its own merits before anything is extracted.

**Tech Stack:** Expo Router, React Native Web, TypeScript, Jest (nothing renders a component in CI).

**Spec:** `docs/design/2026-09-06-settings-desktop-web.md`
**Language:** `docs/contracts/desktop-web-design-language.md` — 5e is wave 1, 5f is wave 2 and is the one to read: it records where a five-time habit broke, and why a bundle probe goes stale.

## Global Constraints

- **The mobile rendering must not change — with one deliberate exception, in Task 1.** That task fixes a data-correctness bug the phone has too, so it *does* change what a user sees there. It is called out in that task and nowhere else.
- **Zero new i18n keys.** Nothing in this body of work has needed one.
- Nothing under `src/` may import from `app/`. Every colour, spacing and text style from `useTheme()` tokens.
- **A pure move must not move the test count.** Diff both directions.
- **These are the `width: 'full'` entries** — list screens that want the pane, not the 720px form cap. The registry already declares that; do not change it.
- **Check the root before swapping it.** Wave 2 found `security`'s root was a `KeyboardAwareScreen` and `bots`' was `SafeAreaView edges={['bottom']}` — the reflex from five identical wave-1 extractions would have silently dropped keyboard handling from a form with password fields. `SettingsScreenKeyboardScroll` exists for that case. **Wave 2 predicted these three will need the same for `KeyboardAvoidingScreen`.** Check all nine predecessors in git rather than assuming uniformity.
- The mobile suite stands at **1268 tests across 130 suites**. Record what it reports; never predict.

---

### Task 1: Stop showing the previous account's data

**Files:**
- Modify: `apps/mobile/src/stores/priceHistoryStore.ts` and whatever owns the merchant list, plus their specs

**This task deliberately changes the mobile rendering.** It is a bug fix, and the phone has the bug too. Say so plainly in the commit message, the way this branch did for the viewer permissions, the microphone and the change-email header key.

- [ ] **Step 1: Reproduce the claim before fixing it.** Wave 1's audit reported: `products` runs `useEffect(() => { loadProducts(); }, [])` against `listProducts(req.accountId)`, and `switchAccount` resets no store; `merchants` has the same shape **plus a never-reset `isLoaded` flag**, so a remount alone would not fix it. Confirm both, and say what you found — the audit was right about `products` and `merchants` and wrong about `security`, so verify rather than inherit.
- [ ] **Step 2: The codebase already knows the answer.** The analytics screen keys the same store on `[currentAccountId]` and `reset()`s it, with a comment about refresh cadence. Read that first and follow it rather than inventing a mechanism.
- [ ] **Step 3: Two owners resetting one store needs thought.** `priceHistoryStore` is shared with analytics, which already resets it. Adding a second resetter is how two screens come to fight over one store. Decide where the reset belongs — one owner, or the switch itself — and **argue the choice in your report**.
- [ ] **Step 4: Test it, red first.** Name the production change each test catches. The `isLoaded` flag is the interesting one: a test that only covers "data reloads on switch" passes even if the flag still short-circuits it.
- [ ] **Step 5: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/stores
git commit -m "ABA-511 Reset reference data on account switch, so a switch cannot show another account's products"
```

---

### Task 2: Categories

**Files:**
- Create: `src/components/settings/categories/CategoriesSettings.tsx`
- Modify: `app/settings/categories.tsx`, `src/features/settings/settingsRegistry.ts` and its spec

- [ ] **Step 1: The move**, same pattern as the nine before it. `width: 'full'` — this is a list, not a form.
- [ ] **Step 2: Check the root**, per the global constraint. Wave 2 predicts `KeyboardAvoidingScreen` here.
- [ ] **Step 3: Check what the route renders around the body, and check `app/_layout.tsx`.**
- [ ] **Step 4: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/components/settings apps/mobile/src/features/settings apps/mobile/app/settings/categories.tsx
git commit -m "ABA-511 Move the categories screen into a pane"
```

---

### Task 3: Merchants

**Files:**
- Create: `src/components/settings/merchants/MerchantsSettings.tsx`
- Modify: `app/settings/merchants.tsx`, `src/features/settings/settingsRegistry.ts` and its spec

- [ ] **Step 1: The move**, `width: 'full'`.
- [ ] **Step 2: This screen has a selection mode and a merge flow** — multi-select, a merge modal, and suggestion banners. A modal inside a pane is the shape `change-email` established: if anything here is bottom-anchored it needs `useSafeAreaInsets().bottom`, and a scrim must be a plain element rather than a `Pressable`.
- [ ] **Step 3: Task 1 fixed this screen's store.** Confirm the pane does not reintroduce the problem — a pane stays mounted across a switch, which is exactly the condition Task 1's fix has to survive.
- [ ] **Step 4: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/components/settings apps/mobile/src/features/settings apps/mobile/app/settings/merchants.tsx
git commit -m "ABA-511 Move the merchants screen into a pane"
```

---

### Task 4: Products

**Files:**
- Create: `src/components/settings/products/ProductsSettings.tsx`
- Modify: `app/settings/products.tsx`, `src/features/settings/settingsRegistry.ts` and its spec

- [ ] **Step 1: The move**, `width: 'full'`. The largest of the three at 561 lines.
- [ ] **Step 2: The spec names a `Stack.Screen` wrinkle here** — this is the one settings screen that uses it. Establish what it does and whether a pane needs it; do not assume either way.
- [ ] **Step 3: This screen has an AI backfill** that issues a request and can be left in flight. Wave 1's `data` extraction came back clean because its in-flight flags live in a store rather than `useState`; wave 2's `bots` was the opposite. Say which this is.
- [ ] **Step 4: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
cd /d/Work/micode/ai-budget-assistant && bash scripts/build-web.sh
git add apps/mobile/src/components/settings apps/mobile/src/features/settings apps/mobile/app/settings/products.tsx
git commit -m "ABA-511 Move the products screen into a pane"
```

---

### Task 5: Verification, docs, and the issue

- [ ] **Step 1: Look at it** — all twelve panes, both themes, and **an account switch performed while each of these three panes is open**. That is the case Task 1 exists for and the only one that proves it.
- [ ] **Step 2: Confirm the phone is untouched** below 1024, except Task 1's deliberate fix.
- [ ] **Step 3: The native bundle check, read properly.** Wave 2's lesson: probes go stale, and grepping a component name never worked — a native no-op carries the same name. Grep for the desktop **UI** and re-derive the probe rather than reusing one:

```bash
cd apps/mobile && npx expo export --platform android --output-dir /tmp/native-check-511 --clear
HBC=$(ls /tmp/native-check-511/_expo/static/js/android/index-*.hbc | head -1)
for n in SettingsShell SettingsNav SettingsOverviewPane WebTopBar; do echo "$n $(grep -c -a $n $HBC)"; done   # expect 0
```

- [ ] **Step 4: Update the design language doc.** It is gitignored: `git add -f`.
- [ ] **Step 5: Create ABA-511.** Name Task 1 explicitly as a fix that changes the mobile rendering, and say what wave 4 still holds.

---

## Deployment notes

- Stays on `feature/desktop-web-screen`. A push to `development` rebuilds and ships the SPA with no separate step — a push IS a release, and that is the product owner's call.
- **Task 1 reaches phones only at the next store release.** The web build gets it on the next push; the phone keeps the bug until then. That asymmetry is worth stating in the issue rather than discovering later.
- Verify in a browser served from a private build directory, never `apps/mobile/dist`, and do not trust the export's exit code — check that `index.html` exists.
