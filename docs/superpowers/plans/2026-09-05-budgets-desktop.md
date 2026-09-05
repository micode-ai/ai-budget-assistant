# Budgets Desktop Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Budgets tab a desktop layout on `app.ai-budget.pl` at `>=1024px`, and fix the two pre-existing defects the design surfaced while reading the screen.

**Architecture:** Third screen through the same shape: extract the state and the mobile JSX first, then build the desktop layer beside them. The route file stays single, one component-level split decides mobile vs desktop on width alone, and the mobile JSX keeps exactly one definition.

**Tech Stack:** Expo Router, React Native Web, TypeScript, Jest (nothing renders a component in CI).

**Spec:** `docs/design/2026-09-05-budgets-web.md`
**Language:** `docs/contracts/desktop-web-design-language.md` — section 5a is what the second screen added; section 6 lists things that look like defects and are not.

## Global Constraints

- **The mobile rendering must not change — with ONE deliberate exception, in Task 2.** That task fixes a permissions gap and therefore *does* change what a viewer sees on the phone. It is called out there, and nowhere else in this plan may the mobile rendering move.
- **No computation is moved, merged or deleted.** `budgetStore` and `computeBudgetPeriod` are read-only except for the one additive change in Task 3.
- **Nothing under `src/` may import from `app/`.**
- **Every colour, spacing and text style from `useTheme()` tokens.** 13 accents map onto brand tokens at runtime. `success`/`danger`/`warning`/`onSemantic` are deliberately NOT accent-derived — which matters more here than on any previous screen, because budget state is exactly what those colours are for.
- **No facet rail, no day grouping, no checkbox selection.** Nothing here is a row; those are List-specific.
- **No FAB.** The action goes in the screen's own top bar.
- **No new dependency.**
- **All nine locales** (`en, ru, pl, de, es, fr, ua, be, nl`) for any new key. Reuse an existing key where one genuinely fits.
- The mobile suite stands at **884 tests across 103 suites**; the API suite at **2249 across 198**. Record what they actually report; never predict.

---

### Task 1: Split the Budgets screen

**Files:**
- Create: `apps/mobile/src/features/budgets/useBudgetsScreenData.ts`
- Create: `apps/mobile/src/components/budgets/BudgetsMobile.tsx`
- Create: `apps/mobile/src/components/budgets/BudgetsView.tsx`
- Create: `apps/mobile/src/components/budgets/BudgetsView.web.tsx`
- Modify: `apps/mobile/app/(tabs)/budgets.tsx`

- [ ] **Step 1: Extract, do not rewrite**

Read `src/features/analytics/useAnalyticsScreenData.ts` and `src/components/analytics/AnalyticsMobile.tsx` — this is the same operation a third time. Every line that leaves the route must reappear.

- [ ] **Step 2: The platform pair**

`BudgetsView.web.tsx` renders `BudgetsMobile` on **both** sides of the gate for now — the desktop component arrives in Task 5, and a stub returning `null` would leave the tab blank in every desktop browser in the meantime.

- [ ] **Step 3: Verify and commit**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/features/budgets apps/mobile/src/components/budgets apps/mobile/app/\(tabs\)/budgets.tsx
git commit -m "ABA-504 Extract the budgets screen's state so a second view can share it"
```

---

### Task 2: Gate Edit and Delete on the budget detail screen

**Files:**
- Modify: `apps/mobile/app/budget/[id].tsx`

**This task deliberately changes the mobile rendering.** It is the one exception in this plan, and it is a fix rather than drift: `app/budget/[id].tsx` renders Edit and Delete unconditionally, while the API refuses both for a viewer (`ViewerBlockGuard` on `budgets.controller.ts`). A viewer is currently shown two controls that cannot work — the exact dead-end the codebase-wide `canEdit` convention exists to prevent, and which every other reference-data screen already honours.

- [ ] **Step 1: Apply the existing convention**

`useAccountStore(s => s.canEdit())` is how every other screen does this. Read one of them (`settings/categories.tsx`, `tags/manage.tsx`) and follow it rather than inventing a gate.

- [ ] **Step 2: Verify and commit**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/app/budget/\[id\].tsx
git commit -m "ABA-504 Hide budget edit and delete from viewers, as every other screen does"
```

---

### Task 3: Make `isLoading` cover the server phase

**Files:**
- Modify: `apps/mobile/src/stores/budgetStore.ts`

**Why:** `loadBudgets()` clears `isLoading` after the local-SQLite read. On web that read is an in-memory mock returning `[]` instantly, so the screen paints "no budgets yet" before the server responds — a false empty state on the platform this plan is about. On native the local read has real rows, which is why nobody saw it.

- [ ] **Step 1: Additive only**

Keep `isLoading` meaning what it means today for existing consumers; the server phase must be covered without changing the flag's contract for callers that already read it. If that turns out to require changing the contract, stop and report rather than breaking a consumer you have not read.

- [ ] **Step 2: Verify and commit**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/stores/budgetStore.ts
git commit -m "ABA-504 Keep budgets loading until the server answers, not just SQLite"
```

---

### Task 4: Extract the create form and the detail view

**Files:**
- Create: `apps/mobile/src/components/budgets/BudgetCreateForm.tsx`
- Create: `apps/mobile/src/components/budgets/BudgetDetailView.tsx`
- Modify: `apps/mobile/app/budget/new.tsx`, `apps/mobile/app/budget/[id].tsx`

**Why:** the desktop hosts both in dialogs, `src/` cannot import from `app/`, and a dialog hosts an existing component rather than reimplementing one. This is the sixth and seventh such extraction on this branch — read one before starting.

- [ ] **Step 1: Pure moves**

Params become props; `router.back()` becomes `onDone()`. **Check what each route renders *around* the body you are moving** — the transactions dialog shipped twice missing exactly that, once the receipt sections and once the amount itself.

- [ ] **Step 2: Verify and commit**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/components/budgets apps/mobile/app/budget
git commit -m "ABA-504 Extract the budget create form and detail view so dialogs can host them"
```

---

### Task 5: The desktop layout

**Files:**
- Create: `apps/mobile/src/components/budgets/desktop/BudgetsDesktop.tsx` and the cards/dialogs the spec names
- Modify: `apps/mobile/src/components/budgets/BudgetsView.web.tsx`

- [ ] **Step 1: Build to the spec**

Follow `docs/design/2026-09-05-budgets-web.md`: grouping by state, the segmented allocation bar, the summary tiles, the top bar with the create action, and the empty state — which on a 1920px window is the difference between "new" and "broken".

**No global period control**, and the spec argues why from the model: budgets carry heterogeneous periods and the financial-month anchor applies only to monthly ones.

**Collapse the two redundant sentences into one.** `estimatedExhaustionDate` and `projectedTotal > amount` are algebraically the same event; the spec works through it. Presentation only — do not touch either computation.

- [ ] **Step 2: Verify**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
cd /d/Work/micode/ai-budget-assistant && bash scripts/build-web.sh
```
Grep the built bundle for `BudgetsDesktop`.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/budgets
git commit -m "ABA-504 Lay out the budgets screen for a desktop window"
```

---

### Task 6: Verification, docs, and the issue

- [ ] **Step 1: Look at it** — both themes, several accents, at `>=1440` and at `1200`, with budgets in every state and with none at all.
- [ ] **Step 2: Confirm the phone is untouched** below 1024 — except Task 2's deliberate change, which a viewer account is the only way to see.
- [ ] **Step 3: Re-run the native bundle check.** This is now standing practice after each desktop screen, because the failure is silent:

```bash
cd apps/mobile && npx expo export --platform android --output-dir /tmp/native-check --clear
grep -c BudgetsDesktop /tmp/native-check/_expo/static/js/android/index-*.hbc   # expect 0
```

- [ ] **Step 4: Update the language doc** with anything this third screen established or contradicted. It is gitignored: `git add -f`.
- [ ] **Step 5: Create ABA-504** — English, Problem / Implementation / Out of scope. Name Task 2's mobile change explicitly as a fix, so it is not later mistaken for drift.

---

## Deployment notes

- Stays on `feature/desktop-web-screen`. A push to `development` rebuilds and ships the SPA with no separate step and no feature flag — a push IS a release, and that is the product owner's call.
- Task 2 changes what a viewer sees on the phone, so it reaches devices only at the next store release. The server has always refused those actions, so nothing is unsafe in the meantime.
