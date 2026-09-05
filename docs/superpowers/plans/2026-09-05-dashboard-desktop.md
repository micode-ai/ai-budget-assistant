# Dashboard Desktop Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Dashboard a real desktop layout — a focus column plus a fixed ~300px standing rail — and restore the Safe-to-Spend figure that the previous desktop pass silently removed.

**Architecture:** Fourth screen through the same shape. The route stays single, one component-level split decides mobile vs desktop on width alone, the mobile JSX keeps one definition. **No widget is rewritten**: the rail's ~300px is close to the width every one of them was already built for on a phone, which is why the old two-equal-column layout at ~880px made them look sparse.

**Tech Stack:** Expo Router, React Native Web, TypeScript, Jest (nothing renders a component in CI).

**Spec:** `docs/design/2026-09-05-dashboard-web.md`
**Language:** `docs/contracts/desktop-web-design-language.md` — 5a is what screen two added, 5b is the bundle check and how to read it, 6 lists things that look like defects and are not.

## Global Constraints

- **The mobile rendering must not change.** Every widget this plan touches is rendered by the phone too. Extensions are **additive props with mobile-preserving defaults** — the `desktop?: boolean` pattern from `InflationIndexSection`, recorded in the language doc as 5a's first entry.
- **No computation is moved, merged or deleted.** The stores and `useHomeScreenData` are read-only except where a task says otherwise.
- **Nothing under `src/` may import from `app/`.**
- **Every colour, spacing and text style from `useTheme()` tokens.** `success`/`danger`/`warning`/`onSemantic` are not accent-derived; `textInverse` is.
- **One page scroll.** No facet rail, no day grouping, no selection.
- **No new dependency.** All nine locales for any new key; reuse where one genuinely fits.
- The mobile suite stands at **904 tests across 104 suites**. Record what it reports; never predict.

---

### Task 1: Split the Dashboard

**Files:**
- Create: `apps/mobile/src/components/home/DashboardMobile.tsx`, `DashboardView.tsx`, `DashboardView.web.tsx`
- Modify: `apps/mobile/app/(tabs)/index.tsx`

**Note:** unlike the three previous screens there is **no state hook to extract** — `useHomeScreenData` already exists and already holds it. This task moves JSX only.

- [ ] **Step 1: Move, do not rewrite.** Read `src/components/expenses/ExpensesMobile.tsx` and its gate pair first. Every line that leaves the route must reappear.
- [ ] **Step 2: The gate.** `DashboardView.web.tsx` renders `DashboardMobile` on **both** sides for now — the desktop component arrives in Task 5, and a `null` stub blanks the landing screen in every desktop browser until then.
- [ ] **Step 3: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/components/home apps/mobile/app/\(tabs\)/index.tsx
git commit -m "ABA-505 Extract the dashboard's JSX so a second view can share it"
```

A pure move must not change the test count, and the two-directional diff check is standard here: every removed line reappears, every added line accounted for.

---

### Task 2: Extract the segmented progress bar

**Files:**
- Create: `apps/mobile/src/components/shared/SegmentedProgressBar.tsx`
- Modify: `apps/mobile/src/components/budgets/desktop/BudgetCard.tsx`

**Why:** the dashboard's monthly-budget card wants the same bar the Budgets screen already has. Pulling it out is the alternative to a second copy — and a second copy of a bar that reports money is how two screens come to disagree about the same number.

- [ ] **Step 1: Extract with no behaviour change.** `BudgetCard`'s rendering must be identical afterwards.
- [ ] **Step 2: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/components/shared apps/mobile/src/components/budgets
git commit -m "ABA-505 Extract the segmented progress bar so the dashboard can reuse it"
```

---

### Task 3: The monthly-budget segments util

**Files:**
- Create: `apps/mobile/src/features/dashboard/monthlyBudgetSegments.ts` and its spec

**Why:** `getMonthlyBudgetSummary()` blends across **all** active monthly budgets and carries no per-category data, so segments are only honest when the month reduces to a single contributing budget with category allocations.

- [ ] **Step 1: Pure, and honest about its limit.** Return segments only for that case and nothing otherwise — a bar that invents a split across merged budgets would be a wrong number, which is worse than no bar. The spec's Layout section defines the case.
- [ ] **Step 2: Test it, red first.** Before writing each test, name the production change that would make it fail. This project has shipped several tests that could not fail; do not add another. Cover: the single-budget case, the merged case returning nothing, and no budgets at all.
- [ ] **Step 3: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/features/dashboard
git commit -m "ABA-505 Add the monthly budget segment util for the dashboard card"
```

---

### Task 4: Additive props on four shared widgets

**Files:**
- Modify: `src/components/widgets/NetProfitWidget.tsx`, `src/components/home/SafeToSpendSheet.tsx`, `src/components/widgets/FinancialHealthWidget.tsx`, `src/components/home/widgets/MonthlyBudgetCard.tsx`

**All four are rendered by the phone.** Every prop is optional with a default that reproduces today's mobile output exactly. If any of them cannot be extended that way, stop and report rather than reshaping the component.

- [ ] **Step 1: `NetProfitWidget`** — `safeToSpend?`, `showRangeChips?`, and a range-driven history length. The spec's "NetProfitWidget's new props, precisely" section gives the shapes.
- [ ] **Step 2: The two sheets become dialogs on desktop.** `SafeToSpendSheet` and `FinancialHealthWidget`'s internal modal both use a `Pressable`/`TouchableOpacity` backdrop, which the language doc flags as a focus-trap bug — a `Pressable` emits a `tabIndex` and the invisible scrim becomes the trap's first target. Both take `desktop?: boolean` and follow `ExpenseDialog.tsx` rather than a new modal.
- [ ] **Step 3: `MonthlyBudgetCard`** — `segments?`, undefined on mobile, output unchanged.
- [ ] **Step 4: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/components
git commit -m "ABA-505 Give four shared widgets additive desktop props"
```

If a pre-existing test count moves, you changed behaviour rather than extending it — say so before anything else.

---

### Task 5: The desktop layout

**Files:**
- Create: `src/components/home/desktop/DashboardDesktop.tsx`, `FocusColumn.tsx`, `DashboardRail.tsx`
- Modify: `src/components/home/DashboardView.web.tsx`

- [ ] **Step 1: Build to the spec's wireframe.** Focus column left, fixed ~300px rail right, one page scroll.

**Restore Safe-to-Spend.** It is absent on desktop today: `HomeHeroHeader` is its only renderer, the hero is hidden on desktop, and `renderHomeWidget('safeToSpend')` returns `null` with a comment claiming the hero is its single surface — untrue since ABA-290. It becomes the top of the focus column.

**The focus column needs a defined fallback.** Widget visibility and order are user-configurable, so the widget meant to lead can be hidden. Implement the spec's fallback rule; a blank focus column on the landing screen is the worst failure this layout has.

**The rail must read the same whatever is in it** — a user-ordered set of varying heights, possibly nearly empty or much longer than the focus column.

**The quick-action strip is retired from the desktop tree, not modified.** Do not edit `HomeQuickActionStrip.tsx`.

- [ ] **Step 2: Wire the gate.** `DashboardView.web.tsx` stays the only place the decision is made; replace the desktop branch.
- [ ] **Step 3: Verify.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
cd /d/Work/micode/ai-budget-assistant && bash scripts/build-web.sh
```
Grep the built web bundle for `DashboardDesktop`.

- [ ] **Step 4: Commit.**

```bash
git add apps/mobile/src/components/home
git commit -m "ABA-505 Lay out the dashboard for a desktop window"
```

---

### Task 6: Verification, docs, and the issue

- [ ] **Step 1: Look at it** — both themes, several accents, at `>=1440` and `1200`; with most widgets hidden, with them reordered, and on an account with almost no data.
- [ ] **Step 2: Confirm the phone is untouched** below 1024.
- [ ] **Step 3: The native bundle check**, standing practice after each desktop screen because the failure is silent. Read a non-zero result before believing it — the grep matches substrings, and `BudgetCard` once reported 1 purely because of `MonthlyBudgetCard`.

```bash
cd apps/mobile && npx expo export --platform android --output-dir /tmp/native-check --clear
grep -c DashboardDesktop /tmp/native-check/_expo/static/js/android/index-*.hbc   # expect 0
```

- [ ] **Step 4: Update the language doc** with what this fourth screen established. It is gitignored: `git add -f`.
- [ ] **Step 5: Create ABA-505.** Name the Safe-to-Spend restoration as a **fix of a regression from ABA-290**, not as a new feature — that is what it is, and calling it a feature hides how it happened.

---

## Deployment notes

- Stays on `feature/desktop-web-screen`. A push to `development` rebuilds and ships the SPA with no separate step and no feature flag — a push IS a release, and that is the product owner's call.
- Nothing here requires a mobile release; Metro resolves `DashboardView.tsx` → `DashboardMobile.tsx` for native.
- The net-profit chart's empty look is **not** believed to be a width bug: `InteractiveLineChart` does not use `useContentWidth()` and already self-measures. The likely cause is data sparsity — six hardcoded months with no "not enough data" branch, unlike `NetCapitalWidget`. The range chips this plan adds are also the right fix for it. If the chart still looks empty after Task 5, that reading was wrong and it needs its own investigation rather than a layout change.
