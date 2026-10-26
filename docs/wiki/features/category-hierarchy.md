# Category hierarchy

*Hub: [api](../api.md) · [mobile-app](../mobile-app.md) · related:
[budgets](budgets.md), [receipt-category-split](receipt-category-split.md)*

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
- **Expense categories only in the UI.** `parentId` is accepted for income categories by the API,
  but no income parent picker or grouping exists.

## Known gaps

- Semantic overlap (a subcategory-like proposal such as "bread" when no subcategory exists, or a
  synonym such as "beer" beside "alcohol") is enforced by the classifier prompt alone; the validator catches only
  equality and translations.
- The analytics by-category donut does not roll up; only budgets do (the category form's
  `parentHint` says so).
- `resolveExpenseCategoryId` applies the equivalence check on the expense name-fallback path too, so
  an offline-created category that is a translation of an existing one (e.g. "Продукты" beside
  "Groceries") lands in the existing category instead of becoming a second one.
- No in-app "merge categories" feature; the affected account was cleaned up by a one-off script.
- Income categories have no hierarchy UI.
- Product rules are still keyed on the printed line and miss on respelled prints.

## History

[ABA-696](https://github.com/micode-ai/ai-budget-assistant/issues/729) — the feature · 2026-10-26 design spec.
