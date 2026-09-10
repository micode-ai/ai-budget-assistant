# Budgets Count Category Splits — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A budget on a category that a receipt only reaches through a split must count that money, and a budget on the receipt's own category must stop absorbing the rest of the receipt.

**Architecture:** One pure attribution rule — splits decide when present, the expense's own category takes the whole amount when absent — applied at the four places that compute budget spend. The rule already exists as `attributeToCategories`; it moves to `common/utils/`, gains a set-scoped sum, and gets a `packages/shared-utils` mirror for the mobile client. Budgets **with** category allocations switch from `aggregate` to a single `findMany` and attribute in JS; budgets **without** allocations keep the existing cheap `aggregate`, because by the Σ invariant attribution would return the identical number.

**Tech Stack:** NestJS 10 + Prisma 5 (API), Jest, Zustand (mobile), TypeScript workspace packages.

**Spec:** `docs/superpowers/specs/2026-09-10-budget-split-attribution-design.md`

## Global Constraints

- **No migration.** Every input already exists in the database.
- **`apps/api/src` must never runtime-import `@budget/shared-utils`.** The API has no build step for workspace packages; a runtime import crash-loops prod with `ERR_UNSUPPORTED_DIR_IMPORT`. Enforced by `scripts/check-no-shared-utils-runtime-import.sh` in the deploy workflow. `import type` is allowed, and `*.spec.ts` / `*.test.ts` are explicitly excluded by that guard — which is what makes the parity test in Task 2 legal.
- **The duplicated pair must stay identical.** Canonical `apps/api/src/common/utils/category-attribution.ts`, mirror `packages/shared-utils/src/formatting/category-attribution.ts`. Same case table on both sides. Precedent: `financial-month.ts`, `wallet-currencies.ts`, `budget-projection.ts`.
- **No FX anywhere in budgets.** A split has no currency of its own; the `budget.currencyCode` filter stays at the expense level.
- **Soft-deleted splits never count.**
- **Σ invariant:** the live splits of an expense sum to its amount. Attribution can therefore never total more than the expense.
- **Every line number below is as of the pre-implementation file.** Adding imports shifts them. Where a step gives both a line range and a textual anchor ("from `const whereExpenses: any = {` down to …"), the anchor governs.

---

### Task 1: The pure rule — move it, widen it, add the set-scoped sum

`attributeToCategories` already encodes the rule and its own doc comment calls itself "the one place the rule lives". A second implementation would recreate the drift it exists to prevent, so budgets build on it. It moves to `common/utils/` because two modules now consume it and that is where this repo keeps shared pure logic (`budget-projection.ts`, `expense-filters.ts`, `fx.ts`).

**Files:**
- Create: `apps/api/src/common/utils/category-attribution.ts` (moved from `apps/api/src/modules/ai/utils/category-attribution.ts`)
- Delete: `apps/api/src/modules/ai/utils/category-attribution.ts`
- Modify: `apps/api/src/modules/ai/services/ai-tools.service.ts:18`
- Test: `apps/api/src/common/utils/category-attribution.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `interface AttributableExpense { amount: unknown; categoryId?: string | null; category?: { id?: string; name?: string } | null; categorySplits?: SplitLike[] | null; splits?: SplitLike[] | null }`
  - `interface SplitLike { categoryId?: string | null; amount: unknown; isDeleted?: boolean; category?: { id?: string; name?: string } | null }`
  - `interface CategoryAttribution { categoryId?: string; categoryName: string; amount: number }`
  - `function attributeToCategories(expense: AttributableExpense): CategoryAttribution[]`
  - `function attributableAmountForCategories(expense: AttributableExpense, categoryIds: ReadonlySet<string>): number`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/common/utils/category-attribution.spec.ts`:

```ts
import {
  attributeToCategories,
  attributableAmountForCategories,
} from './category-attribution';

const GROCERIES = 'cat-groceries';
const HOUSEHOLD = 'cat-household';
const DEPOSIT = 'cat-deposit';

/** The receipt from the report: 240 split 180 / 35 / 25. */
const splitReceipt = {
  amount: 240,
  categoryId: GROCERIES,
  categorySplits: [
    { categoryId: GROCERIES, amount: 180 },
    { categoryId: HOUSEHOLD, amount: 35 },
    { categoryId: DEPOSIT, amount: 25 },
  ],
};

const plainExpense = { amount: 240, categoryId: GROCERIES };

describe('attributeToCategories', () => {
  it('prefers the scalar categoryId over the category relation', () => {
    const parts = attributeToCategories({ amount: 10, categoryId: 'scalar', category: { id: 'relation' } });
    expect(parts).toEqual([{ categoryId: 'scalar', categoryName: 'Uncategorized', amount: 10 }]);
  });

  it('still reads the relation when no scalar is present', () => {
    const parts = attributeToCategories({ amount: 10, category: { id: 'relation', name: 'Food' } });
    expect(parts).toEqual([{ categoryId: 'relation', categoryName: 'Food', amount: 10 }]);
  });

  it('ignores soft-deleted splits', () => {
    const parts = attributeToCategories({
      amount: 100,
      categoryId: GROCERIES,
      categorySplits: [
        { categoryId: GROCERIES, amount: 100 },
        { categoryId: HOUSEHOLD, amount: 40, isDeleted: true },
      ],
    });
    expect(parts).toEqual([{ categoryId: GROCERIES, categoryName: 'Uncategorized', amount: 100 }]);
  });

  it('falls back to the own category when every split is soft-deleted', () => {
    const parts = attributeToCategories({
      amount: 100,
      categoryId: GROCERIES,
      categorySplits: [{ categoryId: HOUSEHOLD, amount: 100, isDeleted: true }],
    });
    expect(parts).toEqual([{ categoryId: GROCERIES, categoryName: 'Uncategorized', amount: 100 }]);
  });

  it('accepts the mobile field name `splits` as well as `categorySplits`', () => {
    const parts = attributeToCategories({
      amount: 240,
      categoryId: GROCERIES,
      splits: [
        { categoryId: GROCERIES, amount: 180 },
        { categoryId: HOUSEHOLD, amount: 60 },
      ],
    });
    expect(parts.map((p) => p.amount)).toEqual([180, 60]);
  });
});

describe('attributableAmountForCategories', () => {
  it('gives a split-only category its share — the reported bug', () => {
    expect(attributableAmountForCategories(splitReceipt, new Set([HOUSEHOLD]))).toBe(35);
  });

  it('gives the deposit category its share and nothing else', () => {
    expect(attributableAmountForCategories(splitReceipt, new Set([DEPOSIT]))).toBe(25);
  });

  it('stops the own category absorbing the whole receipt — the mirror bug', () => {
    expect(attributableAmountForCategories(splitReceipt, new Set([GROCERIES]))).toBe(180);
  });

  it('sums to the receipt when the set covers every split', () => {
    const all = new Set([GROCERIES, HOUSEHOLD, DEPOSIT]);
    expect(attributableAmountForCategories(splitReceipt, all)).toBe(240);
  });

  it('gives an unsplit expense its whole amount when its own category matches', () => {
    expect(attributableAmountForCategories(plainExpense, new Set([GROCERIES]))).toBe(240);
  });

  it('gives zero when an unsplit expense belongs to another category', () => {
    expect(attributableAmountForCategories(plainExpense, new Set([HOUSEHOLD]))).toBe(0);
  });

  it('gives zero for an empty set rather than the whole amount', () => {
    expect(attributableAmountForCategories(splitReceipt, new Set())).toBe(0);
  });

  it('treats a non-numeric amount as zero rather than NaN', () => {
    const broken = { amount: 'not a number', categoryId: GROCERIES };
    expect(attributableAmountForCategories(broken, new Set([GROCERIES]))).toBe(0);
  });

  it('ignores a split with no category id', () => {
    const orphan = {
      amount: 100,
      categoryId: GROCERIES,
      categorySplits: [
        { categoryId: GROCERIES, amount: 60 },
        { categoryId: null, amount: 40 },
      ],
    };
    expect(attributableAmountForCategories(orphan, new Set([GROCERIES]))).toBe(60);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd apps/api && npx jest src/common/utils/category-attribution.spec.ts`
Expected: FAIL — `Cannot find module './category-attribution'`.

- [ ] **Step 3: Create the moved and widened file**

Create `apps/api/src/common/utils/category-attribution.ts` with the file below. Two changes from the original beyond the move: the scalar `categoryId` and the mobile `splits` alias are accepted, soft-deleted splits are dropped, and the closing "do not wire this into them" paragraph is replaced.

```ts
/**
 * Which categories an expense contributes to, and how much to each.
 *
 * A receipt scanned into several categories keeps ONE `categoryId` of its own
 * and carries the real breakdown in `expense_category_splits`. Any surface that
 * answers "how much did I spend on X" must read that breakdown, or a category
 * that exists only as a split — deposits, alcohol, household — reads as zero
 * while the Analytics tab shows a number for the same period. That
 * contradiction is what this exists to prevent: it is the one place the rule
 * lives, shared by `get_expenses`, `get_category_breakdown` and every budget
 * surface so they cannot drift apart.
 *
 * The rule is single and deliberate: when an expense has live splits, the
 * SPLITS decide and its own `categoryId` is ignored; when it has none, its own
 * category takes the whole amount. It mirrors `analytics.service.ts:225`.
 *
 * Budgets read this too, as of
 * `docs/superpowers/specs/2026-09-10-budget-split-attribution-design.md`, which
 * supersedes ABA-398's locked decision 1. Keep this file in step with its
 * mirror at `packages/shared-utils/src/formatting/category-attribution.ts` —
 * the mobile client computes budget progress locally and must reach the same
 * number as the server.
 */

export interface AttributableSplit {
  categoryId?: string | null;
  amount: unknown;
  /** Absent on already-filtered Prisma includes; present on mobile rows. */
  isDeleted?: boolean;
  category?: { id?: string; name?: string } | null;
}

export interface AttributableExpense {
  amount: unknown;
  /**
   * The scalar FK, preferred over `category.id`. Budgets need only the id and
   * have no reason to join the category table for it.
   */
  categoryId?: string | null;
  category?: { id?: string; name?: string } | null;
  /** Prisma's relation name. */
  categorySplits?: AttributableSplit[] | null;
  /** The mobile entity's field name for the same thing. */
  splits?: AttributableSplit[] | null;
}

export interface CategoryAttribution {
  categoryId?: string;
  categoryName: string;
  /** In the expense's OWN currency — conversion is the caller's job. */
  amount: number;
}

function liveSplits(expense: AttributableExpense): AttributableSplit[] {
  const raw = expense.categorySplits ?? expense.splits;
  if (!Array.isArray(raw)) return [];
  return raw.filter((split) => split.isDeleted !== true);
}

export function attributeToCategories(expense: AttributableExpense): CategoryAttribution[] {
  const splits = liveSplits(expense);

  if (splits.length > 0) {
    return splits.map((split) => ({
      categoryId: split.categoryId ?? split.category?.id,
      categoryName: split.category?.name || 'Uncategorized',
      amount: Number(split.amount) || 0,
    }));
  }

  return [
    {
      categoryId: expense.categoryId ?? expense.category?.id,
      categoryName: expense.category?.name || 'Uncategorized',
      amount: Number(expense.amount) || 0,
    },
  ];
}

/**
 * How much of one expense belongs to a given set of categories.
 *
 * This is what a category-scoped budget spends against. An empty set returns 0
 * rather than the whole amount: a budget with no allocations is not
 * category-scoped at all and must not reach this function — its caller keeps
 * the cheaper unfiltered aggregate.
 */
export function attributableAmountForCategories(
  expense: AttributableExpense,
  categoryIds: ReadonlySet<string>,
): number {
  if (categoryIds.size === 0) return 0;

  let total = 0;
  for (const part of attributeToCategories(expense)) {
    if (part.categoryId && categoryIds.has(part.categoryId)) total += part.amount;
  }
  return total;
}
```

- [ ] **Step 4: Delete the old file and repoint its one consumer**

```bash
rm apps/api/src/modules/ai/utils/category-attribution.ts
```

In `apps/api/src/modules/ai/services/ai-tools.service.ts`, replace line 18:

```ts
import { attributeToCategories } from '../utils/category-attribution';
```

with:

```ts
import { attributeToCategories } from '../../../common/utils/category-attribution';
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `cd apps/api && npx jest src/common/utils/category-attribution.spec.ts`
Expected: PASS, 15 tests.

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors. (This is what proves the move left no dangling import.)

Run: `cd apps/api && npx jest src/modules/ai`
Expected: PASS — the AI tools' own suites still green, because the widened type is additive and the existing callers already filter deleted splits.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/common/utils/category-attribution.ts apps/api/src/common/utils/category-attribution.spec.ts apps/api/src/modules/ai/services/ai-tools.service.ts
git rm --cached apps/api/src/modules/ai/utils/category-attribution.ts 2>/dev/null || true
git add -A apps/api/src/modules/ai/utils
git commit -m "Move category attribution to common/utils and add a set-scoped sum"
```

---

### Task 2: The shared-utils mirror, pinned by a parity test

The mobile client computes budget progress locally, so it needs the same rule. It cannot import from `apps/api`, and the API cannot import `@budget/shared-utils` at runtime, so this is the repo's standing duplicated-pair convention. The pair's known failure mode is silent drift, so a test compares them directly.

**Files:**
- Create: `packages/shared-utils/src/formatting/category-attribution.ts`
- Modify: `packages/shared-utils/src/formatting/index.ts`
- Test: `apps/api/src/common/utils/category-attribution.spec.ts` (append a parity block)

**Interfaces:**
- Consumes: Task 1's `AttributableExpense`, `CategoryAttribution`, `attributeToCategories`, `attributableAmountForCategories`.
- Produces: the same four names, exported from `@budget/shared-utils`.

- [ ] **Step 1: Write the failing parity test**

Append to `apps/api/src/common/utils/category-attribution.spec.ts`:

```ts
// The API and the mobile client each own a copy of this rule — the API has no
// build step and cannot runtime-import @budget/shared-utils (see
// scripts/check-no-shared-utils-runtime-import.sh, which excludes *.spec.ts,
// which is why this import is legal here and nowhere else in apps/api).
// Silent drift between the two is the known failure mode of that convention,
// and it would show up as the phone and the server disagreeing about one
// budget. A test catches it; review does not.
import {
  attributeToCategories as mirrorAttribute,
  attributableAmountForCategories as mirrorAmount,
} from '@budget/shared-utils';

describe('API copy and shared-utils mirror agree', () => {
  const cases: Array<{ name: string; expense: any; set: string[] }> = [
    { name: 'split receipt, split-only category', expense: splitReceipt, set: [HOUSEHOLD] },
    { name: 'split receipt, own category', expense: splitReceipt, set: [GROCERIES] },
    { name: 'split receipt, deposit category', expense: splitReceipt, set: [DEPOSIT] },
    { name: 'split receipt, every category', expense: splitReceipt, set: [GROCERIES, HOUSEHOLD, DEPOSIT] },
    { name: 'unsplit expense, matching category', expense: plainExpense, set: [GROCERIES] },
    { name: 'unsplit expense, other category', expense: plainExpense, set: [HOUSEHOLD] },
    { name: 'empty set', expense: splitReceipt, set: [] },
    {
      name: 'soft-deleted split',
      expense: {
        amount: 100,
        categoryId: GROCERIES,
        categorySplits: [
          { categoryId: GROCERIES, amount: 100 },
          { categoryId: HOUSEHOLD, amount: 40, isDeleted: true },
        ],
      },
      set: [HOUSEHOLD],
    },
    {
      name: 'mobile `splits` field name',
      expense: {
        amount: 240,
        categoryId: GROCERIES,
        splits: [
          { categoryId: GROCERIES, amount: 180 },
          { categoryId: HOUSEHOLD, amount: 60 },
        ],
      },
      set: [HOUSEHOLD],
    },
    { name: 'non-numeric amount', expense: { amount: 'x', categoryId: GROCERIES }, set: [GROCERIES] },
  ];

  it.each(cases)('$name', ({ expense, set }) => {
    const ids = new Set(set);
    expect(mirrorAmount(expense, ids)).toBe(attributableAmountForCategories(expense, ids));
    expect(mirrorAttribute(expense)).toEqual(attributeToCategories(expense));
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd apps/api && npx jest src/common/utils/category-attribution.spec.ts`
Expected: FAIL — `attributableAmountForCategories` is not exported from `@budget/shared-utils`.

- [ ] **Step 3: Create the mirror**

Create `packages/shared-utils/src/formatting/category-attribution.ts` as a byte-identical copy of `apps/api/src/common/utils/category-attribution.ts` from Task 1 Step 3, with only the header paragraph swapped for:

```ts
/**
 * Which categories an expense contributes to, and how much to each.
 *
 * MIRROR of `apps/api/src/common/utils/category-attribution.ts`. The API has no
 * build step for workspace packages and must not runtime-import this package
 * (`scripts/check-no-shared-utils-runtime-import.sh`), so the rule is
 * deliberately duplicated rather than shared. Same convention and same reason
 * as `financial-month.ts`, `wallet-currencies.ts` and `budget-projection.ts`.
 * Change one, change the other — the parity test in
 * `apps/api/src/common/utils/category-attribution.spec.ts` fails otherwise.
 *
 * The rule: when an expense has live splits, the SPLITS decide and its own
 * `categoryId` is ignored; when it has none, its own category takes the whole
 * amount. Consumed here by `budgetStore.getBudgetProgress`, which computes
 * every budget number the user sees on screen.
 */
```

Everything below that comment — the two interfaces, `CategoryAttribution`, `liveSplits`, `attributeToCategories` and `attributableAmountForCategories` — is copied unchanged.

- [ ] **Step 4: Export it from the formatting barrel**

In `packages/shared-utils/src/formatting/index.ts`, after the existing `receipt-category-split` export block, add:

```ts
// Category attribution — which categories an expense's money belongs to
export {
  attributeToCategories,
  attributableAmountForCategories,
  type AttributableExpense,
  type AttributableSplit,
  type CategoryAttribution,
} from './category-attribution';
```

- [ ] **Step 5: Run the tests**

Run: `cd apps/api && npx jest src/common/utils/category-attribution.spec.ts`
Expected: PASS — 15 own tests plus 10 parity cases.

Run: `cd apps/api && bash ../../scripts/check-no-shared-utils-runtime-import.sh`
Expected: `OK: no runtime @budget/shared-utils imports in apps/api.` — proving the spec-file import did not trip the deploy guard.

- [ ] **Step 6: Commit**

```bash
git add packages/shared-utils/src/formatting/category-attribution.ts packages/shared-utils/src/formatting/index.ts apps/api/src/common/utils/category-attribution.spec.ts
git commit -m "Mirror category attribution into shared-utils, pinned by a parity test"
```

---

### Task 3: `getProgress` attributes splits

The biggest of the four call sites: `spent`, the daily totals feeding the projection, and `categoryBreakdown` all have to move together, or the breakdown rows stop summing to `spent`.

Note the query-count change: a category-scoped budget goes from three queries (`aggregate` + `groupBy(date)` + `groupBy(categoryId)`) to one `findMany`. An overall budget is untouched and keeps its two.

**Files:**
- Modify: `apps/api/src/modules/budgets/budgets.service.ts` (imports; `getProgress`, currently lines 323-445)
- Test: `apps/api/src/modules/budgets/budgets.service.spec.ts`

**Interfaces:**
- Consumes: `attributeToCategories` from `../../common/utils/category-attribution` (Task 1).
- Produces: no signature change. `getProgress(accountId, id, anchorDay)` returns the same shape.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/modules/budgets/budgets.service.spec.ts`:

```ts
/**
 * A budget on a category a receipt only reaches through a split used to read
 * zero, while a budget on the receipt's own category absorbed the whole
 * receipt. Both are the same defect: budgets scoped spend by
 * `expense.categoryId` and never read `expense_category_splits`.
 * See docs/superpowers/specs/2026-09-10-budget-split-attribution-design.md.
 */
describe('BudgetsService.getProgress — category budgets count splits', () => {
  const GROCERIES = 'cat-groceries';
  const HOUSEHOLD = 'cat-household';
  const DEPOSIT = 'cat-deposit';

  function makeService(prisma: any) {
    const gamification: any = { checkAchievements: jest.fn().mockResolvedValue(undefined) };
    const cache: any = { delByPrefix: jest.fn().mockResolvedValue(undefined) };
    return new BudgetsService(prisma, gamification, cache);
  }

  /** The reported receipt: 240 PLN split 180 groceries / 35 household / 25 deposit. */
  const splitReceiptRow = {
    amount: 240,
    date: new Date('2026-09-08T00:00:00Z'),
    categoryId: GROCERIES,
    categorySplits: [
      { categoryId: GROCERIES, amount: 180 },
      { categoryId: HOUSEHOLD, amount: 35 },
      { categoryId: DEPOSIT, amount: 25 },
    ],
  };

  function prismaFor(allocations: Array<{ categoryId: string; amount: number }>, rows: any[]) {
    return {
      budget: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'b1',
          amount: 1000,
          currencyCode: 'PLN',
          period: 'monthly',
          startDate: new Date('2026-09-01T00:00:00Z'),
          endDate: null,
          categoryAllocations: allocations.map((a) => ({ ...a, category: { name: a.categoryId } })),
          isActive: true,
          isDeleted: false,
        }),
      },
      expense: {
        findMany: jest.fn().mockResolvedValue(rows),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    } as any;
  }

  it('gives a split-only category its share instead of zero', async () => {
    const prisma = prismaFor([{ categoryId: HOUSEHOLD, amount: 1000 }], [splitReceiptRow]);

    const progress = await makeService(prisma).getProgress('acc-1', 'b1');

    expect(progress.spent).toBe(35);
  });

  it('stops the receipt’s own category absorbing the whole receipt', async () => {
    const prisma = prismaFor([{ categoryId: GROCERIES, amount: 1000 }], [splitReceiptRow]);

    const progress = await makeService(prisma).getProgress('acc-1', 'b1');

    expect(progress.spent).toBe(180);
  });

  it('still gives an unsplit expense its whole amount', async () => {
    const plain = { amount: 90, date: new Date('2026-09-03T00:00:00Z'), categoryId: GROCERIES, categorySplits: [] };
    const prisma = prismaFor([{ categoryId: GROCERIES, amount: 1000 }], [plain]);

    const progress = await makeService(prisma).getProgress('acc-1', 'b1');

    expect(progress.spent).toBe(90);
  });

  it('breaks the total down per allocation, and the rows sum to it', async () => {
    const prisma = prismaFor(
      [
        { categoryId: GROCERIES, amount: 500 },
        { categoryId: HOUSEHOLD, amount: 500 },
      ],
      [splitReceiptRow],
    );

    const progress = await makeService(prisma).getProgress('acc-1', 'b1');

    const byId = new Map(progress.categoryBreakdown!.map((c: any) => [c.categoryId, c.spent]));
    expect(byId.get(GROCERIES)).toBe(180);
    expect(byId.get(HOUSEHOLD)).toBe(35);
    expect(progress.spent).toBe(215);
    expect([...byId.values()].reduce((a, b) => a + b, 0)).toBe(progress.spent);
  });

  it('asks for expenses whose own category OR a split matches', async () => {
    // Filtering on categoryId alone in SQL is the bug: an expense whose own
    // category is not in the budget can still hold a split into it.
    const prisma = prismaFor([{ categoryId: HOUSEHOLD, amount: 1000 }], [splitReceiptRow]);

    await makeService(prisma).getProgress('acc-1', 'b1');

    const where = prisma.expense.findMany.mock.calls[0][0].where;
    expect(where.categoryId).toBeUndefined();
    expect(where.OR).toEqual([
      { categoryId: { in: [HOUSEHOLD] } },
      { categorySplits: { some: { isDeleted: false, categoryId: { in: [HOUSEHOLD] } } } },
    ]);
  });

  it('excludes split receivables and planned expenses, like the cron and the phone already do', async () => {
    const prisma = prismaFor([{ categoryId: GROCERIES, amount: 1000 }], []);

    await makeService(prisma).getProgress('acc-1', 'b1');

    const where = prisma.expense.findMany.mock.calls[0][0].where;
    expect(where.isSplitReceivable).toBe(false);
    expect(where.isPlanned).toBe(false);
  });

  it('keeps the cheap aggregate for a budget with no category allocations', async () => {
    // Splits sum to the expense amount, so attribution would return the same
    // number. Loading rows for it would be pure cost.
    const prisma = prismaFor([], []);
    prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 240 } });

    const progress = await makeService(prisma).getProgress('acc-1', 'b1');

    expect(progress.spent).toBe(240);
    expect(prisma.expense.findMany).not.toHaveBeenCalled();
    expect(prisma.expense.aggregate).toHaveBeenCalled();
  });

  it('feeds the projection attributed money, one total per day', async () => {
    const rows = [
      splitReceiptRow,
      { ...splitReceiptRow, date: new Date('2026-09-09T00:00:00Z') },
    ];
    const prisma = prismaFor([{ categoryId: HOUSEHOLD, amount: 1000 }], rows);

    const progress = await makeService(prisma).getProgress('acc-1', 'b1');

    // 35 on each of two days, not 240 on each.
    expect(progress.spent).toBe(70);
    expect(progress.dailyBurnRate).toBeLessThanOrEqual(35);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd apps/api && npx jest src/modules/budgets/budgets.service.spec.ts -t "count splits"`
Expected: FAIL — the service still calls `aggregate` with a `categoryId` filter, so `spent` comes back 0 and `findMany` is never called.

- [ ] **Step 3: Add the import**

In `apps/api/src/modules/budgets/budgets.service.ts`, after the existing `budget-projection` import:

```ts
import { attributeToCategories } from '../../common/utils/category-attribution';
import { EXCLUDE_SPLIT_RECEIVABLE } from '../../common/utils/expense-filters';
```

- [ ] **Step 4: Rewrite the spend computation in `getProgress`**

Replace everything from `const whereExpenses: any = {` down to and including the `const dailyTotals = ...` line (currently lines 337-377) with:

```ts
    const whereExpenses: any = {
      accountId,
      isDeleted: false,
      // A planned expense from an approved purchase request has not happened,
      // and a receipt-split receivable is not spend. The alert cron and the
      // mobile store already exclude both; this method did not, so the server
      // and the phone disagreed for anyone who splits bills.
      isPlanned: false,
      ...EXCLUDE_SPLIT_RECEIVABLE,
      currencyCode: budget.currencyCode,
      date: {
        gte: periodStart,
        lte: periodEnd,
      },
    };

    // A budget with no allocations covers everything, and the live splits of an
    // expense sum to its amount, so attribution would return the identical
    // number — keep the cheap aggregate. Only category-scoped budgets need the
    // rows, because an expense whose OWN category is outside the budget can
    // still hold a split into it.
    const categorySet = categoryIds ? new Set<string>(categoryIds) : null;

    let spentAmount: number;
    let dailyTotals: number[];
    let spendingMap: Map<string, number> | null = null;

    if (!categorySet) {
      const spent = await this.prisma.expense.aggregate({
        where: whereExpenses,
        _sum: { amount: true },
      });
      spentAmount = Number(spent._sum?.amount || 0);

      // One row per day that had spending. Needed because the projection's rate
      // must be able to drop the largest DAY, which a single SUM cannot express.
      const dailyGroups = await this.prisma.expense.groupBy({
        by: ['date'],
        where: whereExpenses,
        _sum: { amount: true },
      });
      dailyTotals = dailyGroups.map((g) => Number(g._sum?.amount || 0));
    } else {
      whereExpenses.OR = [
        { categoryId: { in: categoryIds } },
        { categorySplits: { some: { isDeleted: false, categoryId: { in: categoryIds } } } },
      ];

      const rows = await this.prisma.expense.findMany({
        where: whereExpenses,
        select: {
          amount: true,
          date: true,
          categoryId: true,
          categorySplits: {
            where: { isDeleted: false },
            select: { categoryId: true, amount: true },
          },
        },
      });

      spendingMap = new Map<string, number>();
      const perDay = new Map<string, number>();
      spentAmount = 0;

      for (const row of rows) {
        let rowTotal = 0;
        for (const part of attributeToCategories(row)) {
          if (!part.categoryId || !categorySet.has(part.categoryId)) continue;
          rowTotal += part.amount;
          spendingMap.set(part.categoryId, (spendingMap.get(part.categoryId) ?? 0) + part.amount);
        }
        if (rowTotal === 0) continue;
        spentAmount += rowTotal;
        // `date` is @db.Date, so Prisma hands back midnight UTC and this key is
        // stable. Grouping the ATTRIBUTED money, not the row amount: a rate
        // built on money the budget does not own is wrong in exactly the cases
        // this fixes.
        const dayKey = row.date.toISOString().slice(0, 10);
        perDay.set(dayKey, (perDay.get(dayKey) ?? 0) + rowTotal);
      }

      dailyTotals = [...perDay.values()];
    }
```

- [ ] **Step 5: Point `categoryBreakdown` at the attributed map**

Replace the `if (hasMultiCategory) { ... }` block that builds `categoryBreakdown` (currently lines 407-431) with:

```ts
    let categoryBreakdown: any[] | undefined;
    if (hasMultiCategory) {
      // `spendingMap` is always populated when `hasMultiCategory` — both are
      // driven by the same `allocations.length > 0`.
      const spending = spendingMap ?? new Map<string, number>();

      categoryBreakdown = allocations.map((alloc: any) => {
        const catSpent = spending.get(alloc.categoryId) || 0;
        const catAllocated = Number(alloc.amount);
        return {
          categoryId: alloc.categoryId,
          categoryName: alloc.category?.name || 'Unknown',
          categoryColor: alloc.category?.color,
          allocated: catAllocated,
          spent: catSpent,
          remaining: Math.max(0, catAllocated - catSpent),
          percentageUsed: catAllocated > 0 ? (catSpent / catAllocated) * 100 : 0,
          isOverBudget: catSpent > catAllocated,
        };
      });
    }
```

- [ ] **Step 6: Run the tests**

Run: `cd apps/api && npx jest src/modules/budgets/budgets.service.spec.ts`
Expected: PASS — the eight new tests plus every pre-existing one, including the three ABA-523 projection tests, which use a budget with `categoryAllocations: []` and so keep the aggregate path.

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/budgets/budgets.service.ts apps/api/src/modules/budgets/budgets.service.spec.ts
git commit -m "getProgress attributes category splits, and excludes planned and receivable rows"
```

---

### Task 4: `getHistory` attributes splits

Same rule, one number per period. Without it, the budget-detail screen's history chart would contradict the progress bar directly above it.

**Files:**
- Modify: `apps/api/src/modules/budgets/budgets.service.ts` (`getHistory`, currently lines 236-305)
- Test: `apps/api/src/modules/budgets/budgets.service.spec.ts`

**Interfaces:**
- Consumes: `attributeToCategories`, `EXCLUDE_SPLIT_RECEIVABLE` (imported in Task 3).
- Produces: no signature change.

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/modules/budgets/budgets.service.spec.ts`:

```ts
describe('BudgetsService.getHistory — periods count splits too', () => {
  const HOUSEHOLD = 'cat-household';

  function makeService(prisma: any) {
    const gamification: any = { checkAchievements: jest.fn().mockResolvedValue(undefined) };
    const cache: any = { delByPrefix: jest.fn().mockResolvedValue(undefined) };
    return new BudgetsService(prisma, gamification, cache);
  }

  it('reports a split-only category’s share in each period', async () => {
    const prisma: any = {
      budget: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'b1',
          amount: 1000,
          currencyCode: 'PLN',
          period: 'monthly',
          startDate: new Date('2026-01-01T00:00:00Z'),
          endDate: null,
          categoryAllocations: [{ categoryId: HOUSEHOLD, amount: 1000, category: { name: 'Household' } }],
          isActive: true,
          isDeleted: false,
        }),
      },
      expense: {
        findMany: jest.fn().mockResolvedValue([
          {
            amount: 240,
            date: new Date('2026-09-08T00:00:00Z'),
            categoryId: 'cat-groceries',
            categorySplits: [
              { categoryId: 'cat-groceries', amount: 205 },
              { categoryId: HOUSEHOLD, amount: 35 },
            ],
          },
        ]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
    };

    const history = await makeService(prisma).getHistory('acc-1', 'b1', 2);

    expect(history).toHaveLength(2);
    expect(history.every((p: any) => p.actual === 35)).toBe(true);
    expect(prisma.expense.aggregate).not.toHaveBeenCalled();
  });

  it('keeps the aggregate for a budget with no allocations', async () => {
    const prisma: any = {
      budget: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'b1',
          amount: 1000,
          currencyCode: 'PLN',
          period: 'monthly',
          startDate: new Date('2026-01-01T00:00:00Z'),
          endDate: null,
          categoryAllocations: [],
          isActive: true,
          isDeleted: false,
        }),
      },
      expense: {
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 120 } }),
      },
    };

    const history = await makeService(prisma).getHistory('acc-1', 'b1', 1);

    expect(history[0].actual).toBe(120);
    expect(prisma.expense.findMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd apps/api && npx jest src/modules/budgets/budgets.service.spec.ts -t "periods count splits"`
Expected: FAIL — `actual` is 0 and `aggregate` was called.

- [ ] **Step 3: Rewrite the per-period query**

In `getHistory`, add the set once, above the `for` loop, right after `categoryIds` is computed:

```ts
    const categorySet = categoryIds ? new Set<string>(categoryIds) : null;
```

Then replace the `whereExpenses` construction and the `aggregate` call inside the loop (currently lines 278-295) with:

```ts
      const whereExpenses: any = {
        accountId,
        isDeleted: false,
        // Same two exclusions as getProgress — a history chart that counts a
        // different set of rows than the progress bar above it is worse than
        // no chart.
        isPlanned: false,
        ...EXCLUDE_SPLIT_RECEIVABLE,
        currencyCode: budget.currencyCode,
        date: { gte: periodStart, lte: periodEnd },
      };

      let actual: number;

      if (!categorySet) {
        const spent = await this.prisma.expense.aggregate({
          where: whereExpenses,
          _sum: { amount: true },
        });
        actual = Number(spent._sum?.amount || 0);
      } else {
        whereExpenses.OR = [
          { categoryId: { in: categoryIds } },
          { categorySplits: { some: { isDeleted: false, categoryId: { in: categoryIds } } } },
        ];

        const rows = await this.prisma.expense.findMany({
          where: whereExpenses,
          select: {
            amount: true,
            categoryId: true,
            categorySplits: {
              where: { isDeleted: false },
              select: { categoryId: true, amount: true },
            },
          },
        });

        actual = 0;
        for (const row of rows) {
          for (const part of attributeToCategories(row)) {
            if (part.categoryId && categorySet.has(part.categoryId)) actual += part.amount;
          }
        }
      }

      const limit = Number(budget.amount);
```

Delete the now-duplicated `const actual = Number(spent._sum?.amount || 0);` and `const limit = Number(budget.amount);` lines that followed the old aggregate.

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && npx jest src/modules/budgets/budgets.service.spec.ts`
Expected: PASS — including the existing anchored-history contiguity tests, whose budget has no allocations and so keeps the aggregate path.

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/budgets/budgets.service.ts apps/api/src/modules/budgets/budgets.service.spec.ts
git commit -m "getHistory attributes category splits"
```

---

### Task 5: The alert cron attributes splits

Both halves: the overall threshold check and the per-category one. This is the task that will send real pushes to real users on the first run after deploy — see the plan's Rollout note at the end.

**Files:**
- Modify: `apps/api/src/modules/budgets/budget-alert.service.ts` (`checkBudgetThresholds` lines 42-72; `checkCategoryThresholds` lines 156-182)
- Test: `apps/api/src/modules/budgets/budget-alert.service.spec.ts`

**Interfaces:**
- Consumes: `attributeToCategories` from `../../common/utils/category-attribution`.
- Produces: no signature change.

- [ ] **Step 1: Migrate the seven existing tests off `groupBy`**

**This step is not optional and the plan's earlier tasks have no equivalent.** Every existing category-threshold test drives spend through `mockPrisma.expense.groupBy`, which this task stops calling. Left alone, all seven go green-to-red for the wrong reason.

In `apps/api/src/modules/budgets/budget-alert.service.spec.ts`, add `findMany` to the mock at line 8:

```ts
  expense: { aggregate: jest.fn(), groupBy: jest.fn(), findMany: jest.fn() },
```

Add a default to `beforeEach`, beside the existing `groupBy` default:

```ts
    mockPrisma.expense.findMany.mockResolvedValue([]);
```

Then rewrite each test's spend stub. The mechanical translation is one row per category:

```ts
// before
mockPrisma.expense.groupBy.mockResolvedValue([
  { categoryId: 'cat-1', _sum: { amount: 55 } },
]);

// after
mockPrisma.expense.findMany.mockResolvedValue([
  { amount: 55, categoryId: 'cat-1', categorySplits: [] },
]);
```

**Watch the overall loop while doing this.** `makeBudget()` has one allocation, so after this task `checkBudgetThresholds` reads `findMany` too — the same rows now feed both the overall check and the per-category check, where before the overall check read `aggregate` and was pinned at 0. `makeBudget()`'s overall amount is 200, so a category row of 55 is 27.5% overall and 85 is 42.5%, both under the 50% threshold and therefore still silent. If any test's rows sum to 100 or more, the overall loop will start firing and its assertions must be scoped with the existing `.filter((c) => c[3]?.categoryId)` idiom rather than counting all `sendToUser` calls.

- [ ] **Step 2: Write the failing tests**

Append to the same file, reusing the module-level `mockPrisma` / `mockNotifications` / `makeBudget` already defined at the top:

```ts
/**
 * A budget on a category a receipt only reaches through a split used to read
 * zero, and one on the receipt's own category absorbed the whole receipt.
 * See docs/superpowers/specs/2026-09-10-budget-split-attribution-design.md.
 */
describe('BudgetAlertService — thresholds count category splits', () => {
  let service: BudgetAlertService;

  const HOUSEHOLD = 'cat-household';
  const GROCERIES = 'cat-groceries';

  /** The reported receipt: 240, of which only 35 is household. */
  const splitRow = {
    amount: 240,
    categoryId: GROCERIES,
    categorySplits: [
      { categoryId: GROCERIES, amount: 205 },
      { categoryId: HOUSEHOLD, amount: 35 },
    ],
  };

  const householdBudget = (allocated: number, overall: number) =>
    makeBudget({
      amount: overall,
      categoryAllocations: [
        { categoryId: HOUSEHOLD, amount: allocated, isDeleted: false, category: { id: HOUSEHOLD, name: 'Household' } },
      ],
    });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    mockPrisma.expense.groupBy.mockResolvedValue([]);
    mockPrisma.expense.findMany.mockResolvedValue([splitRow]);
    mockPrisma.budgetAlert.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.budgetAlert.update.mockResolvedValue({});
    mockNotifications.sendToUser.mockResolvedValue(true);
    mockPrisma.budgetAlert.findFirst.mockImplementation(async (args: any) =>
      args?.orderBy ? { id: 'alert-id', notificationSent: false } : null,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BudgetAlertService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();
    service = module.get<BudgetAlertService>(BudgetAlertService);
  });

  it('fires for a split-only category that is over its allocation', async () => {
    // 35 attributed against a 30 allocation. This budget used to read 0 and
    // never alert at all — the reported bug, at the notification layer.
    mockPrisma.budget.findMany.mockResolvedValue([householdBudget(30, 1000)]);

    await service.checkBudgetsForAccount('acc-1', 'PLN');

    const categoryCalls = mockNotifications.sendToUser.mock.calls.filter(
      (c: any[]) => c[3]?.categoryId === HOUSEHOLD,
    );
    expect(categoryCalls.length).toBeGreaterThan(0);
  });

  it('measures on the attributed share, not the whole receipt', async () => {
    // 35 of a 100 allocation is 35% — under every threshold. The whole 240
    // would be 240% and fire all three.
    mockPrisma.budget.findMany.mockResolvedValue([householdBudget(100, 1000)]);

    await service.checkBudgetsForAccount('acc-1', 'PLN');

    const categoryCalls = mockNotifications.sendToUser.mock.calls.filter(
      (c: any[]) => c[3]?.categoryId === HOUSEHOLD,
    );
    expect(categoryCalls).toHaveLength(0);
  });

  it('asks for expenses whose own category OR a split matches', async () => {
    mockPrisma.budget.findMany.mockResolvedValue([householdBudget(100, 1000)]);

    await service.checkBudgetsForAccount('acc-1', 'PLN');

    const where = mockPrisma.expense.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { categoryId: { in: [HOUSEHOLD] } },
      { categorySplits: { some: { isDeleted: false, categoryId: { in: [HOUSEHOLD] } } } },
    ]);
    expect(where.isPlanned).toBe(false);
    expect(where.isSplitReceivable).toBe(false);
  });

  it('measures the overall threshold on the attributed share too', async () => {
    // Overall allocation-scoped spend is 35, not 240. Against a 100 overall
    // amount that is 35% and silent; the unattributed 240 would be 240%.
    mockPrisma.budget.findMany.mockResolvedValue([householdBudget(1000, 100)]);

    await service.checkBudgetsForAccount('acc-1', 'PLN');

    const overallCalls = mockNotifications.sendToUser.mock.calls.filter(
      (c: any[]) => !c[3]?.categoryId,
    );
    expect(overallCalls).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `cd apps/api && npx jest src/modules/budgets/budget-alert.service.spec.ts -t "count category splits"`
Expected: FAIL — the service calls `aggregate`/`groupBy`, so `prisma.expense.findMany` is never called and the attributed number is never computed.

- [ ] **Step 4: Add the import**

In `apps/api/src/modules/budgets/budget-alert.service.ts`, beside the existing `EXCLUDE_SPLIT_RECEIVABLE` import:

```ts
import { attributeToCategories } from '../../common/utils/category-attribution';
```

- [ ] **Step 5: Rewrite the overall spend query**

In `checkBudgetThresholds`, add `isPlanned: false` to `whereExpenses` and replace the allocation filter plus the `aggregate` (currently lines 61-72) with:

```ts
    // Multi-category support. An expense whose OWN category is outside the
    // budget can still hold a split into it, so the category filter cannot
    // live in SQL alone — see
    // docs/superpowers/specs/2026-09-10-budget-split-attribution-design.md.
    const allocations = budget.categoryAllocations || [];
    const categoryIds: string[] | null =
      allocations.length > 0 ? allocations.map((a: any) => a.categoryId) : null;
    const categorySet = categoryIds ? new Set<string>(categoryIds) : null;

    let spent: number;

    if (!categorySet) {
      const result = await this.prisma.expense.aggregate({
        where: whereExpenses,
        _sum: { amount: true },
      });
      spent = Number(result._sum?.amount || 0);
    } else {
      whereExpenses.OR = [
        { categoryId: { in: categoryIds } },
        { categorySplits: { some: { isDeleted: false, categoryId: { in: categoryIds } } } },
      ];

      const rows = await this.prisma.expense.findMany({
        where: whereExpenses,
        select: {
          amount: true,
          categoryId: true,
          categorySplits: {
            where: { isDeleted: false },
            select: { categoryId: true, amount: true },
          },
        },
      });

      spent = 0;
      for (const row of rows) {
        for (const part of attributeToCategories(row)) {
          if (part.categoryId && categorySet.has(part.categoryId)) spent += part.amount;
        }
      }
    }
```

- [ ] **Step 6: Rewrite the per-category spend query**

In `checkCategoryThresholds`, replace the `groupBy` and the `spentMap` it builds (currently lines 167-183) with:

```ts
    const categorySet = new Set<string>(allocationCategoryIds);

    const rows = await this.prisma.expense.findMany({
      where: {
        accountId,
        date: { gte: periodStart, lte: periodEnd },
        isDeleted: false,
        isPlanned: false,
        ...EXCLUDE_SPLIT_RECEIVABLE,
        currencyCode: budget.currencyCode,
        OR: [
          { categoryId: { in: allocationCategoryIds } },
          { categorySplits: { some: { isDeleted: false, categoryId: { in: allocationCategoryIds } } } },
        ],
      },
      select: {
        amount: true,
        categoryId: true,
        categorySplits: {
          where: { isDeleted: false },
          select: { categoryId: true, amount: true },
        },
      },
    });

    const spentMap = new Map<string, number>();
    for (const row of rows) {
      for (const part of attributeToCategories(row)) {
        if (!part.categoryId || !categorySet.has(part.categoryId)) continue;
        spentMap.set(part.categoryId, (spentMap.get(part.categoryId) ?? 0) + part.amount);
      }
    }
```

- [ ] **Step 7: Run the tests**

Run: `cd apps/api && npx jest src/modules/budgets`
Expected: PASS — the four new tests, the seven pre-existing alert tests **as migrated in Step 1**, and everything from Tasks 3 and 4. If a pre-existing test still fails here, its stub is still on `groupBy`; go back to Step 1 rather than weakening the assertion.

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/budgets/budget-alert.service.ts apps/api/src/modules/budgets/budget-alert.service.spec.ts
git commit -m "Budget threshold alerts attribute category splits"
```

---

### Task 6: The mobile store attributes splits

Every budget number the user sees on screen — the budgets list, budget detail, the dashboard's monthly card, the desktop attention panel — comes from this one function. The API is not consulted for any of them.

`budgetStore` reaches into four other stores through `.getState()`, so testing this arithmetic through the store would be mostly mock scaffolding. Extract it instead, the way this repo already handles screen arithmetic (`src/features/dashboard/monthlyBudgetSegments.ts`, `src/features/expenses/desktopTable.ts`, `src/features/wallet/transferBalances.ts`): a pure function with a real test, and a store that calls it.

**Files:**
- Create: `apps/mobile/src/features/budgets/budgetAttribution.ts`
- Create: `apps/mobile/src/features/budgets/__tests__/budgetAttribution.test.ts`
- Modify: `apps/mobile/src/stores/budgetStore.ts` (`getBudgetProgress`, currently lines 477-590)

**Interfaces:**
- Consumes: `attributeToCategories` from `@budget/shared-utils` (Task 2).
- Produces:
  - `interface BudgetAttributableExpense { id: string; date: Date | string; amount: number; categoryId?: string | null; splits?: Array<{ categoryId: string; amount: number; isDeleted?: boolean }> }`
  - `interface BudgetSpendAttribution { spent: number; byCategory: Map<string, number>; byDay: Map<string, number> }`
  - `function attributeBudgetSpend(expenses: readonly BudgetAttributableExpense[], categoryIds: ReadonlySet<string> | null): BudgetSpendAttribution`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/features/budgets/__tests__/budgetAttribution.test.ts`:

```ts
import { attributeBudgetSpend } from '../budgetAttribution';

const GROCERIES = 'cat-groceries';
const HOUSEHOLD = 'cat-household';
const DEPOSIT = 'cat-deposit';

/**
 * The mobile Expense entity names the relation `splits`, not `categorySplits`
 * (packages/shared-types/src/entities/expense.ts). A silent mismatch there
 * would make every phone budget read as unsplit, so it is pinned here.
 */
const splitReceipt = {
  id: 'e1',
  date: '2026-09-08T00:00:00.000Z',
  amount: 240,
  categoryId: GROCERIES,
  splits: [
    { categoryId: GROCERIES, amount: 180, isDeleted: false },
    { categoryId: HOUSEHOLD, amount: 35, isDeleted: false },
    { categoryId: DEPOSIT, amount: 25, isDeleted: false },
  ],
};

const plain = { id: 'e2', date: '2026-09-09T00:00:00.000Z', amount: 90, categoryId: GROCERIES };

describe('attributeBudgetSpend', () => {
  it('gives a split-only category its share — the reported bug', () => {
    expect(attributeBudgetSpend([splitReceipt], new Set([HOUSEHOLD])).spent).toBe(35);
  });

  it('stops the own category absorbing the whole receipt', () => {
    expect(attributeBudgetSpend([splitReceipt], new Set([GROCERIES])).spent).toBe(180);
  });

  it('breaks the total down per category, and the parts sum to the whole', () => {
    const result = attributeBudgetSpend([splitReceipt], new Set([GROCERIES, HOUSEHOLD]));
    expect(result.byCategory.get(GROCERIES)).toBe(180);
    expect(result.byCategory.get(HOUSEHOLD)).toBe(35);
    expect(result.spent).toBe(215);
    expect([...result.byCategory.values()].reduce((a, b) => a + b, 0)).toBe(result.spent);
  });

  it('gives an unsplit expense its whole amount', () => {
    expect(attributeBudgetSpend([plain], new Set([GROCERIES])).spent).toBe(90);
  });

  it('gives an unsplit expense in another category nothing', () => {
    expect(attributeBudgetSpend([plain], new Set([HOUSEHOLD])).spent).toBe(0);
  });

  it('ignores a soft-deleted split, which the local table keeps as a tombstone', () => {
    const withTombstone = {
      ...splitReceipt,
      splits: [
        { categoryId: GROCERIES, amount: 240, isDeleted: false },
        { categoryId: HOUSEHOLD, amount: 35, isDeleted: true },
      ],
    };
    expect(attributeBudgetSpend([withTombstone], new Set([HOUSEHOLD])).spent).toBe(0);
  });

  it('counts every expense whole for an overall budget (null set)', () => {
    const result = attributeBudgetSpend([splitReceipt, plain], null);
    expect(result.spent).toBe(330);
    expect(result.byCategory.size).toBe(0);
  });

  it('totals one entry per calendar day, from the attributed money', () => {
    // Two receipts, one day apart. The household budget sees 35 on each day,
    // not 240 — which is the money the projection used to extrapolate from.
    const second = { ...splitReceipt, id: 'e3', date: '2026-09-09T00:00:00.000Z' };
    const result = attributeBudgetSpend([splitReceipt, second], new Set([HOUSEHOLD]));
    expect([...result.byDay.values()]).toEqual([35, 35]);
  });

  it('leaves a day out entirely when nothing on it belongs to the budget', () => {
    const result = attributeBudgetSpend([splitReceipt, plain], new Set([HOUSEHOLD]));
    expect(result.byDay.size).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd apps/mobile && npx jest src/features/budgets/__tests__/budgetAttribution.test.ts`
Expected: FAIL — `Cannot find module '../budgetAttribution'`.

- [ ] **Step 3: Write the pure helper**

Create `apps/mobile/src/features/budgets/budgetAttribution.ts`:

```ts
import { attributeToCategories } from '@budget/shared-utils';

/**
 * How much of a period's expenses belongs to one budget, split-aware.
 *
 * An expense whose OWN category is outside the budget can still hold a split
 * into it, and one whose own category is inside can hold most of its money
 * elsewhere. Filtering the list by `categoryId` — what `getBudgetProgress` did
 * before — gets both wrong, in opposite directions. See
 * docs/superpowers/specs/2026-09-10-budget-split-attribution-design.md.
 *
 * Lives here rather than in the store because the store reaches into four
 * other stores through `.getState()`, and this arithmetic deserves a test that
 * is not mostly mock scaffolding.
 */

export interface BudgetAttributableExpense {
  id: string;
  date: Date | string;
  amount: number;
  categoryId?: string | null;
  splits?: Array<{ categoryId: string; amount: number; isDeleted?: boolean }>;
}

export interface BudgetSpendAttribution {
  /** Total attributable to the budget. */
  spent: number;
  /** categoryId -> attributed amount. Empty for an overall budget. */
  byCategory: Map<string, number>;
  /** Day key -> attributed amount, for the projection's rate. */
  byDay: Map<string, number>;
}

/**
 * @param categoryIds the budget's allocated categories, or `null` for an
 *   overall budget, which covers everything and needs no attribution at all —
 *   the live splits of an expense sum to its amount.
 */
export function attributeBudgetSpend(
  expenses: readonly BudgetAttributableExpense[],
  categoryIds: ReadonlySet<string> | null,
): BudgetSpendAttribution {
  const byCategory = new Map<string, number>();
  const byDay = new Map<string, number>();
  let spent = 0;

  for (const expense of expenses) {
    let attributed = 0;

    if (!categoryIds) {
      attributed = expense.amount;
    } else {
      for (const part of attributeToCategories(expense)) {
        if (!part.categoryId || !categoryIds.has(part.categoryId)) continue;
        attributed += part.amount;
        byCategory.set(part.categoryId, (byCategory.get(part.categoryId) ?? 0) + part.amount);
      }
    }

    if (attributed === 0) continue;
    spent += attributed;
    // The same key the store used before, so the projection's day bucketing is
    // unchanged — only the money in each bucket is now the budget's own share.
    const dayKey = new Date(expense.date).toDateString();
    byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + attributed);
  }

  return { spent, byCategory, byDay };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd apps/mobile && npx jest src/features/budgets/__tests__/budgetAttribution.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Call it from the store**

In `apps/mobile/src/stores/budgetStore.ts`, add the import beside the other `@/` imports:

```ts
import { attributeBudgetSpend } from '@/features/budgets/budgetAttribution';
```

Replace the `if (hasMultiCategory) { ... }` category filter and the `spent` reduce (currently lines 503-507) with:

```ts
      const categorySet = hasMultiCategory
        ? new Set(allocations.map((a) => a.categoryId))
        : null;

      const attribution = attributeBudgetSpend(periodExpenses, categorySet);
      const spent = attribution.spent;
```

- [ ] **Step 6: Feed the projection and the breakdown from the same attribution**

Delete the `perDay` map and the loop that fills it (currently lines 524-528, including their comment), and change the `projectBudgetSpend` call's `dailyTotals` argument to:

```ts
        dailyTotals: [...attribution.byDay.values()],
```

Then inside the `categoryBreakdown` map, delete the `const catExpenses = periodExpenses.filter(...)` line and replace the `catSpent` line with:

```ts
          const catSpent = attribution.byCategory.get(alloc.categoryId) ?? 0;
```

Keep the `const cat = categoriesState.categories.find(...)` line that follows.

- [ ] **Step 7: Exclude planned expenses on web**

On native, `loadAllExpenses` filters planned rows out in SQL. On web there is no SQLite and the in-memory list comes straight from the server, which does not filter them. Add the guard so both platforms count the same set — change line 481 to:

```ts
      const expenses = filterConsumption(useExpenseStore.getState().expenses).filter(
        // `isPlanned` is filtered in SQL by loadAllExpenses on native, but the
        // web build has no SQLite and takes this list from the server pull.
        (e) => !e.isDeleted && !e.isPlanned,
      );
```

- [ ] **Step 8: Run the tests and the typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors. If `periodExpenses` does not satisfy `BudgetAttributableExpense`, the mismatch is real — check that the mobile `Expense` entity still carries `splits`, rather than widening the parameter type to silence it.

Run: `cd apps/mobile && npx jest`
Expected: PASS — the whole mobile suite, confirming no consumer of `getBudgetProgress` broke.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/src/features/budgets/budgetAttribution.ts apps/mobile/src/features/budgets/__tests__/budgetAttribution.test.ts apps/mobile/src/stores/budgetStore.ts
git commit -m "Mobile budget progress attributes category splits"
```

---

### Task 7: Documentation and the ABA issue

Four documents make claims this change falsifies. Leaving any of them is how the next person re-derives the locked decision and reverts the fix.

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-08-12-receipt-category-autosplit-design.md`
- Modify: `user_docs/<lang>/` budget section, all nine languages
- Regenerate: `apps/mobile/src/help/content.ts`

- [ ] **Step 1: Correct the four CLAUDE.md claims**

1. In the ABA-398 entry, replace the sentence beginning "**Budgets are deliberately untouched**" with a statement that budgets now attribute splits, naming the new spec and the four call sites.
2. Retitle the "**Category questions are split-aware, budget questions are not (ABA-446)**" entry to "**Category and budget questions are both split-aware (ABA-446, ABA-{N})**", update its path from `modules/ai/utils/category-attribution.ts` to `common/utils/category-attribution.ts`, note the shared-utils mirror, and delete the sentence "**Budgets, `get_budget_status` and Safe-to-Spend stay split-blind on purpose** (ABA-398 design spec, locked decision 1) — do not wire this into them." in favour of the new rule.
3. Correct the false claim that `SafeToSpendService` is split-blind: it reads neither budgets nor categories.
4. Remove "category budgets counting splits fractionally" from the ABA-398 deferred list, and note the two divergences fixed alongside it (`EXCLUDE_SPLIT_RECEIVABLE`, `isPlanned`).

- [ ] **Step 2: Mark the superseded decision**

In `docs/superpowers/specs/2026-08-12-receipt-category-autosplit-design.md`, under "Locked decisions", append to decision 1:

```markdown
   **Superseded 2026-09-10** by
   `docs/superpowers/specs/2026-09-10-budget-split-attribution-design.md`. The
   stated rationale — consistency with manual splits — turned out to argue the
   other way: manual splits share the table and the defect, so making budgets
   split-aware removes the inconsistency rather than creating one.
```

- [ ] **Step 3: Update the user documentation**

Extend the existing budget section in `user_docs/<lang>/` for all nine languages (en, pl, de, es, fr, ru, ua, be, nl) with a short paragraph: a scanned receipt split across categories now counts toward each of those categories' budgets in proportion, so a budget on a category that only appears inside receipts finally tracks, and a groceries budget no longer counts the household items and the deposit from the same receipt. Do NOT add a new section id — this extends an existing one, so no registration in `scripts/generate-help-content.js`, `src/help/sections.ts` or `build_help.py` is needed.

- [ ] **Step 4: Regenerate the help content and the web help**

```bash
npm run generate:help
python docs/marketing/help/build_help.py
```

- [ ] **Step 5: Verify the whole suite**

```bash
cd apps/api && npx jest && npx tsc --noEmit
cd ../mobile && npx jest && npx tsc --noEmit
cd ../.. && bash scripts/check-no-shared-utils-runtime-import.sh
```
Expected: all green.

- [ ] **Step 6: Create the ABA issue and commit**

Invoke the `finish-aba-task` skill. It creates the `ABA-{N}` GitHub issue (N from the highest ABA number in issue **titles** with `--state all`, plus recent commits) and confirms the CLAUDE.md and `user_docs/` updates above.

```bash
git add -A
git commit -m "ABA-{N} Budgets count category splits"
```

---

## Rollout note for whoever merges this

On the first cron run after deploy, budgets on split-only categories acquire non-zero spend. `BudgetAlert` dedup is keyed `(budgetId, categoryId, thresholdPercentage, periodStart)` and the loop sends one push per un-alerted crossed threshold, so a single budget can emit two or three pushes at once. This was accepted during design: the affected population is small and the information is correct and until now withheld. If it turns out worse than expected, the fallback is a data migration pre-inserting `notificationSent: true` rows for the current period.

Native screens keep the old numbers until the next store release, so a native user can receive a push about a budget their app still shows at 0%. Also accepted.

Budgets whose spend now drops send nothing — a decrease crosses no threshold.
