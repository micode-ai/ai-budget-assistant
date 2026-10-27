# Category Hierarchy Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Category donuts roll subcategories into their parent and drill down on tap; income categories get the hierarchy; Settings → Categories re-parents by drag and drop on phone and desktop web.

**Architecture:** All data rules live in pure, unit-tested modules (`categoryRollup.ts`, `categoryDrillView.ts`, `categoryDrop.ts`); hooks and components only wire them. The roll-up runs after the existing split-aware attribution (`groupExpensesByCategory`), so period totals cannot change. Drag and drop is pure-JS `PanResponder` (as `ReorderableToggleList`), shared by phone and desktop because `CategoriesSettings` is the one body both settings shells host.

**Tech Stack:** Expo 54 / React Native 0.81 (web via react-native-web), Zustand, Jest; NestJS API untouched except a test.

**Spec:** `docs/superpowers/specs/2026-10-27-category-hierarchy-followups-design.md`

## Global Constraints

- Every screen ships phone and desktop web (≥1024) behaviour in the same task.
- All new strings in all 9 locales (`en de es fr pl ru ua be nl`), real orthography; a missing key renders the key.
- No native module; drag is pure-JS (`PanResponder`).
- Display names go through `getCategoryDisplayName` / `categoryLabel` (system keys, ABA-698).
- No new runtime import of `@budget/shared-utils` in `apps/api`.
- Platform splits are component-level; phone behaviour must not change except where the spec says.
- Hierarchy edits need a connection (categories are not in `syncQueue`); status from `useConnectivityStore` (`'offline'` blocks, `'unknown'` counts as online).
- Two levels only; refusals mirror server `assertValidParent` (has live children, target not top-level, self, type mismatch, deposit on either side).

## Review Focus

1. A parent with no own spend in the period: no "(no subcategory)" slice, parent amount = children's sum — Task 1 test `omits the self slice when the parent has no own spend`.
2. Uncategorised spend (`null` key) and spend on a category not in the store list (deleted parent or unknown id) stay top-level exactly as today — Task 1 tests `null key stays top-level`, `unknown parent keeps the child top-level`.
3. Sum of top-level amounts equals sum of the input map for any tree — Task 1 test `top-level total equals input total`.
4. Dragging an expense row over an income row, or any row over a child row, highlights nothing and drops nothing — Task 4 tests `type mismatch is refused`, `child rows are never a target`.
5. A drop outside every highlighted row and gap line changes nothing — Task 4 test `outside any zone returns null`; Task 5 calls `updateCategory` only on a non-null target.

---

### Task 1: Pure roll-up and drill view

**Files:**
- Create: `apps/mobile/src/features/analytics/categoryRollup.ts`
- Create: `apps/mobile/src/features/analytics/categoryDrillView.ts`
- Modify: `apps/mobile/src/features/analytics/useAnalytics.ts` (types `CategorySpending`, `IncomeCategorySpending`)
- Test: `apps/mobile/src/features/analytics/__tests__/categoryRollup.test.ts`, `__tests__/categoryDrillView.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // categoryRollup.ts — no store imports
  export interface RollupChild { categoryId: string | null; isParentSelf: boolean; amount: number; trailing: number[] }
  export interface RollupNode { categoryId: string | null; amount: number; trailing: number[]; children: RollupChild[] }
  export function rollUpCategoryTotals(
    current: Map<string | null, number>,
    trailing: Map<string | null, number>[],      // [] when no trailing window
    parentOf: (categoryId: string) => string | null, // parent id only if that parent is a known live category, else null
  ): RollupNode[]
  // categoryDrillView.ts
  export function drillView<T extends { categoryId: string | null; children?: T[] }>(
    rows: T[], drillParentId: string | null,
  ): { rows: T[]; parent: T | null }  // parent=null & top rows when drillParentId is null or not found
  ```
  `CategorySpending` and `IncomeCategorySpending` gain `children?: CategorySpending[]` / `IncomeCategorySpending[]` and `isParentSelf?: boolean`. A node with `children.length > 0` is drillable. `trailing[i]` of a parent = own + children month i.
- Rule: a node's `children` lists each child key present in `current` plus, when the parent's own amount > 0, one child `{ categoryId: parentId, isParentSelf: true }`. A parent with children only in trailing months but none now has `children: []`.

- [ ] **Step 1: Write failing tests** — `rolls a child into its parent` (G:100, P(child of G):20 → one node G amount 120, children [P 20, self 100]); `omits the self slice when the parent has no own spend`; `null key stays top-level`; `unknown parent keeps the child top-level` (parentOf returns null); `top-level total equals input total` (randomised tree of 6 keys); `trailing series sums own and children per month`; `drillView returns children of the drilled parent`; `drillView falls back to top rows when the parent is gone`.
- [ ] **Step 2: Run** `cd apps/mobile && npx jest categoryRollup categoryDrillView` — expect FAIL (modules missing).
- [ ] **Step 3: Implement** both modules and the type additions.
- [ ] **Step 4: Run** the same command — expect PASS.
- [ ] **Step 5: Commit** `feat(analytics): pure category roll-up and drill view`.

### Task 2: Hooks feed rolled-up data; phone donuts drill down

**Files:**
- Modify: `apps/mobile/src/features/analytics/useCategoryAnalytics.ts`, `useIncomeAnalytics.ts`
- Modify: `apps/mobile/src/components/analytics/CategoryBreakdown.tsx`, `IncomeCategoryBreakdown.tsx`
- Create: `apps/mobile/src/components/analytics/CategoryDrillBreadcrumb.tsx`
- Modify: 9 locale files (`analytics.allCategories` = "All categories", `analytics.parentNoSubcategory` = "{{name}} (no subcategory)")

**Interfaces:**
- Consumes: Task 1 `rollUpCategoryTotals`, `drillView`.
- Produces: `categorySpending` / `incomeByCategory` contain top-level rows only, each with `children` (names via `getCategoryDisplayName`; self child named `t('analytics.parentNoSubcategory', { name })`; child percentage = share of the parent amount; `vsAverage` from `computeVsAverage(amount, trailing)` for parents and children, income keeps no `vsAverage`). `CategoryDrillBreadcrumb({ parentName, onBack })`.

- [ ] **Step 1:** Hooks: build `parentOf` from every category row the store holds, deleted ones included (spec: a deleted child rolls into its live parent), returning the parent id only when that parent is live; a row the store does not hold stays top-level as today; call `rollUpCategoryTotals` with the existing current map and trailing maps; map nodes to rows keeping today's colour assignment for top-level rows (children use their own `color`, else a shade of the parent — implementer's call).
- [ ] **Step 2:** Components: local `drillParentId` state, reset to `null` whenever the `categorySpending` / `incomeByCategory` array identity changes (ruling: covers period, account, currency). Render `drillView(...)`; `InteractiveDonutChart` gets `onSectionPress` → drill when the row has children; list rows with children show a "›" and are pressable; breadcrumb above the chart while drilled; centre label shows the parent name and total when drilled. Children are not pressable.
- [ ] **Step 3:** Add the two i18n keys to all 9 locales.
- [ ] **Step 4: Verify** `cd apps/mobile && npx jest analytics && npx tsc --noEmit -p .` — PASS, no type errors.
- [ ] **Step 5: Commit** `feat(analytics): category donuts roll up and drill into subcategories`.

### Task 3: Desktop breakdown cards drill down

**Files:**
- Modify: `apps/mobile/src/components/analytics/desktop/BreakdownCard.tsx`, `BreakdownGrid.tsx`

**Interfaces:**
- Consumes: Task 1 `drillView`, Task 2 rows with `children`, `CategoryDrillBreadcrumb`.
- Produces: `BreakdownRow` gains `hasChildren?: boolean`; `BreakdownCard` gains optional `onRowPress?: (row: BreakdownRow) => void` and `drill?: { parentName: string; onBack: () => void }`. Merchant/tag/project cards pass neither and render exactly as today.

- [ ] **Step 1:** `BreakdownGrid` holds one `drillParentId` per category card (expense, income), resets on input identity change, converts `drillView(...).rows` through the existing `categoryToRows` (and the income equivalent) with `hasChildren`.
- [ ] **Step 2:** `BreakdownCard` renders the breadcrumb when `drill` is set, a "›" on `hasChildren` rows, and calls `onRowPress` for those rows and their donut slices.
- [ ] **Step 3: Verify** `npx tsc --noEmit -p .` and `npx jest analytics` PASS; open `npm run dev:web` at ≥1024px and check drill/back on both cards (report what you saw, or state that you could not run it).
- [ ] **Step 4: Commit** `feat(analytics): desktop category cards drill into subcategories`.

### Task 4: Income hierarchy and pure drop rules

**Files:**
- Modify: `apps/mobile/src/features/categories/parentCandidates.ts` (drop the expense-only guard; filter parents by the `type` argument)
- Create: `apps/mobile/src/features/categories/categoryDrop.ts`
- Modify: `apps/mobile/src/components/settings/categories/CategoriesSettings.tsx` (parent row for income too; `incomeTree = sortCategoriesAsTree(incomeCategories)`)
- Modify: income pickers `src/components/income/create/IncomeCreateForm.tsx`, `src/components/income/detail/IncomeDetailsCard.tsx`, `app/income/voice.tsx` — render `sortCategoriesAsTree(getIncomeCategories())` with the same depth indent `ExpenseCreateForm` uses
- Test: `src/features/categories/__tests__/parentCandidates.test.ts` (extend), `__tests__/categoryDrop.test.ts`; API `apps/api/src/modules/categories/categories.service.spec.ts` (add `accepts an income parent for an income category` and `rejects an expense parent for an income category`) if not already covered

**Interfaces:**
- Produces:
  ```ts
  export type DropRefusal = 'hasChildren' | 'targetNotTopLevel' | 'self' | 'typeMismatch' | 'deposit' | 'alreadyThere';
  export function refuseParentDrop(categories: Category[], dragged: Category, target: Category): DropRefusal | null;
  export interface RowLayout { categoryId: string; depth: 0 | 1; top: number; height: number }
  export type DropTarget = { kind: 'parent'; categoryId: string } | { kind: 'topLevel' };
  export const GAP_HALF = 10; // px either side of a boundary before a top-level row / after the last row
  export function dropTargetAt(y: number, rows: RowLayout[], dragged: Category, categories: Category[]): DropTarget | null;
  ```
  `dropTargetAt`: inside a gap band → `{kind:'topLevel'}` only when `dragged.parentId` is set, else `null`; inside a top-level row (outside gap bands) → `{kind:'parent'}` only when `refuseParentDrop` is null; child rows and anywhere else → `null`. `rows` holds one section (expense or income) only.

- [ ] **Step 1: Write failing tests:** `eligibleParents returns income parents for an income category`; `refuseParentDrop` cases `hasChildren`, `targetNotTopLevel`, `self`, `typeMismatch`, `deposit` (either side), `alreadyThere`, and `null` for a valid pair; `dropTargetAt` cases `top-level row is a parent target`, `child rows are never a target`, `gap returns topLevel for a subcategory`, `gap returns null for a top-level drag`, `outside any zone returns null`, `type mismatch is refused`.
- [ ] **Step 2: Run** `npx jest parentCandidates categoryDrop` — FAIL.
- [ ] **Step 3: Implement**, then the settings form and income pickers.
- [ ] **Step 4: Run** mobile jest for both files, `npx tsc --noEmit -p .`, and the API spec — PASS.
- [ ] **Step 5: Commit** `feat(categories): income hierarchy and drop rules`.

### Task 5: Drag and drop in Settings → Categories

**Files:**
- Create: `apps/mobile/src/components/settings/categories/CategoryDragList.tsx`
- Modify: `CategoriesSettings.tsx` (sections render through `CategoryDragList`; row tap still opens the edit form)
- Modify: 9 locale files — `categories.dragHint` ("Drag a category onto another to make it a subcategory, or between top-level categories to move it back"), `categories.dropMakeSub` ("Make a subcategory"), `categories.dragNeedsInternet` ("Moving categories needs an internet connection"), `categories.dropRefused.hasChildren`, `.targetNotTopLevel`, `.typeMismatch`, `.deposit` (one sentence each)

**Interfaces:**
- Consumes: Task 4 `dropTargetAt`, `refuseParentDrop`, `RowLayout`; `useConnectivityStore`; store `updateCategory`; `canEdit`.
- Produces: `CategoryDragList({ type, tree, canEdit, onRowPress, renderRow })`.

- [ ] **Step 1:** Gesture: native starts on long-press (~350 ms); web starts on press-and-move > 4 px. While dragging, the lifted row follows the pointer, the parent `ScrollView` stops scrolling, the hovered target row is highlighted with `categories.dropMakeSub`, a gap target shows a horizontal line; a plain swipe without the long-press still scrolls. Edge auto-scroll is the implementer's call.
- [ ] **Step 2:** Drop: `{kind:'parent'}` → `updateCategory(id, { parentId: target })`; `{kind:'topLevel'}` → `updateCategory(id, { parentId: null })`; `null` → nothing. Use the same payload shape the form sends for a parent change (`categoryEditPayload` with `parentChanged: true` and an unchanged name — check the shape and reuse it). Server 400 → `categories.parentInvalid`; other failure → `errors.saveFailed` (existing rollback stays). When hovering a refused row, nothing highlights; releasing over it shows the matching `categories.dropRefused.*` message.
- [ ] **Step 3:** Gates: `canEdit` false → no drag; connectivity `'offline'` → long-press shows `categories.dragNeedsInternet`, no drag. Show `categories.dragHint` once under each section title when `canEdit`.
- [ ] **Step 4:** i18n keys in all 9 locales.
- [ ] **Step 5: Verify** `npx jest categories && npx tsc --noEmit -p .` PASS; run `npm run dev:web` and drag on desktop width and at phone width in the browser (report what you saw, or state you could not run it). Phone device check is deferred to the user.
- [ ] **Step 6: Commit** `feat(categories): drag and drop to nest and un-nest categories`.

### Task 6: Documentation

**Files:**
- Modify: `docs/wiki/features/category-hierarchy.md` (analytics drill-down, income hierarchy, drag and drop, offline rule; remove the two resolved Known gaps), `docs/wiki/log.md` (one line, "(issue pending)")
- Modify: `user_docs/<lang>/11-settings.md` (categories: drag and drop, income subcategories) and the analytics section file (drill-down) for all 9 locales; then `npm run generate:help`, `python docs/marketing/help/build_help.py`, `LANDING_BASE= ROBOTS="index,follow,max-image-preview:large" python docs/marketing/landing/build_landing.py`

- [ ] **Step 1:** Wiki and log edits; `python scripts/wiki-lint.py` — no findings.
- [ ] **Step 2:** User docs in 9 locales, real orthography; regenerate help and landing.
- [ ] **Step 3: Commit** `docs: category hierarchy follow-ups` (generated site files need `git add -f` under `docs/marketing`).
