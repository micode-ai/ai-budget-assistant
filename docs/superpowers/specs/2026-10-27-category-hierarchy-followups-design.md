# Category hierarchy follow-ups — analytics drill-down, income hierarchy, drag and drop

Date: 2026-10-27. Builds on ABA-696 (`docs/wiki/features/category-hierarchy.md`) and ABA-698
(`docs/wiki/features/category-system-keys.md`).

## Intent and why

ABA-696 gave categories one level of subcategories (`Category.parentId`) and rolled them up in budgets
only. The owner now wants the hierarchy to be visible and easy to manage everywhere they look:

1. In **analytics**, the by-category donut shows a parent as one slice that includes its subcategories,
   and tapping it opens that parent's own breakdown.
2. **Income** categories get the same hierarchy as expenses.
3. In **Settings → Categories**, a category is moved under another, and back out to the top level,
   by **drag and drop** — on the phone and on desktop web.

Success: the owner opens October analytics, sees "Alkohol 255 zł" as one slice, taps it and sees
Piwo / Wino / Alkohol-without-subcategory; in settings they drag Piwo onto Alkohol and out again
without opening a form.

## Goals

### 1. Analytics drill-down (owner chose option A)

- Top level of the by-category donut and its "category details" list shows **only top-level
  categories**. A parent's amount = spend attributed to the parent itself + to each live child.
  Percentages are of the period total, as today.
- A parent that has at least one live child shows a "›" affordance in the list row (legend too where
  it is a separate list).
- Tapping a parent's **slice or list row** redraws the **same donut** for that parent: its slices are
  each child with spend in the period plus one slice "<Parent> (no subcategory)" — localized, all 9
  locales — for spend recorded on the parent itself; the slice is omitted when that amount is 0.
  The centre shows the parent name and total.
- A breadcrumb above the chart, "All categories › <Parent>", returns to the top level when its first
  part is tapped. The Android/browser back action does not need to be intercepted (builder's call;
  the breadcrumb is required).
- Children cannot be drilled into (two levels only). Tapping a category without children keeps
  today's behaviour. Today no category slice or row navigates anywhere (the donut only focuses the
  slice; desktop `BreakdownCard` only has "show all"), so drilling a parent removes no existing
  action.
- The "vs average" chip (`vsAverage`) is computed for a parent on its rolled-up amount and for each
  child inside the drill-down on the child's own amount. (My call.) `computeVsAverage` in
  `features/analytics/categoryGrouping.ts` already takes per-category monthly totals, so the parent's
  series is the element-wise sum of its own and its children's monthly totals — no new data source.
- **Deleted children** (my call): roll-up follows `parentId` regardless of the child's `isDeleted`.
  Spend on a deleted child whose parent is live counts in the parent and appears in the drill-down
  under the child's name, exactly as a deleted category is labelled today; spend on a deleted
  top-level category stays where today's donut puts it. The period total never changes.
- Same behaviour on the **income** donut (`IncomeCategoryBreakdown`) and on **desktop web**
  (`AnalyticsDesktop` / `BreakdownCard`). Merchant and tag breakdowns are unchanged.
- Attribution stays the existing rule (splits decide; without splits the expense's own category takes
  the whole amount — `attributeToCategories`); roll-up happens after attribution, by the current tree.
- The drill-down state resets when the period, account or currency changes.

### 2. Income hierarchy

- The server already accepts `parentId` for income categories (`assertValidParent` checks
  `parent.type === type`); this is client work.
- The category form shows the parent picker for income categories too (income parents only).
- Income category pickers group children under their parent, as expense pickers do.
- The income donut rolls up and drills down per goal 1.
- Budgets are expense-only; nothing changes there.

### 3. Drag and drop in Settings → Categories (owner chose option B)

- Expense and income lists are each rendered as a tree: top-level rows, children indented under their
  parent (if not already).
- **Start:** long-press on a row (phone); mouse press-and-drag (desktop web). The row lifts and follows
  the pointer.
- **Make a subcategory:** while dragging, hovering a **top-level row** highlights it with the hint
  "make a subcategory" (localized). Dropping there sets the dragged category's `parentId` to it.
- **Back to top level:** while dragging a **subcategory**, the **gap between two top-level rows**
  (and before the first / after the last) shows a horizontal line. Dropping on a line clears
  `parentId`. Dropping anywhere else cancels; nothing changes.
- **Order is not changed** by a drop. The list keeps its current sort; the drop position only decides
  "inside" vs "top level". (My call.)
- **Refused drops** (no change, short localized message), mirroring `assertValidParent`:
  - the dragged category has live children (would make three levels);
  - target is a subcategory, or itself;
  - target is of the other type (expense vs income);
  - either side is the deposit category.
  Invalid targets should not highlight while hovered.
- The existing parent picker in the category form stays; drag and drop is an extra way.
- Viewers (and archived trips, `canEdit()` false) cannot drag.
- A drop goes through the same store action as a parent change from the form (the ABA-696 path:
  local write, push, rollback on server refusal), so budgets and analytics update the same way.
- **Offline** (my call): hierarchy edits need a connection today (categories are not in
  `syncQueue`; an offline parent change rolls back). So while offline, a drag does not start — a
  long-press shows a short localized "needs internet" message instead. If the connection drops
  mid-push, the existing rollback and save-failed message apply.
- **Budget allocations** (my call): no warning or confirmation when the dragged category has budget
  allocations — the same as choosing a parent in the form today. Roll-up already guarantees every
  expense counts once per budget.

## Non-goals

- Reordering categories by drag (no stored order exists).
- More than two levels.
- Merchant / tag hierarchy; drill-down on any chart other than the two category donuts.
- Changes to budget roll-up, attribution rules or server hierarchy validation.
- Server-originated text (bots, reports) showing hierarchy.

## Anti-goals

- A total that differs from today's per-period total, or money counted twice in the donut.
- An accidental drop that silently re-parents a category: a drop outside a highlighted target or a
  line must do nothing.
- A drag implementation that breaks list scrolling on the phone (a plain swipe must still scroll).
- A native module for drag and drop (the Android toolchain constraint in `CLAUDE.md` — keyboard
  section — applies by spirit: pure-JS, as `ReorderableToggleList` does with `PanResponder`).
- Phone layout or behaviour regressions from desktop work and vice versa (platform splits stay
  component-level).

## Constraints

- One codebase for phone and desktop web; every screen ships both layouts in the same task.
- All new strings in all 9 locales, real orthography.
- No new runtime import of `@budget/shared-utils` in `apps/api`.
- Display names go through `displayCategoryName` / `entityLabel` (system keys).
- Tests: no component renderer exists in the repo, so roll-up/drill-down data and drop-target
  validation must live in pure, unit-tested functions; the gesture layer is verified on a device.

## Left to the builder

- Gesture implementation details (thresholds, auto-scroll near the edges while dragging, haptics).
- Exact visuals within the existing theme; colours of child slices (derive from the parent's colour
  or use the child's own colour).
- Desktop drag via pointer events or the same `PanResponder` on web.
- Whether the drill-down is component state or a small store.
- User docs: update the categories and analytics sections in `user_docs` (9 locales).
