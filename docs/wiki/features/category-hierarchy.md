# Category hierarchy

*Hub: [api](../api.md) · [mobile-app](../mobile-app.md) · related:
[budgets](budgets.md), [receipt-category-split](receipt-category-split.md),
[category-system-keys](category-system-keys.md)*

## What this is

A two-level category tree. A category is top-level or the child of a top-level category of the same
account and type (`Category.parentId`). Budgets roll children up into their parent, pickers group
children under it, and no automatic path may create a category that duplicates an existing one.

Why it exists: on 2026-10-26 a shared household account's monthly category budget could not be
read. A few supermarket receipts had spread across nine categories — the default groceries
category next to its Polish-locale translation, an alcoholic-drinks category next to a beer one (a
synonym), bread and cheese categories (parts of groceries), and three deposit categories in three
languages. A large share of the month's grocery and beer spending missed the limits meant to hold it. The cause was the receipt classifier minting categories
whose only duplicate check was an exact name match. Design:
`docs/superpowers/specs/2026-10-26-category-hierarchy-design.md`.

## Entry points

- `apps/api/src/modules/categories/categories.service.ts` — `assertValidParent`
- `apps/api/src/common/utils/category-tree.ts` · mirror
  `packages/shared-utils/src/formatting/category-tree.ts` — expand/roll-up/sort helpers
- `apps/api/src/common/utils/deposit-category.ts` · mirror
  `packages/shared-utils/src/formatting/deposit-category.ts` (mobile parity test)
- `apps/api/src/common/utils/category-equivalence.ts` — `findEquivalentCategory`;
  `defaultCategorySlot` in `apps/api/src/modules/accounts/default-categories.ts`
- Callers of the equivalence check: `expense-category-resolver.util.ts`,
  `import-bank-category.util.ts`, `categorize-bot.service.ts` (`applyStep`), the receipt
  classifier (`receipt-category-split.service.ts`)
- Budget roll-up: `budgets.service.ts`, `budget-alert.service.ts`, `budget-category-tree.util.ts`;
  phone `apps/mobile/src/stores/budgetProgress.ts`
- UI: `CategoriesSettings.tsx` (parent picker), `BudgetDetailView.tsx` and desktop `BudgetCard.tsx`
  (subcategory rows), grouped category pickers

## Key concepts

**Analytics drill-down.** The by-category donut and the income donut show top-level categories only;
a parent's amount includes its subcategories (`categoryRollup.ts`, `buildParentOf.ts`). Tapping a
parent (slice or row, marked "›") redraws the donut for it (`categoryDrillView.ts`): its
subcategories plus "<Parent> (no subcategory)" for spend recorded on the parent itself. The
breadcrumb `CategoryDrillBreadcrumb` ("All categories › <Parent>") goes back. The drill state is
`useDrillParent.ts`, which resets whenever the rolled-up rows are rebuilt — a new or edited
transaction, a sync, a language change, or a period/account/currency change, not only the last
three. The donut (phone) and the whole card (desktop) are keyed on the drill level, so a focused
slice or an expanded "Show all" never carries over into or out of a drill. Legacy name-keyed spend
is re-keyed to its category id first (`normalizeCategoryKeys`), so a parent never shows twice. A
deleted subcategory's spend stays a top-level slice: the device does not keep deleted category
rows, so its parent cannot be found. "vs average" chips for a parent use the rolled-up amount.
Desktop web does the same in `BreakdownGrid`/`BreakdownCard`.
All under `apps/mobile/src/features/analytics/` and `components/analytics/`.

**Drag and drop in Settings → Categories.** `CategoryDragList.tsx` (pure-JS `PanResponder`):
long-press (phone) or press-and-drag (desktop) a category; drop on a top-level category to nest it,
or drop a subcategory on the line between top-level categories to un-nest it. The list order does
not change. Page scroll is frozen while a drag is in progress. A release commits only the target
that was highlighted at that moment — never one recomputed from the release point. Rows carry a
permanent transparent 1px border, so the hover highlight never resizes a row and shifts the measured
hit boxes. A refused drop shows a message. Needs a connection (offline long-press shows a message,
status from `useConnectivityStore`); viewers cannot drag.

**Two levels, server-enforced.** `assertValidParent` rejects a parent that has a parent itself, a
parent from another account, a parent of a different type, and re-parenting a category that already
has children. Deleting a parent stays blocked (409) while it has children.

**Roll-up expands the allocation set; the attribution function is unchanged.** Before
`attributableAmountForCategories` runs, a budget's allocated category ids are expanded with each
allocated parent's live children. A child's money shows in both lines only when parent AND child are
each allocated; the budget's overall spent counts every expense once. The current tree applies to
every period — history and alerts included — so re-parenting changes past figures by design.

**Equivalence, not substring matching.** `findEquivalentCategory` decides a candidate name duplicates
an existing category by normalized equality, or by sharing a default-category slot
(`defaultCategorySlot`) across all nine locales — so "Zakupy spożywcze" equals "Groceries" and
"Deposit" equals "Kaucja". Substring matching is rejected on purpose: "Car" or "Dom" would misfire.

**Automatic vs explicit creation.** Automatic paths (receipt proposals, categorize-uncategorized,
bank-import AI suggestions, the expense category resolver) use the equivalence check and reuse the
existing category on a hit. Explicit creation (settings screen, chat `create_category`, the bots'
create step) keeps the exact-name check only — the user asked for it.

**Classifier and the tree.** The prompt shows the tree as `Parent > Child`; the response enum is
every category's own name, so a line may land on a child or a parent. A proposal that overlaps an
existing category is rerouted to it. The classifier never creates a subcategory — only the user does.

**The deposit category stays outside the tree** — never a parent, never a child.

**Equivalence now goes by key first.** A standard category is identified by its language-independent
system key, with the name-slot comparison kept for keyless rows — see
[category-system-keys](category-system-keys.md).

## Invariants

- **Never more than two levels** and never across account or type — enforced in the API, not the UI.
- **Every expense counts once per budget.** Roll-up may show money in two lines (parent and an
  explicitly allocated child) but never twice in the overall figure.
- **Phone and server must agree.** The tree utils and deposit-name utils are duplicated pairs
  (canonical `apps/api`, mirror `shared-utils`) — change both; the API cannot import
  `@budget/shared-utils` at runtime.
- **No automatic creation without the equivalence check.** A new automatic creator that skips it
  reopens the failure that motivated this page.
- **No substring matching in the overlap check.**
- **Hierarchy edits need a connection.** Categories are not in `syncQueue`, so an offline create
  with a parent, or an offline re-parent, cannot be replayed: `createCategory` and `updateCategory`
  roll the local change back and surface the save-failed message on a transport failure, and on a
  400/409 refusal. A parentless offline create still stands. A real category push queue is a
  follow-up. `remapCategoryId` also re-points children's `parent_id`.
- **Income categories have the hierarchy too.** The category form's parent picker offers income
  parents for an income category; the income pickers (create, detail, voice) group children under
  their parent.
- **A drag-and-drop drop sends only `parentId`**, never the whole category, so a colour or icon is
  never overwritten. Refusals mirror `assertValidParent` and live in
  `features/categories/categoryDrop.ts`: a category with subcategories, a drop onto a subcategory,
  expense onto income (or the reverse), and the deposit category on either side.
- **Analytics roll-up never changes totals.** Top-level amounts sum to the input total; uncategorised
  spend and spend on an unknown or deleted parent stay top-level; a parent with no own spend gets no
  "(no subcategory)" slice. This holds for a malformed tree too: `buildParentOf` returns a parent only
  when it is live, top-level and not the row itself, and `rollUpCategoryTotals` itself ignores a
  self-parent or a parent that is not top-level — otherwise that spend would silently vanish.
- **Drag hit-testing re-measures rows after every tree change, never trusts `onLayout` alone.**
  react-native-web implements `onLayout` with a ResizeObserver, so it fires on a size change only; a
  re-parented row that merely moved kept its old top, and the next drag of it hit-tested from where
  it used to be (fixed 2026-10-27, `rowLayoutsFromWindow`).
- **A mouse drag must not open the edit form.** On web a row's `onPress` is the browser's native
  `click`, which still fires after a drag released over the lifted row (it follows the pointer).
  `createClickGuard` swallows that one click and resets on the next tick.

## Known gaps

- Semantic overlap (a subcategory-like proposal such as "bread" when no subcategory exists, or a
  synonym such as "beer" beside "alcohol") is enforced by the classifier prompt alone; the validator catches only
  equality and translations.
- No auto-scroll at the screen edges while dragging a category; the user drags within the visible
  list.
- The drag gesture layer (`CategoryDragList.tsx`) has no automated test — the repo has no renderer.
  Only the pure drop rules are covered.
- `resolveExpenseCategoryId` applies the equivalence check on the expense name-fallback path too, so
  an offline-created category that is a translation of an existing one (e.g. "Продукты" beside
  "Groceries") lands in the existing category instead of becoming a second one.
- No in-app "merge categories" feature; the affected account was cleaned up by a one-off script.
- Product rules are still keyed on the printed line and miss on respelled prints.

## History

[ABA-696](https://github.com/micode-ai/ai-budget-assistant/issues/729) — the feature · 2026-10-26 design spec.
[ABA-699](https://github.com/micode-ai/ai-budget-assistant/issues/732) — analytics drill-down, income hierarchy, drag and drop · 2026-10-27 follow-ups spec.
