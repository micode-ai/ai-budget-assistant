# Dashboard Retention & Web Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the desktop dashboard from being a screen a person leaves — give a new user a first-run state instead of nine cards reporting absence, and give a returning user something worth coming back for.

**Architecture:** No new endpoint, no new column, no migration, no new dependency. The first-run state is the dashboard itself in a different state, not a second screen — a separate screen would defer the problem, since one expense populates two cards and five others keep reporting absence the moment onboarding ends. Everything is desktop-only, gated on the existing `compact`/`desktop` props or on `isDesktopWeb`.

**Tech Stack:** Expo Router, React Native Web, TypeScript, Jest (nothing renders a component in CI).

**Spec:** `docs/design/2026-09-06-dashboard-retention-and-onboarding-web.md`
**Language:** `docs/contracts/desktop-web-design-language.md` — 5c is what the dashboard added, and its last two entries are the findings this plan exists to fix. 6 lists things that look like defects and are not.

## Global Constraints

- **The mobile rendering must not change.** Every shared change is an additive prop whose default reproduces today's output, or a store field nothing on mobile reads.
- **Nothing under `src/` may import from `app/`.** This is why Task 1 exists and must come first.
- **No new API request in Phase A** (Tasks 1–7). Phase B (Task 8) adds exactly two GETs to existing endpoints, both fail-silent.
- **No new i18n key.** The spec's i18n section lists the existing keys to reuse verbatim. If a string genuinely has no key, **stop and report** rather than inventing one across nine locales.
- **Every colour, spacing and text style from `useTheme()` tokens.** `success`/`danger`/`warning`/`onSemantic` are not accent-derived; `textInverse` is.
- **Nothing renders in CI**, so every decision that can be numerically or logically wrong belongs in a pure module with tests, and every acceptance criterion must be checkable by a person on a deployed build.
- The mobile suite stands at **914 tests across 105 suites**. Record what it reports; never predict.

---

### Task 1: Move alert presentation out of `app/`

**Files:**
- Create: `apps/mobile/src/features/alerts/alertPresentation.ts`, `apps/mobile/src/features/alerts/resolveAlertExpense.ts`
- Modify: `apps/mobile/app/alerts/index.tsx`

**Why first:** the attention panel renders alert content, and `src/` cannot import from `app/`. Nothing else in this plan can start until this lands.

- [ ] **Step 1: Move, do not rewrite.** `renderBody()` and `TYPE_ICON` move to `alertPresentation.ts`; the four-way expense resolution and its pull-and-retry (`isExpenseResolvableLocally`, `openAlertTargets`) move to `resolveAlertExpense.ts`. `app/alerts/index.tsx` imports them back and its rendering must be **identical** — this is the ABA-339 logic (an alert's `expenseId` is a server PK, a local row is keyed by clientId), so a subtle change here silently breaks alert deep-links.
- [ ] **Step 2: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/features/alerts apps/mobile/app/alerts
git commit -m "ABA-507 Move alert presentation into src so the dashboard can render it"
```

A pure move must not change the test count. Diff both directions: every removed line reappears.

---

### Task 2: `lastPullAt`, and the three-valued first-run predicate

**Files:**
- Modify: `apps/mobile/src/stores/expenseStore.ts`, `apps/mobile/src/stores/incomeStore.ts`
- Create: `apps/mobile/src/features/onboarding/resolveWebFirstRun.ts` and its spec

**Why:** on web SQLite is a mock and `_doPullAndMerge` swallows a failed pull with `console.warn` while setting no flag, so `expenses.length === 0` means *either* "empty account" *or* "the request failed". A boolean predicate reads an offline first paint as a brand-new user.

- [ ] **Step 1: One additive field each.** `lastPullAt: number | null`, written at the two lines that already mark that moment (where `setLastSyncTime()` is called). Nothing on mobile reads it.
- [ ] **Step 2: The predicate is three-valued.** `resolveWebFirstRun(inputs)` returns `'wait' | 'show' | 'suppress'` — never a boolean. The spec's "The predicate" and "The two guards, carried across" sections define the inputs and the two guards inherited from `shouldShowFirstRun` (a viewer cannot create a transaction; a pending `nextAfter` destination means the email path owns navigation).
- [ ] **Step 3: Test it, red first.** Before each test, name the production change that would make it fail. This project has shipped tests that could not fail — one passed against a deliberately broken implementation because the host machine sat in the right timezone. Cover at minimum: no pull yet → `wait`; pull succeeded and zero transactions → `show`; pull succeeded and any transaction → `suppress`; viewer → `suppress`; `nextAfter` set → `suppress`.
- [ ] **Step 4: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/stores apps/mobile/src/features/onboarding
git commit -m "ABA-507 Tell an empty account apart from a pull that never answered"
```

---

### Task 3: The setup checklist

**Files:**
- Create: `apps/mobile/src/features/onboarding/resolveSetupSteps.ts` and its spec, `apps/mobile/src/components/home/SetupChecklist.tsx`
- Modify: `apps/mobile/src/stores/firstRunStore.ts`

**Note:** `SetupChecklist.tsx` is **not** under `desktop/` — both the first-run rail and the ordinary rail render it.

- [ ] **Step 1: Pure first.** `resolveSetupSteps(inputs)` decides which steps are done, from data the dashboard already loads. The spec's "Rail — the setup checklist" section lists the steps and what marks each complete.
- [ ] **Step 2: `firstRunStore` gains `checklistDismissed`**, with a pure `resolve*` reader beside the existing `resolveSeen` — a corrupted stored value must resolve to a default, never to `NaN` or a throw.
- [ ] **Step 3: The component.** Presentational; state comes from props. Reuse the existing keys the spec names (`wallet.addBalance`, `budgets.createBudget`, …).
- [ ] **Step 4: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/features/onboarding apps/mobile/src/components/home/SetupChecklist.tsx apps/mobile/src/stores/firstRunStore.ts
git commit -m "ABA-507 Add the setup checklist and the pure rule for what is done"
```

---

### Task 4: The first-run dashboard state

**Files:**
- Create: `apps/mobile/src/components/home/desktop/FirstRunPanel.tsx`
- Modify: `apps/mobile/src/components/home/desktop/DashboardDesktop.tsx`, `FocusColumn.tsx`, `DashboardRail.tsx`

- [ ] **Step 1: Build to the spec's "What the first-run dashboard shows" and its ≥1680 wireframe.** Heading, the 2×2 grid of entry points, the skip link; the rail carries the checklist and the second rail is empty in this state.
- [ ] **Step 2: The entry points navigate to screens that already exist** — receipt scan, voice, manual, import. Do not write new entry logic; `app/get-started.tsx` is the reference for which route each one opens, and it is **not** to be modified.
- [ ] **Step 3: Exit.** The spec's "Exit" section defines when the first-run state stops showing. It must not flip back to first-run on a later empty pull.
- [ ] **Step 4: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/components/home
git commit -m "ABA-507 Give a new user a first-run dashboard instead of nine empty cards"
```

---

### Task 5: Suppress the false zero

**Files:**
- Modify: `apps/mobile/src/features/insights/useSafeToSpend.ts`, `apps/mobile/src/components/widgets/NetProfitWidget.tsx`, `apps/mobile/src/components/interactive-charts/InteractiveLineChart.tsx`

**Why:** `hasEnoughData` is `data !== null` and the API answers an empty account with real zeros, so a new user is told their safe-to-spend is `0,00 zł` — a false statement, not a blank. The chart makes the same error, drawing five absent months as a flat line at zero.

- [ ] **Step 1: Safe to Spend.** The spec's "Suppressing the false zero" section defines the condition. A blank or an invitation is honest; a zero is not.
- [ ] **Step 2: The chart, below two populated months, is not drawn at all** — and neither are its range chips. This is the spec's ruling in "A flat run against the axis": five absent months drawn flat is the same false-zero error, and refusing to draw is consistency rather than a new rule.
- [ ] **Step 3: The residual collision, above the threshold.** The chart passes `xAxisColor={theme.colors.border}` while its own grid uses the lighter `rulesColor={theme.colors.borderLight}`, so the zero rule is drawn heavier than the grid it belongs to. Change the one value. **Do not restyle the line.**
- [ ] **Step 4: All three are `compact`-gated.** No platform check; mobile passes nothing and is unchanged.
- [ ] **Step 5: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/features/insights apps/mobile/src/components/widgets apps/mobile/src/components/interactive-charts
git commit -m "ABA-507 Stop reporting a server zero as a fact about an empty account"
```

---

### Task 6: The attention items, pure

**Files:**
- Create: `apps/mobile/src/features/dashboard/attentionItems.ts`, `apps/mobile/src/features/dashboard/budgetProjection.ts`, and a spec for each

**Why pure and first:** composition, ordering, the cap and the `+N more` count are exactly the things that can be wrong without anything failing.

- [ ] **Step 1: `budgetProjection.ts`** — whether a budget is projected to exceed, and on what date. The spec's "The budget projection line" section defines it, including that `estimatedExhaustionDate` and `projectedTotal > amount` are algebraically the same event and must produce **one** sentence, not two.
- [ ] **Step 2: `attentionItems.ts`** — `buildAttentionItems(inputs)`: composition, by-kind ordering, the cap of three rows, and the `+N more` count. Phase A inputs only: invitations, alerts, budget projections. The signature must accept the Phase B inputs as optional from the start so Task 8 adds data, not a new shape.
- [ ] **Step 3: Test both, red first**, naming the production change each test would catch. Cover the cap boundary (exactly three, four, zero) and the ordering between kinds.
- [ ] **Step 4: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/features/dashboard
git commit -m "ABA-507 Add the pure rules for what needs the user's attention"
```

---

### Task 7: The attention panel, and what a click does

**Files:**
- Create: `apps/mobile/src/components/home/desktop/AttentionPanel.tsx`
- Modify: `apps/mobile/src/components/home/desktop/FocusColumn.tsx`, `apps/mobile/src/components/home/widgets/MonthlyBudgetCard.tsx`

- [ ] **Step 1: One card, not five.** The spec's "One card, not five" section is the argument; its arithmetic keeps the hero above the fold at 855px. Cap at three rows.
- [ ] **Step 2: Resolve in place.** The spec's "What a click does" section names which rows open a dialog or expand inline rather than navigating. **Navigating away IS the user leaving** — that is the whole point of the screen. Use `ExpenseDialog.tsx` as the dialog reference; do not write a second modal implementation.
- [ ] **Step 3: `MonthlyBudgetCard` gains `projection?`** — optional, mobile passes nothing.
- [ ] **Step 4: Check every confirmation reachable from here uses `showAlert`.** `Alert.alert` no-ops on react-native-web and has already been found doing so three times on this branch.
- [ ] **Step 5: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/components/home
git commit -m "ABA-507 Surface what needs attention, and resolve it without leaving"
```

---

### Task 8: Phase B — the two extra reads

**Files:**
- Modify: `apps/mobile/src/components/home/desktop/DashboardDesktop.tsx`

- [ ] **Step 1: Two GETs to existing endpoints** — the purchase-request pending count (non-personal accounts only) and subscriptions (renewals within 7 days). Both load from `DashboardDesktop`.
- [ ] **Step 2: Both fail silent** — `console.warn`, keep going, following the `inflationShieldStore` precedent. An attention list that never receives them is simply shorter; it must never be an error state.
- [ ] **Step 3: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
cd /d/Work/micode/ai-budget-assistant && bash scripts/build-web.sh
git add apps/mobile/src/components/home
git commit -m "ABA-507 Add renewals and pending purchase requests to the attention list"
```

---

### Task 9: Verification, docs, and the issue

- [ ] **Step 1: Look at it**, in both themes and on several accents, at ≥1680, 1440 and 1200: as a brand-new account, as an account with one transaction, and as a populated one. The spec's "Acceptance criteria" section is written to be checked this way because nothing renders in CI.
- [ ] **Step 2: Confirm the phone is untouched** below 1024.
- [ ] **Step 3: The native bundle check**, standing practice after each desktop change because the failure is silent. Read a non-zero result before believing it — the grep matches substrings.

```bash
cd apps/mobile && npx expo export --platform android --output-dir /tmp/native-check --clear
grep -c FirstRunPanel /tmp/native-check/_expo/static/js/android/index-*.hbc   # expect 0
grep -c AttentionPanel /tmp/native-check/_expo/static/js/android/index-*.hbc  # expect 0
```

- [ ] **Step 4: Update the design language doc.** Section 5c's last two entries — the false zero and the three-valued predicate — are recorded there as findings; move them to settled, and add whatever this work established. It is gitignored: `git add -f`.
- [ ] **Step 5: Create ABA-507.** English, Problem / Implementation / Out of scope. Name the false-zero suppression as a **fix**, not a feature.

---

## Deployment notes

- Stays on `feature/desktop-web-screen`. A push to `development` rebuilds and ships the SPA with no separate step and no feature flag — a push IS a release, and that is the product owner's call.
- Nothing here requires a mobile release; Metro resolves `DashboardView.tsx` → `DashboardMobile.tsx` for native.
- **Verify in a browser served from a private build directory**, never `apps/mobile/dist` — `scripts/build-web.sh` bakes the production API URL and agents rebuild that directory underneath you. A whole false "the selected account resets on refresh" investigation came out of not doing this.
