# Category hierarchy — design

Date: 2026-10-26 · Status: draft for approval

## Why

On 2026-10-26 the owner of a shared household account opened their monthly category budget and
could not read it. The plan was two lines — groceries and alcohol, each with its own limit — but a
handful of supermarket receipts scanned that afternoon were spread across nine categories:

| What it really is | Where the month's money landed | Counted by a budget line |
|---|---|---|
| Groceries | the default groceries category, its Polish-locale translation, and three categories the classifier had proposed for parts of it (bread, cheese, snacks) | only the default one |
| Ready food | two categories, one per UI language | neither |
| Alcohol | an "alcoholic drinks" category and a "beer" category | only the first |
| Deposit | three deposit categories, one per UI language | none |

A large share of the month's grocery and beer spending missed the category limits that were meant
to hold it.

How it happened (investigated against production data and code):

1. **Categories are flat and the receipt classifier mints new ones.** `ReceiptCategorySplitService`
   (`apps/api/src/modules/ai/services/receipt-category-split.service.ts`) may propose up to three
   new categories per scan (`newCategories`), and a confirmed scan creates them. In two months the
   account gained 19 categories, many of them a *part* of an existing one (bread, cheese, snacks
   next to groceries), a *synonym* (beer next to alcoholic drinks), or a *translation* (the Polish
   groceries default next to the English one; three deposit categories in three languages).
   `validateProposals` only rejects an exact name match, so none of this was stopped.
2. **Synonyms compete, and the loser is chosen at random, then frozen.** The model is offered beer
   and alcoholic drinks as equals. Whichever it picks is learned as a product rule at save time and
   wins every later scan of that exact printed line; a slightly different print of the same product
   misses the rule and is decided afresh.
3. **`Category.parentId` exists but nothing honours it.** It is stored by the API and mirrored in
   mobile SQLite, and a category with children cannot be deleted — but there is no UI to set it,
   budgets ignore it, analytics ignore it, and the classifier sees a flat list.
4. **Some learned rules are simply wrong**: soft drinks and sausage under beer, hygiene products
   under bread.

## What success looks like

- The groceries budget line shows everything bought as food for home, and right under the sum a
  breakdown by subcategory (bread · cheese · snacks · without subcategory). The same for alcohol
  (beer · wine · without subcategory).
- The same product lands in the same place every time.
- New scans never add a category that overlaps an existing one.

## Goals

1. **Two-level hierarchy.** A category is either top-level or a child of a top-level category of
   the same account and type. No grandchildren.
2. **Budgets roll up.** A budget allocation on a parent counts the parent and all its children.
   The budget line shows the parent's total with a per-child breakdown beneath it, plus a
   “without subcategory” row for money attributed to the parent itself.
3. **Classifier respects the tree and never duplicates** (rule agreed with the user, applies to all
   users):
   - It assigns a line to the most specific **existing** category: a subcategory if one fits,
     otherwise the parent (milk → groceries when there is no dairy subcategory).
   - It may still propose a **new top-level** category, but only for a genuinely new kind of
     spending that no existing category covers (e.g. pet food when there is no pets category).
   - It must never propose a synonym, a translation or a part of an existing category — those
     lines go to the existing category (or its subcategory).
   - It **never creates a subcategory**. Subcategories are created only by the user.
4. **The user can build the tree**: choose a parent when creating or editing a category, on phone
   and desktop web. Category pickers show children grouped under their parent.
5. **Clean up the affected account** (one-off, on production): merge the translated and duplicate
   categories into one per concept, put the part-categories under their parent (groceries ⊃ bread,
   cheese, snacks; alcohol ⊃ beer, wine), merge the deposit categories into one, merge the two
   ready-food categories into one top-level category kept separate from groceries, delete the wrong
   product rules, and keep the budget's allocations on the merged parents.
   - **Past receipt lines those wrong rules produced are moved too** (user decision): each wrong
     `expense_items.category_id` is re-pointed to its correct category and the receipt's
     `expense_category_splits` are rebuilt from its items, so the split amounts still sum to the
     expense amount. This is the one exception to “no retroactive re-classification” below.
   - The account-specific mapping is kept outside the repository.

## Non-goals

- More than two levels.
- Separate limits on subcategories (the limit sits on the parent; a child may still be allocated
  on its own if a user explicitly does so — see “left to the builder”).
- A general “merge categories” feature in the app. The account cleanup is a one-off script.
- Retroactive re-classification of old receipts by the model. Old data moves only through the
  merge/re-parent of whole categories in the cleanup.
- Fuzzy matching of product rules (two prints of the same product normalizing to different keys). With the
  tree, a miss now falls back to a model that cannot pick a synonym, which is enough for now.

## Anti-goals (would be a failure even if it “works”)

- A budget figure that changes when the user re-parents a category **without** any new spending
  being hidden or double-counted — every expense amount must be counted once per budget.
- The phone and the server disagreeing on a budget's spent figure (the attribution pair must stay
  in step).
- The classifier creating anything the user then has to clean up.

## Constraints

- `category-attribution.ts` is a deliberately duplicated pair: canonical
  `apps/api/src/common/utils/category-attribution.ts`, mirror
  `packages/shared-utils/src/formatting/category-attribution.ts`. The API cannot import runtime
  values from `@budget/shared-utils`. Change both together.
- Budget progress is computed on the server (`budgets.service.ts`, `budget-alert.service.ts`) and
  locally on the phone (`apps/mobile/src/features/budgets/budgetAttribution.ts`). Both must expand a
  parent allocation to its descendants the same way.
- Offline-first: the phone reads categories (with `parent_id`) from SQLite. A re-parent travels
  through the normal category sync.
- Every new screen element ships on phone and on desktop web (≥1024) in the same task. Category
  settings: `src/components/settings/categories/CategoriesSettings.tsx`; budgets:
  `src/components/budgets/` (phone) and `src/components/budgets/desktop/` (desktop).
- All new strings in the nine locales.
- Product rules are keyed on the printed line and are consulted before the model
  (`docs/wiki/features/receipt-category-split.md`); that stays.

## Decided by the user

- Hierarchy (option A), not a flat list without auto-creation.
- Affected account layout: groceries ⊃ bread/cheese/snacks; alcohol ⊃ beer/wine.
- Under a budget line's sum, show the subcategory breakdown.
- A line with no fitting subcategory goes straight to the parent; subcategories are never
  auto-created.
- Auto-creation of new categories stays for everyone, but never overlapping an existing one.
- The affected account's two ready-food categories merge into one, kept separate from groceries.
- Wrong past receipt lines are moved, not only the rules deleted.

## Decided by the designer (check these)

- **Two levels only**, and only a top-level category can be a parent; the API rejects a parent
  that itself has a parent, a parent from another account, or a parent of a different type.
- **Rolling up is done by expanding the allocation set**: before `attributableAmountForCategories`
  runs, a budget's category-id set is expanded with each allocated parent's live children. The
  attribution function itself is unchanged. If a user allocates both a parent and one of its
  children, the child's money is counted in **both** lines (each line answers its own question),
  but the budget's overall total counts each expense once — as it already does today.
- **Deleting a parent** stays blocked while it has children (current 409 behaviour).
- **Re-parenting a category that is itself a parent** is rejected (would create three levels).
- **Analytics** (by-category donut): out of scope for this change beyond not breaking; a roll-up
  view there is a follow-up.
- **Classifier prompt** shows the tree as `Parent > Child` lines; assignments may name either a
  parent or a child. The prompt's current instruction to propose a distinct kind of spending even
  when a broad category could hold it is reversed for all users: overlap goes to the existing
  category.
- **Overlap check is a shared validator, not a substring match.** One util in
  `apps/api/src/common/utils/` decides whether a candidate name duplicates an existing category:
  normalized equality, and equivalence through the default-category table across **all nine
  locales** (so “Zakupy spożywcze” is a duplicate of “Groceries”, “Deposit” of “Kaucja”). No
  substring/contains matching — short names like “Car” or “Dom” would misfire. Semantic overlap
  (beer vs alcohol, bread vs groceries) is the model's job, instructed by the prompt and the tree.
- **Every automatic creation path uses that validator**: receipt split proposals, the
  categorize-uncategorized pass (`categorize-bot.service.ts`), bank-import AI suggestions
  (`import-bank-category.util.ts`) and `expense-category-resolver.util.ts`. When a candidate is a
  duplicate, the existing category is used instead of creating one. An **explicit** user request
  (chat `create_category`, the bots' “create category” step, the settings screen) is not automatic
  and keeps today's exact-name check only.
- **A rejected receipt proposal** whose duplicate target is known (equality/translation) sends its
  lines to that target; otherwise its lines keep today's fallback (the receipt's dominant group).
- **Re-parenting applies to history.** The roll-up uses the current tree for every period,
  including past months, history and alerts. The anti-goal means no expense counted twice in one
  budget line and none lost — not that past figures are frozen. Keeping the tree per period is out
  of scope.
- **Expense categories only.** `parentId` is accepted for income categories by the API as today,
  but no income UI (parent picker, grouping) is built.
- **The deposit category** stays outside the tree logic (never a parent, never a child).
- **Merged names** on the affected account: the merged parents take the names the user chose; the
  deposit category keeps its existing name.

## Left to the builder

- Exact UI of the parent picker (sheet vs dropdown) and of grouped pickers, within the existing
  design languages (phone and desktop).
- How the subcategory breakdown under a budget line is laid out on phone and desktop.
- Whether the server returns per-child breakdown in the budget response or the client derives it
  from expenses it already has (both clients must show the same numbers).
- The exact rule list deleted in the account cleanup — produce it as a reviewed list before running.
- Tests: attribution expansion (parent, child, both allocated, child moved out), proposal
  validation (synonym/translation/part rejected, new kind accepted), API validation of `parentId`.

## Account cleanup — procedure

1. Read-only dry run on production listing every row that will move: expenses, splits,
   `expense_items.category_id`, product rules, merchant rules, budget allocations, per category —
   plus the list of wrong rules and wrong receipt lines with their proposed target category.
2. Show the lists to the user; only confirmed rules are deleted and only confirmed lines moved.
   The dry run also states the expected month totals of the groceries and alcohol lines after the
   cleanup — those are the figures step 4 checks.
3. Run the merge in one transaction through SSH (`budget-db-prod`), re-pointing all foreign keys of
   the merged-away categories to the survivor before soft-deleting them. Phones pull by
   `updated_at > since` (`sync.service.ts`), not by `sync_version`, so the script bumps
   `updated_at` on every category, expense, split and budget it touches — budget allocations reach
   phones only through their budget's `updated_at`.
4. Verify the budget lines show the month totals predicted by the dry run, on the server and on
   the phone after a sync.
