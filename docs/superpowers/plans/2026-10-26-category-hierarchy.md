# Category Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Category.parentId` a real two-level hierarchy — budgets roll a parent up with its children and show a per-child breakdown, automatic category creation never duplicates an existing category, the receipt classifier sees the tree — then clean up the affected account.

**Architecture:** A pure tree util (duplicated pair: API `common/utils` + `shared-utils` mirror) expands a budget's allocated ids with their children and rolls per-category spend back up to each allocation; the existing `attributeToCategories` is untouched. A pure equivalence util decides whether a candidate name duplicates an existing category (normalized equality or the same default-category slot in any of the nine locales) and is called from every automatic creation path. The classifier prompt lists categories as `Parent > Child`. No schema migration — `parent_id` already exists in Postgres and mobile SQLite.

**Tech Stack:** NestJS 10 + Prisma 5 (jest specs beside sources), Expo 54 / React Native (jest-expo, `__tests__` dirs), Zustand, `packages/shared-utils`, `packages/shared-types`.

**Spec:** `docs/superpowers/specs/2026-10-26-category-hierarchy-design.md`

## Global Constraints

- Two levels only: a parent must be top-level (`parentId == null`), same `accountId`, same `type`; a category that has live children cannot itself get a parent; the deposit category (`isDepositCategoryName`) is never a parent or a child.
- Tree and attribution utils are duplicated pairs — canonical `apps/api/src/common/utils/…`, mirror `packages/shared-utils/src/formatting/…`. Never import a runtime value from `@budget/shared-utils` in `apps/api` (deploy guard `scripts/check-no-shared-utils-runtime-import.sh`).
- Server (`budgets.service.ts`, `budget-alert.service.ts`) and phone (`stores/budgetProgress.ts`) must produce identical numbers for the same data.
- Every expense amount is counted once in a budget's overall `spent`; a child's money appears in both lines only when the parent AND the child are each allocated.
- The roll-up uses the CURRENT tree for every period (history and alerts included).
- No substring/contains matching in the duplicate check.
- Explicit user creation (settings screen, chat `create_category`, bots' create-category step) keeps today's exact-name check only; only AUTOMATIC paths use the equivalence check.
- Hierarchy UI is for expense categories only.
- Every UI change ships phone and desktop web (≥1024) in the same task; all new strings in all nine locales (`en de es fr pl ru ua be nl`).
- A bottom-anchored `Modal` adds `insets.bottom` (CLAUDE.md, ABA-483).
- One commit per task locally; the whole task is squashed into one `ABA-{N}` commit before any push, and nothing is pushed without the user's OK.

## Review Focus

1. **A child re-parented mid-month under an allocated parent** — the parent line's `spent` and the budget total both rise by the child's money, and nothing is counted twice. Test: `rollUpAllocationSpend` "child moved under allocated parent" (Task 1) and `getProgress` "unallocated child of allocated parent counts in total once" (Task 3).
2. **Parent and child both allocated** — the child line shows its money, the parent line shows parent+child, overall `spent` counts the money once. Test in Task 1 and Task 4.
3. **A soft-deleted child** — its money no longer rolls into the parent and it is absent from the breakdown. Test: `expandAllocatedCategoryIds` ignores `isDeleted` children (Task 1).
4. **The model returns a child's name that collides with a top-level name in another type** — assignments match within expense categories only. Covered by passing only `type: 'expense'` rows (Task 6 test "assigns a child by its own name").
5. **Clearing a parent** (`parentId: null` in PATCH) actually un-nests, on server and phone. Test: categories.service "update with parentId null clears it" (Task 2) and `categoryStoreUpdate` "sends parentId null" (Task 7).

---

### Task 1: Category tree util (API + shared-utils mirror)

**Files:**
- Create: `apps/api/src/common/utils/category-tree.ts`
- Create: `apps/api/src/common/utils/category-tree.spec.ts`
- Create: `packages/shared-utils/src/formatting/category-tree.ts` (byte-identical body, header comment points at its twin)
- Modify: `packages/shared-utils/src/formatting/index.ts` (export the three functions and types)
- Create: `apps/mobile/src/features/budgets/__tests__/categoryTreeParity.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface TreeCategory { id: string; parentId?: string | null; isDeleted?: boolean; name?: string }
  export function expandAllocatedCategoryIds(allocatedIds: Iterable<string>, categories: readonly TreeCategory[]): Set<string>
  export interface AllocationRollUp { spent: number; ownSpent: number; children: Array<{ categoryId: string; spent: number }> }
  export function rollUpAllocationSpend(byCategory: ReadonlyMap<string, number>, allocatedIds: Iterable<string>, categories: readonly TreeCategory[]): Map<string, AllocationRollUp>
  export function sortCategoriesAsTree<T extends TreeCategory>(categories: readonly T[]): Array<{ category: T; depth: 0 | 1 }>
  ```

- [ ] **Step 1: Write the failing tests** in `category-tree.spec.ts`:
  - `expandAllocatedCategoryIds(['P'], [{id:'P'},{id:'C1',parentId:'P'},{id:'C2',parentId:'P',isDeleted:true},{id:'X'}])` → `Set{'P','C1'}`.
  - an allocated child id stays in the set even when its parent is not allocated.
  - `rollUpAllocationSpend(Map{P:10,C1:5,C3:2}, ['P'], [P, C1→P, C3→P])` → `P: {spent:17, ownSpent:10, children:[{C1,5},{C3,2}]}` with children sorted by `spent` desc.
  - both allocated: `rollUpAllocationSpend(Map{P:10,C1:5}, ['P','C1'], …)` → `P.spent 15`, `C1.spent 5, ownSpent 5, children []`.
  - "child moved under allocated parent": same byCategory, tree changed → parent total includes the child.
  - children with `spent === 0` are omitted from `children`.
  - `sortCategoriesAsTree` puts each live child directly after its parent with `depth: 1`, keeps the input order of top-levels, and returns an orphan (parent missing or deleted) as `depth: 0`.
- [ ] **Step 2: Run** `cd apps/api && npx jest src/common/utils/category-tree.spec.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the three functions in `apps/api/src/common/utils/category-tree.ts`. Only one level of children is followed (two-level invariant); nothing recurses.
- [ ] **Step 4: Run** the spec again — Expected: PASS.
- [ ] **Step 5: Copy** the file to `packages/shared-utils/src/formatting/category-tree.ts`, export from `formatting/index.ts`, and write `categoryTreeParity.test.ts` that runs the three main cases above against `@budget/shared-utils`.
- [ ] **Step 6: Run** `cd apps/mobile && npx jest src/features/budgets/__tests__/categoryTreeParity.test.ts` — Expected: PASS.
- [ ] **Step 7: Commit** `feat(categories): category tree util pair`.

### Task 2: Parent validation in the categories API

**Files:**
- Modify: `apps/api/src/modules/categories/dto/index.ts` (`parentId` on `UpdateCategoryDto` accepts `null`: `@ValidateIf((_, v) => v !== null)` before `@IsString()`)
- Modify: `apps/api/src/modules/categories/categories.service.ts` (`create`, `update`)
- Test: `apps/api/src/modules/categories/categories.service.spec.ts`

**Interfaces:**
- Produces: `private async assertValidParent(accountId: string, categoryId: string | null, parentId: string, type: string): Promise<string>` — returns the RESOLVED parent PK (accepts a server id or a `clientId`, the resolved-PK rule from `docs/wiki/features/client-id-resolution.md`); throws `BadRequestException` with message `'Invalid parent category'` otherwise.

- [ ] **Step 1: Write failing tests**: create with a valid top-level parent stores its resolved PK; rejected when the parent has a parent; when the parent is in another account; when the parent's type differs; when the parent is a deposit category; update rejected when the category being updated has live children and gets a parent; update rejected when `parentId === id`; "update with parentId null clears it" writes `parentId: null`; update without the field leaves it untouched.
- [ ] **Step 2: Run** `cd apps/api && npx jest src/modules/categories` — Expected: the new tests FAIL.
- [ ] **Step 3: Implement** `assertValidParent` and call it from `create` and `update` (and `reuseExisting`'s revive) whenever `dto.parentId` is a non-empty string; pass `null` through on update.
- [ ] **Step 4: Run** the spec — Expected: PASS.
- [ ] **Step 5: Commit** `feat(categories): validate two-level parent`.

### Task 3: Server budgets roll up children

**Files:**
- Modify: `packages/shared-types/src/entities/budget.ts` — add to `BudgetCategoryProgress`: `ownSpent?: number; subcategories?: BudgetSubcategorySpend[]`, and `export interface BudgetSubcategorySpend { categoryId: string; categoryName: string; categoryColor?: string; spent: number }`.
- Modify: `apps/api/src/modules/budgets/budgets.service.ts` (`getProgress` ~L410-530, `getHistory` ~L325-345)
- Modify: `apps/api/src/modules/budgets/budget-alert.service.ts` (`computeCategorySpend` ~L201, `checkCategoryThresholds` ~L243, and the overall check that shares its map)
- Test: `budgets.service.spec.ts`, `budget-alert.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 `expandAllocatedCategoryIds`, `rollUpAllocationSpend` (API copy).
- Produces: `private async loadCategoryTree(accountId: string): Promise<TreeCategory[]>` on `BudgetsService` (expense categories of the account: `id, parentId, isDeleted, name, color`); `budget-alert.service.ts` gets the same rows through one shared helper `loadExpenseCategoryTree(prisma, accountId)` in `apps/api/src/modules/budgets/budget-category-tree.util.ts`, which `BudgetsService` uses too.

- [ ] **Step 1: Write failing tests** in `budgets.service.spec.ts`: allocation on parent P with an expense in child C → `categoryBreakdown[P].spent` includes it, `subcategories` lists C with its name, `ownSpent` is P's own money; "unallocated child of allocated parent counts in total once"; parent and child both allocated → overall `spent` counts the child's money once, both lines show it; `getHistory` actual for a past period includes the child's money. In `budget-alert.service.spec.ts`: a parent allocation crosses 80% through a child's spend → alert row created for the PARENT `categoryId`.
- [ ] **Step 2: Run** `cd apps/api && npx jest src/modules/budgets` — Expected: new tests FAIL.
- [ ] **Step 3: Implement**: in each place a `categorySet` is built from allocation ids, build it with `expandAllocatedCategoryIds` and pass the EXPANDED ids to `categoryOrSplitFilter`; keep the per-row loop (it already counts a row's parts once); build `categoryBreakdown` from `rollUpAllocationSpend(spendingMap, allocIds, tree)`, mapping child ids to names/colors from the tree; alerts read `rollUp.get(allocation.categoryId).spent`.
- [ ] **Step 4: Run** the budgets specs — Expected: PASS. Then `npm run typecheck` at repo root — Expected: no errors.
- [ ] **Step 5: Commit** `feat(budgets): parent allocation counts its subcategories`.

### Task 4: Phone budgets roll up children

**Files:**
- Modify: `apps/mobile/src/stores/budgetProgress.ts` (L53-115)
- Test: `apps/mobile/src/features/budgets/__tests__/budgetAttribution.test.ts` (or a new `budgetProgressTree.test.ts` beside it if the store needs store mocks)

**Interfaces:**
- Consumes: Task 1 functions from `@budget/shared-utils`; Task 3's `BudgetCategoryProgress.ownSpent/subcategories`.

- [ ] **Step 1: Write failing tests** mirroring Task 3's first three cases with the same fixture numbers, asserting the same `spent`, `categoryBreakdown[].spent`, `ownSpent`, `subcategories`.
- [ ] **Step 2: Run** `cd apps/mobile && npx jest src/features/budgets` — Expected: FAIL.
- [ ] **Step 3: Implement**: `categorySet = expandAllocatedCategoryIds(allocIds, useCategoryStore.getState().categories)`; breakdown from `rollUpAllocationSpend(attribution.byCategory, allocIds, categories)`; names via the existing `categoryLabel`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(budgets): phone rolls subcategories into the parent line`.

### Task 5: Category equivalence at every automatic creation path

**Files:**
- Modify: `apps/api/src/modules/accounts/default-categories.ts` — export `defaultCategorySlot(name: string): number | null` (index of the name in ANY locale's list, case-insensitive, trimmed; lists are index-aligned across locales).
- Create: `apps/api/src/common/utils/category-equivalence.ts` + `.spec.ts`
- Modify: `apps/api/src/modules/expenses/expense-category-resolver.util.ts` (before the auto-create, ~L102)
- Modify: `apps/api/src/modules/import-bank/import-bank-category.util.ts` (`preloadCategories`, before `create`)
- Modify: `apps/api/src/modules/ai/services/categorize-bot.service.ts` (`applyStep`, `isNew` branch)
- Test: existing specs of those three files

**Interfaces:**
- Produces:
  ```ts
  export function normalizeCategoryName(name: string): string // trim, collapse spaces, lower-case, NFC
  export function findEquivalentCategory<T extends { id: string; name: string }>(candidate: string, existing: readonly T[]): T | null
  ```
  Equivalent = equal `normalizeCategoryName`, OR both names have the same non-null `defaultCategorySlot`. Never a substring test. Deposit names are equivalent to each other through `isDepositCategoryName`.

- [ ] **Step 1: Write failing tests** (`category-equivalence.spec.ts`): `Zakupy spożywcze` ≡ `Groceries`; `Продукты` ≡ `Groceries`; `Deposit` ≡ `Kaucja`; ` groceries ` ≡ `Groceries`; `Car` vs `Car wash` → null; `Dom` vs `Domestic` → null; `Pieczywo` vs `Groceries` → null (semantic overlap is not this util's job).
- [ ] **Step 2: Run** `cd apps/api && npx jest src/common/utils/category-equivalence.spec.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the util and `defaultCategorySlot`.
- [ ] **Step 4: Write failing tests** in the three callers' specs: resolver given `"Zakupy spożywcze"` on an account holding `Groceries` returns Groceries' id and creates nothing; `preloadCategories` maps the same name to the existing id; `applyStep` with `isNew: true, name: 'Zakupy spożywcze'` bulk-updates to the existing Groceries id and calls no `categoriesService.create`.
- [ ] **Step 5: Implement** in each caller: load the account's live categories of that type, `findEquivalentCategory`, use it if found, else create as before.
- [ ] **Step 6: Run** `cd apps/api && npx jest src/modules/expenses src/modules/import-bank src/modules/ai/services/categorize-bot` — Expected: PASS.
- [ ] **Step 7: Commit** `feat(categories): automatic creation never duplicates a translated or equal name`.

### Task 6: Receipt classifier sees the tree and stops proposing overlaps

**Files:**
- Modify: `apps/api/src/modules/ai/services/receipt-finalizer.service.ts` (~L304 select adds `parentId`; the comment at ~L327 is rewritten to the new rule)
- Modify: `apps/api/src/modules/ai/services/receipt-category-split.service.ts` (`classify` params, `classifyWithModel` prompt L219-246, `validateProposals` L295)
- Test: `receipt-category-split.service.spec.ts`, `receipt-finalizer.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 `sortCategoriesAsTree`, Task 5 `findEquivalentCategory`.
- Produces: `classify({ categories: Array<{ id: string; name: string; parentId?: string | null }> … })` (widened, backward-compatible).

- [ ] **Step 1: Write failing tests**: the prompt's category list renders `Alkohol > Piwo` for a child and plain `Alkohol` for a parent; "assigns a child by its own name" (model answers `Piwo` → the child's id); a proposal named `Zakupy spożywcze` when `Groceries` exists is NOT returned and its lines are assigned to Groceries' id; a proposal named `Pet food` with no equivalent IS returned; the prompt no longer contains "even when a broad category could hold it" wording and does contain an instruction to prefer the most specific listed category (child over parent) and never propose a part, synonym or translation of a listed category.
- [ ] **Step 2: Run** `cd apps/api && npx jest src/modules/ai/services/receipt-category-split src/modules/ai/services/receipt-finalizer` — Expected: FAIL.
- [ ] **Step 3: Implement**: render the list through `sortCategoriesAsTree` as `Parent > Child` lines, keep `buildSplitFormat` fed with the leaf names (unchanged enum of names); in `validateProposals`, replace `taken.has` with `findEquivalentCategory(name, categories)` — when it returns a category, add the proposal's unclaimed lines to the assignments map with that id instead of dropping them (signature gains `assignments: Map<number, string>`); prompt wording replaces the "propose a distinct kind" rule with: assign to the most specific listed category; propose a new category only for a kind of spending no listed category covers; never a part, synonym or translation of a listed category; never a subcategory. Keep the alcohol/tobacco/household/cosmetics/pet/baby separation sentence (those are separate kinds), now ending "…a listed category (or its subcategory) that names its kind".
- [ ] **Step 4: Run** — Expected: PASS, and the whole `src/modules/ai` suite still passes.
- [ ] **Step 5: Commit** `feat(receipts): classifier uses the category tree, never proposes overlaps`.

### Task 7: Parent picker in category settings (phone + desktop) and store/API plumbing

**Files:**
- Modify: `apps/mobile/src/services/categories.api.ts` (create/update payloads carry `parentId?: string | null`)
- Modify: `apps/mobile/src/stores/categoryStore.ts` (`createCategory(name, type, icon?, color?, parentId?)`, `updateCategory(id, data: { name?; color?; icon?; parentId?: string | null })`; local upsert writes `parent_id`)
- Modify: `apps/mobile/src/components/settings/categories/CategoriesSettings.tsx` (rendered by both the phone route and the desktop settings pane — one change covers both)
- Modify: `apps/mobile/src/i18n/locales/{en,de,es,fr,pl,ru,ua,be,nl}.ts`
- Test: `apps/mobile/src/stores/__tests__/categoryStoreUpdate.test.ts`

**Interfaces:**
- Consumes: Task 1 `sortCategoriesAsTree`; Task 2 server validation (surface its 400 as the existing error toast).

- [ ] **Step 1: Write failing tests**: `updateCategory(id, { parentId: 'P' })` sends `parentId: 'P'` and stores it locally; "sends parentId null" clears it locally and remotely.
- [ ] **Step 2: Run** `cd apps/mobile && npx jest src/stores/__tests__/categoryStoreUpdate.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** store + api plumbing.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: UI**: in the create/edit modal of an EXPENSE category add a “Parent category” row (value “None” or the parent's name) opening a list of eligible parents: live top-level expense categories of the account, excluding itself, the deposit category, and hidden entirely when the edited category already has children. The section list renders through `sortCategoriesAsTree`, children indented under their parent. Respect `canEdit`. New keys under `categories.parent`, `categories.parentNone`, `categories.parentHint` in all nine locales.
- [ ] **Step 6: Verify** on web at ≥1024 and at phone width (`npm run dev:web`), and the phone layout on a device/emulator: create child, re-parent, clear parent, try to nest a category that has children (row hidden).
- [ ] **Step 7: Commit** `feat(categories): choose a parent category`.

### Task 8: Budget breakdown under the parent line and grouped pickers (phone + desktop)

**Files:**
- Modify: `apps/mobile/src/components/budgets/BudgetDetailView.tsx` (~L226-300, phone)
- Modify: `apps/mobile/src/components/budgets/desktop/BudgetCard.tsx` (~L106) and the component it passes `categories` to
- Modify (grouping via `sortCategoriesAsTree`, child rows indented): `src/components/expenses/create/ExpenseCreateForm.tsx`, `src/components/expenses/detail/ExpenseDetailsCard.tsx`, `src/components/receipt/ItemCategorySheet.tsx`, `src/components/BudgetCategoryEditor.tsx`, `src/components/expenses/desktop/CreateDialog.tsx`
- Modify: the nine locale files

**Interfaces:**
- Consumes: Task 3/4 `BudgetCategoryProgress.subcategories`, `ownSpent`; Task 1 `sortCategoriesAsTree`.

- [ ] **Step 1: Phone budget line**: under each allocation's sum, when `subcategories.length > 0`, one row per child (name · amount) and a final “without subcategory” row for `ownSpent` when it is > 0. Key `budgetDetail.withoutSubcategory` in nine locales.
- [ ] **Step 2: Desktop budget card**: the same rows inside the card's category block, in the desktop design language.
- [ ] **Step 3: Pickers**: render through `sortCategoriesAsTree`; a child shows indented under its parent; with no children anywhere the order and look are unchanged (verify on an account without children).
- [ ] **Step 4: Verify** a parent-with-children fixture by hand on web (≥1024 and phone width): the parent line shows each child + without-subcategory; totals equal the parent's `spent`.
- [ ] **Step 5: Run** `npm run typecheck && npm run lint` at the root — Expected: clean. Then `cd apps/mobile && npx jest` — Expected: PASS.
- [ ] **Step 6: Commit** `feat(budgets): show subcategory breakdown under a parent line`.

### Task 9: Docs

**Files:**
- Modify: `docs/wiki/features/budgets.md` (roll-up invariant, both-allocated rule, current tree applies to history)
- Modify: `docs/wiki/features/receipt-category-split.md` (tree in prompt, equivalence, rerouted proposals; Known gaps: semantic overlap is model-only)
- Create: `docs/wiki/features/category-hierarchy.md` (two-level invariant, equivalence util and which paths call it, explicit vs automatic creation), linked from `docs/wiki/index.md`
- Modify: `user_docs/<lang>/NN-*.md` covering categories and budgets in all nine locales, then `npm run generate:help`
- Modify: `docs/wiki/log.md`

- [ ] **Step 1:** Write the pages; **Step 2:** `python scripts/wiki-lint.py` — Expected: `no findings`; **Step 3:** `npm run generate:help` — Expected: `content.ts` regenerated; **Step 4:** Commit `docs: category hierarchy`.

### Task 10: Affected account cleanup (production, after deploy)

Operational, not code. The account id, the category mapping and the access details are kept outside
the repository (the controller's private runbook). Writes go to production Postgres in one
transaction; reads through the read-only `prod_query` tool.

- [ ] **Step 1: Dry run (read-only)**, per merged-away category, counts of: expenses (`category_id`), splits, `expense_items.category_id`, product rules, merchant rules, budget allocations — for the merges and re-parents the spec's Goal 5 describes.
- [ ] **Step 2: Wrong rules and lines list**: every product rule whose key does not belong to its category, each with its proposed target category and the `expense_items` it produced, plus the expected month totals of the groceries and alcohol lines after cleanup. **Stop and show both lists to the user; continue only with what they confirm.**
- [ ] **Step 3: Apply** in one transaction: re-point all FKs of merged-away categories (expenses, incomes, splits, `expense_items`, product rules — dropping a rule whose key already exists on the survivor, merchant rules likewise, `budget_categories` — summing amounts if both exist, `budget_alerts`, `user_subscriptions`) to the survivor; soft-delete the merged-away categories; set `parent_id`s; move confirmed wrong lines and rebuild those receipts' `expense_category_splits` from their items so splits sum to the expense amount; delete confirmed wrong rules; bump `updated_at = now()` on every category, expense, split and budget touched (phones pull by `updated_at > since`).
- [ ] **Step 4: Verify** with `prod_query`: the budget's groceries and alcohol lines equal the dry run's expected totals; split sums equal expense amounts for every touched receipt; then on the phone after a sync.
- [ ] **Step 5:** Run the `finish-aba-task` skill (ABA issue, wiki log line, user docs check), squash the task's commits into one `ABA-{N}` commit, and ask the user before pushing.
