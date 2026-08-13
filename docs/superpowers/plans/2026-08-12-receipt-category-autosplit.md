# Receipt Category Auto-Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split a scanned receipt across expense categories using its own line items, so a supermarket trip stops being one undifferentiated "Groceries" figure.

**Architecture:** Classification runs server-side inside `OcrService.finalizeReceipt` — the single funnel every scan path already passes through — and rides to all consumers on a new always-present `ReceiptExpense.categorySplits` field, exactly as `priceFindings` does. A per-account rule table answers most lines for free; an LLM answers the rest and its output is written back as rules. The LLM assigns categories to line indexes and never emits money; a pure, unit-tested function does all arithmetic and guarantees the splits sum to the expense amount to the cent.

**Tech Stack:** NestJS 10, Prisma 5 / PostgreSQL, Redis (`CacheService`), OpenAI (cheap model via `resolveCheapModel`), Expo / React Native, SQLite via raw `executeSql`, Zustand, i18next.

**Spec:** `docs/superpowers/specs/2026-08-12-receipt-category-autosplit-design.md`

## Global Constraints

- **Analytics only.** Splits must not affect budgets. Do not modify `budgets.service.ts`, `budget-alert.service.ts`, `SafeToSpendService`, or the `get_budget_status` AI tool. The expense keeps its single `categoryId`.
- **The model never emits money.** The LLM returns `{line, category}` pairs only. Any amount, percentage, or total is computed by our code.
- **Σ split amounts === expense amount, exactly, to the cent.** Analytics substitutes splits for the expense's category but computes the period total from `expense.amount`; a split set that does not sum to the amount makes the breakdown stop adding up to the total and corrupts every percentage.
- **Fail-silent.** Any failure in classification yields `[]` and a `logger.warn`. A receipt scan must never break because categorization failed.
- **No runtime import of `@budget/shared-utils` from `apps/api/src`.** It crash-loops production with `ERR_UNSUPPORTED_DIR_IMPORT` and `scripts/check-no-shared-utils-runtime-import.sh` fails the deploy. `import type` is fine. Shared logic is a duplicated pair (see Tasks 1 and 2).
- **Free, outside the monthly AI quota.** No `@TrackAiUsage`, no `AiUsageGuard` on this path. The ceiling is a per-account daily Redis counter.
- **Forward-only.** No backfill of existing receipts.
- **9 locales**, always all of them: `en, de, es, fr, pl, ru, ua, be, nl`.
- **Tier-2 (fully E2EE) accounts are skipped** before any LLM call.

---

### Task 1: Pure split arithmetic (API canonical copy)

The whole correctness surface of this feature lives here. Written first, tested first, with no Prisma, no I/O, and no `Date.now()`.

**Files:**
- Create: `apps/api/src/common/utils/receipt-category-split.ts`
- Test: `apps/api/src/common/utils/receipt-category-split.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface SplitInputItem { index: number; amount: number; categoryId: string | null; categoryName: string | null }`
  - `interface ReceiptCategorySplit { categoryId: string; categoryName: string; amount: number; percentage: number; itemIndexes: number[] }`
  - `interface ReceiptSplitConfig { tolerancePct: number }`
  - `const RECEIPT_SPLIT_DEFAULTS: ReceiptSplitConfig`
  - `function buildCategorySplits(params: { items: SplitInputItem[]; total: number; config?: ReceiptSplitConfig }): ReceiptCategorySplit[]`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/common/utils/receipt-category-split.spec.ts`:

```ts
import {
  buildCategorySplits,
  RECEIPT_SPLIT_DEFAULTS,
  type SplitInputItem,
} from './receipt-category-split';

const item = (
  index: number,
  amount: number,
  categoryId: string | null,
  categoryName: string | null = categoryId,
): SplitInputItem => ({ index, amount, categoryId, categoryName });

describe('buildCategorySplits', () => {
  it('splits a clean receipt and sums exactly to the total', () => {
    const splits = buildCategorySplits({
      items: [item(0, 180, 'c-food', 'Groceries'), item(1, 35, 'c-home', 'Household'), item(2, 25, 'c-alc', 'Alcohol')],
      total: 240,
    });

    expect(splits.map((s) => [s.categoryId, s.amount])).toEqual([
      ['c-food', 180],
      ['c-home', 35],
      ['c-alc', 25],
    ]);
    expect(splits.reduce((sum, s) => sum + s.amount, 0)).toBe(240);
  });

  it('is sorted by amount descending', () => {
    const splits = buildCategorySplits({
      items: [item(0, 10, 'c-a'), item(1, 90, 'c-b')],
      total: 100,
    });
    expect(splits.map((s) => s.categoryId)).toEqual(['c-b', 'c-a']);
  });

  it('gives the residual from unassigned lines to the largest group', () => {
    // 100 + 40 assigned, 10 unassigned, total 150 → largest group absorbs the 10.
    const splits = buildCategorySplits({
      items: [item(0, 100, 'c-a'), item(1, 40, 'c-b'), item(2, 10, null, null)],
      total: 150,
    });

    expect(splits.find((s) => s.categoryId === 'c-a')!.amount).toBe(110);
    expect(splits.find((s) => s.categoryId === 'c-b')!.amount).toBe(40);
    expect(splits.reduce((sum, s) => sum + s.amount, 0)).toBe(150);
  });

  it('absorbs a negative residual (a discount) into the largest group', () => {
    // 140 of lines against a 135 total is a 3.7% gap — inside the tolerance,
    // so the 5 comes off the largest group rather than blocking the split.
    const splits = buildCategorySplits({
      items: [item(0, 100, 'c-a'), item(1, 40, 'c-b')],
      total: 135,
    });

    expect(splits.find((s) => s.categoryId === 'c-a')!.amount).toBe(95);
    expect(splits.find((s) => s.categoryId === 'c-b')!.amount).toBe(40);
    expect(splits.reduce((sum, s) => sum + s.amount, 0)).toBe(135);
  });

  it('refuses to split when items are further from the total than the tolerance', () => {
    // 140 of items against a 240 total is a 41% gap — we cannot honestly attribute it.
    expect(
      buildCategorySplits({
        items: [item(0, 100, 'c-a'), item(1, 40, 'c-b')],
        total: 240,
      }),
    ).toEqual([]);
  });

  it('refuses to split when the residual would wipe out the largest group', () => {
    // Lines total 5 against a 2 total. The tolerance is opened wide enough to
    // reach the guard, so this exercises the guard and not the tolerance:
    // the -3 residual takes the 3 group to exactly 0, which is not a split.
    expect(
      buildCategorySplits({
        items: [item(0, 3, 'c-a'), item(1, 2, 'c-b')],
        total: 2,
        config: { tolerancePct: 200 },
      }),
    ).toEqual([]);
  });

  it('returns nothing when fewer than two categories are present', () => {
    expect(buildCategorySplits({ items: [item(0, 50, 'c-a'), item(1, 50, 'c-a')], total: 100 })).toEqual([]);
    expect(buildCategorySplits({ items: [item(0, 100, null, null)], total: 100 })).toEqual([]);
    expect(buildCategorySplits({ items: [], total: 100 })).toEqual([]);
  });

  it('returns nothing for a non-positive or non-finite total', () => {
    expect(buildCategorySplits({ items: [item(0, 5, 'c-a'), item(1, 5, 'c-b')], total: 0 })).toEqual([]);
    expect(buildCategorySplits({ items: [item(0, 5, 'c-a'), item(1, 5, 'c-b')], total: Number.NaN })).toEqual([]);
  });

  it('makes percentages sum to exactly 100', () => {
    const splits = buildCategorySplits({
      items: [item(0, 33.33, 'c-a'), item(1, 33.33, 'c-b'), item(2, 33.34, 'c-c')],
      total: 100,
    });
    expect(splits.reduce((sum, s) => sum + s.percentage, 0)).toBe(100);
  });

  it('reports which lines produced each group', () => {
    const splits = buildCategorySplits({
      items: [item(0, 10, 'c-a'), item(1, 5, 'c-b'), item(2, 20, 'c-a')],
      total: 35,
    });
    expect(splits.find((s) => s.categoryId === 'c-a')!.itemIndexes).toEqual([0, 2]);
  });

  it('ignores lines with a non-positive or non-finite amount', () => {
    const splits = buildCategorySplits({
      items: [item(0, 100, 'c-a'), item(1, 40, 'c-b'), item(2, 0, 'c-c'), item(3, Number.NaN, 'c-d')],
      total: 140,
    });
    expect(splits.map((s) => s.categoryId)).toEqual(['c-a', 'c-b']);
  });

  it('defaults the tolerance to 5 percent', () => {
    expect(RECEIPT_SPLIT_DEFAULTS.tolerancePct).toBe(5);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/common/utils/receipt-category-split.spec.ts`
Expected: FAIL — `Cannot find module './receipt-category-split'`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/common/utils/receipt-category-split.ts`:

```ts
/**
 * Groups a receipt's line items into category splits.
 *
 * The hard invariant: the returned amounts sum to `total` exactly, to the cent.
 * `analytics.service.ts` groups by splits *instead of* the expense's own
 * category but computes the period total from `expense.amount`, so a split set
 * that does not sum to the amount silently stops the breakdown adding up to the
 * total and makes every percentage wrong.
 *
 * Pure: no I/O, no clock, no Prisma. Mirrored for the mobile client in
 * `packages/shared-utils/src/formatting/receipt-category-split.ts` — change one,
 * change the other. It cannot be a single shared import: the API has no build
 * step for workspace packages.
 */

export interface SplitInputItem {
  /** Position of the line on the receipt; carried through for explainability. */
  index: number;
  /** The line's total price, in the receipt's currency. */
  amount: number;
  categoryId: string | null;
  categoryName: string | null;
}

export interface ReceiptCategorySplit {
  categoryId: string;
  categoryName: string;
  amount: number;
  percentage: number;
  itemIndexes: number[];
}

export interface ReceiptSplitConfig {
  /** Max |Σitems − total| as a percentage of total before we refuse to split. */
  tolerancePct: number;
}

export const RECEIPT_SPLIT_DEFAULTS: ReceiptSplitConfig = { tolerancePct: 5 };

const toCents = (amount: number): number => Math.round(amount * 100);
const fromCents = (cents: number): number => Math.round(cents) / 100;
const isUsableAmount = (amount: number): boolean => Number.isFinite(amount) && amount > 0;

export function buildCategorySplits(params: {
  items: SplitInputItem[];
  total: number;
  config?: ReceiptSplitConfig;
}): ReceiptCategorySplit[] {
  const { items, total } = params;
  const config = params.config ?? RECEIPT_SPLIT_DEFAULTS;

  if (!Number.isFinite(total) || total <= 0) return [];

  const usable = items.filter((i) => isUsableAmount(i.amount));
  if (usable.length === 0) return [];

  const totalCents = toCents(total);

  // Every line counts toward the tolerance check, assigned or not: an
  // unassigned line's money is still part of this receipt.
  const itemsCents = usable.reduce((sum, i) => sum + toCents(i.amount), 0);
  const gapPct = (Math.abs(itemsCents - totalCents) / totalCents) * 100;
  if (gapPct > config.tolerancePct) return [];

  const groups = new Map<string, { categoryName: string; cents: number; itemIndexes: number[] }>();
  for (const line of usable) {
    if (!line.categoryId) continue;
    const group = groups.get(line.categoryId) ?? {
      categoryName: line.categoryName ?? '',
      cents: 0,
      itemIndexes: [],
    };
    group.cents += toCents(line.amount);
    group.itemIndexes.push(line.index);
    groups.set(line.categoryId, group);
  }

  if (groups.size < 2) return [];

  const ordered = Array.from(groups.entries())
    .map(([categoryId, group]) => ({ categoryId, ...group }))
    // Ties broken by categoryId so the output is deterministic for a given input.
    .sort((a, b) => b.cents - a.cents || a.categoryId.localeCompare(b.categoryId));

  // The residual is whatever the assigned lines did not account for: unassigned
  // lines, a folded discount, or rounding. It goes to the largest group.
  const assignedCents = ordered.reduce((sum, g) => sum + g.cents, 0);
  const residual = totalCents - assignedCents;
  ordered[0].cents += residual;

  // A residual big enough to zero out the largest group means the arithmetic no
  // longer describes the receipt. Refusing beats publishing a nonsense split.
  if (ordered[0].cents <= 0) return [];

  // Re-sort: absorbing the residual can change which group is largest.
  ordered.sort((a, b) => b.cents - a.cents || a.categoryId.localeCompare(b.categoryId));

  const splits = ordered.map((group) => ({
    categoryId: group.categoryId,
    categoryName: group.categoryName,
    amount: fromCents(group.cents),
    percentage: Math.round((group.cents / totalCents) * 10000) / 100,
    itemIndexes: group.itemIndexes,
  }));

  // Percentages are rounded to 2dp individually, so make the largest absorb the
  // rounding drift and keep the set summing to exactly 100.
  const percentageDrift = 100 - splits.reduce((sum, s) => sum + s.percentage, 0);
  splits[0].percentage = Math.round((splits[0].percentage + percentageDrift) * 100) / 100;

  return splits;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/common/utils/receipt-category-split.spec.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/utils/receipt-category-split.ts apps/api/src/common/utils/receipt-category-split.spec.ts
git commit -m "feat(expenses): pure receipt category split arithmetic"
```

---

### Task 2: Mirror the arithmetic for the mobile client

The receipt screen recomputes groups when the user reassigns a line, and its numbers must match what the server would have produced. The API cannot import from `@budget/shared-utils` at runtime, so this is a deliberate duplicated pair, the same arrangement as `financial-month.ts`.

**Files:**
- Create: `packages/shared-utils/src/formatting/receipt-category-split.ts`
- Modify: `packages/shared-utils/src/formatting/index.ts` (add the re-export)
- Test: `apps/mobile/src/features/receipt/__tests__/receiptCategorySplit.test.ts`

**Interfaces:**
- Consumes: the algorithm from Task 1.
- Produces: the same exported names as Task 1, importable from `@budget/shared-utils` by mobile only.

- [ ] **Step 1: Copy the implementation**

Copy `apps/api/src/common/utils/receipt-category-split.ts` verbatim to `packages/shared-utils/src/formatting/receipt-category-split.ts`, changing only the header comment's mirror direction to point back at the API copy.

- [ ] **Step 2: Re-export it**

In `packages/shared-utils/src/formatting/index.ts`, next to the existing `financial-month` re-export, add:

```ts
export * from './receipt-category-split';
```

- [ ] **Step 3: Write the mirror-parity test**

Create `apps/mobile/src/features/receipt/__tests__/receiptCategorySplit.test.ts`. Copy the *entire* `describe` block from `apps/api/src/common/utils/receipt-category-split.spec.ts`, changing only the import to:

```ts
import { buildCategorySplits, RECEIPT_SPLIT_DEFAULTS, type SplitInputItem } from '@budget/shared-utils';
```

This is the guard against the two copies drifting: the same case table must pass on both sides.

- [ ] **Step 4: Run it**

Run: `cd apps/mobile && npx jest src/features/receipt/__tests__/receiptCategorySplit.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-utils/src/formatting/receipt-category-split.ts packages/shared-utils/src/formatting/index.ts apps/mobile/src/features/receipt/__tests__/receiptCategorySplit.test.ts
git commit -m "feat(shared-utils): mirror receipt category split arithmetic for mobile"
```

---

### Task 3: Schema — item category and the product rule table

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`ExpenseItem`, `Category`, `Account`, plus a new model)
- Create: `apps/api/prisma/migrations/20260812120000_add_expense_item_category/migration.sql`
- Create: `apps/api/prisma/migrations/20260812120001_add_product_category_rules/migration.sql`
- Modify: `apps/mobile/src/db/client.native.ts` (SQLite `ALTER TABLE`)

**Interfaces:**
- Produces: `expense_items.category_id` (nullable FK) and the `ProductCategoryRule` Prisma model with the compound unique `accountId_canonicalNameNormalized`.

- [ ] **Step 1: Add the item column to the Prisma schema**

In `apps/api/prisma/schema.prisma`, inside `model ExpenseItem`, after `canonicalName`:

```prisma
  categoryId    String?  @map("category_id")
```

and in its relations block, next to the existing `expense` relation:

```prisma
  category Category? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
```

`SetNull`, not `Cascade`: deleting a category must not delete the receipt line. This mirrors `BudgetAlert.categoryId`.

- [ ] **Step 2: Add the rule model**

Add next to `model MerchantCategoryRule` (around line 1860):

```prisma
model ProductCategoryRule {
  id                     String   @id @default(uuid())
  accountId              String   @map("account_id")
  canonicalNameNormalized String  @map("canonical_name_normalized")
  categoryId             String   @map("category_id")
  createdAt              DateTime @default(now()) @map("created_at")
  updatedAt              DateTime @updatedAt @map("updated_at")

  account  Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)
  category Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@unique([accountId, canonicalNameNormalized])
  @@index([accountId])
  @@map("product_category_rules")
}
```

Add the back-relations Prisma requires: `productCategoryRules ProductCategoryRule[]` on both `model Account` and `model Category`, and `expenseItems ExpenseItem[]` on `model Category`.

- [ ] **Step 3: Write the migrations by hand**

This repo runs migrations against prod via the deploy `migrator` and has no local DB, so migration SQL is authored directly (the `inflation_shield_recommendations` precedent).

`apps/api/prisma/migrations/20260812120000_add_expense_item_category/migration.sql`:

```sql
ALTER TABLE "expense_items" ADD COLUMN "category_id" TEXT;

ALTER TABLE "expense_items" ADD CONSTRAINT "expense_items_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "expense_items_category_id_idx" ON "expense_items"("category_id");
```

`apps/api/prisma/migrations/20260812120001_add_product_category_rules/migration.sql`:

```sql
CREATE TABLE "product_category_rules" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "canonical_name_normalized" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_category_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_category_rules_account_id_canonical_name_normalized_key"
  ON "product_category_rules"("account_id", "canonical_name_normalized");
CREATE INDEX "product_category_rules_account_id_idx" ON "product_category_rules"("account_id");

ALTER TABLE "product_category_rules" ADD CONSTRAINT "product_category_rules_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_category_rules" ADD CONSTRAINT "product_category_rules_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: Regenerate the Prisma client and verify it typechecks**

Run: `cd apps/api && npx prisma generate && npx tsc --noEmit -p tsconfig.json`
Expected: generate succeeds; no new type errors.

- [ ] **Step 5: Add the mobile SQLite column**

In `apps/mobile/src/db/client.native.ts`, alongside the existing `expense_items` `ALTER TABLE ... ADD COLUMN canonical_name TEXT` migration, add the same-shaped statement for `category_id TEXT`. Follow whatever guard the neighbouring ALTER uses so a re-run on an existing device is a no-op.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma apps/mobile/src/db/client.native.ts
git commit -m "feat(db): expense item category and product category rules"
```

---

### Task 4: ProductRulesService

**Files:**
- Create: `apps/api/src/modules/merchant-rules/product-rules.service.ts`
- Test: `apps/api/src/modules/merchant-rules/product-rules.service.spec.ts`
- Modify: `apps/api/src/modules/merchant-rules/merchant-rules.module.ts` (provide + export it)

It lives in `merchant-rules/` rather than a new module: it is the same idea over a different key, and the module is already imported where it is needed. No controller — v1 exposes no product-rule CRUD endpoint.

**Interfaces:**
- Consumes: `PrismaService`.
- Produces:
  - `normalizeProductName(name: string): string`
  - `ProductRulesService.getRulesMap(accountId: string): Promise<Map<string, string>>` — normalized name → categoryId
  - `ProductRulesService.upsertRules(accountId: string, rules: Array<{ canonicalName: string; categoryId: string }>): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/merchant-rules/product-rules.service.spec.ts`:

```ts
import { ProductRulesService, normalizeProductName } from './product-rules.service';

describe('normalizeProductName', () => {
  it('trims and lowercases so the same product matches across receipts', () => {
    expect(normalizeProductName('  Mleko Łaciate 3,2% 1L ')).toBe('mleko łaciate 3,2% 1l');
  });
});

describe('ProductRulesService', () => {
  const makePrisma = () => ({
    productCategoryRule: {
      findMany: jest.fn().mockResolvedValue([
        { canonicalNameNormalized: 'piwo żywiec 500ml', categoryId: 'c-alc' },
      ]),
      upsert: jest.fn().mockResolvedValue({}),
    },
  });

  it('returns rules as a normalized-name → categoryId map', async () => {
    const prisma = makePrisma();
    const service = new ProductRulesService(prisma as any);

    const map = await service.getRulesMap('acc-1');

    expect(map.get('piwo żywiec 500ml')).toBe('c-alc');
    expect(prisma.productCategoryRule.findMany).toHaveBeenCalledWith({
      where: { accountId: 'acc-1' },
      select: { canonicalNameNormalized: true, categoryId: true },
    });
  });

  it('upserts one rule per product, normalizing the key', async () => {
    const prisma = makePrisma();
    const service = new ProductRulesService(prisma as any);

    await service.upsertRules('acc-1', [{ canonicalName: '  Piwo Żywiec 500ml', categoryId: 'c-alc' }]);

    expect(prisma.productCategoryRule.upsert).toHaveBeenCalledWith({
      where: { accountId_canonicalNameNormalized: { accountId: 'acc-1', canonicalNameNormalized: 'piwo żywiec 500ml' } },
      create: { accountId: 'acc-1', canonicalNameNormalized: 'piwo żywiec 500ml', categoryId: 'c-alc' },
      update: { categoryId: 'c-alc' },
    });
  });

  it('skips entries with a blank name and never throws', async () => {
    const prisma = makePrisma();
    prisma.productCategoryRule.upsert.mockRejectedValueOnce(new Error('db down'));
    const service = new ProductRulesService(prisma as any);

    await expect(
      service.upsertRules('acc-1', [
        { canonicalName: '   ', categoryId: 'c-alc' },
        { canonicalName: 'chleb', categoryId: 'c-food' },
      ]),
    ).resolves.toBeUndefined();

    expect(prisma.productCategoryRule.upsert).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest src/modules/merchant-rules/product-rules.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `apps/api/src/modules/merchant-rules/product-rules.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/** The rule key. Mirrors `merchantNormalized` in MerchantRulesService. */
export function normalizeProductName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Learned product → category rules, the sibling of MerchantRulesService.
 *
 * Two writers: a successful LLM classification (so a repeat purchase costs
 * nothing) and a user correction (which simply overwrites, so the user always
 * wins over the model).
 */
@Injectable()
export class ProductRulesService {
  private readonly logger = new Logger(ProductRulesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getRulesMap(accountId: string): Promise<Map<string, string>> {
    const rules: Array<{ canonicalNameNormalized: string; categoryId: string }> =
      await (this.prisma as any).productCategoryRule.findMany({
        where: { accountId },
        select: { canonicalNameNormalized: true, categoryId: true },
      });
    return new Map(rules.map((r) => [r.canonicalNameNormalized, r.categoryId]));
  }

  /**
   * Never throws: rule learning is a background nicety, and losing it must not
   * fail the write that triggered it.
   */
  async upsertRules(
    accountId: string,
    rules: Array<{ canonicalName: string; categoryId: string }>,
  ): Promise<void> {
    for (const rule of rules) {
      const canonicalNameNormalized = normalizeProductName(rule.canonicalName ?? '');
      if (!canonicalNameNormalized || !rule.categoryId) continue;
      try {
        await (this.prisma as any).productCategoryRule.upsert({
          where: { accountId_canonicalNameNormalized: { accountId, canonicalNameNormalized } },
          create: { accountId, canonicalNameNormalized, categoryId: rule.categoryId },
          update: { categoryId: rule.categoryId },
        });
      } catch (error) {
        this.logger.warn(`[ProductRules] upsert skipped for "${canonicalNameNormalized}": ${error}`);
      }
    }
  }
}
```

- [ ] **Step 4: Register it in the module**

In `apps/api/src/modules/merchant-rules/merchant-rules.module.ts`, add `ProductRulesService` to both `providers` and `exports`.

- [ ] **Step 5: Run the tests**

Run: `cd apps/api && npx jest src/modules/merchant-rules/`
Expected: PASS — the new suite plus the existing merchant-rules suites.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/merchant-rules
git commit -m "feat(merchant-rules): learned product to category rules"
```

---

### Task 5: The classifier

Replaces `SplitSuggestionService`. The old service, its `POST /ai/suggest-splits` endpoint, and the mobile `api.suggestSplits` method are deleted in this task: all three have zero call sites, so no released client can be affected, and leaving an endpoint whose contract asks the model to compute money would contradict this feature.

**Files:**
- Create: `apps/api/src/modules/ai/services/receipt-category-split.service.ts`
- Test: `apps/api/src/modules/ai/services/receipt-category-split.service.spec.ts`
- Delete: `apps/api/src/modules/ai/services/split-suggestion.service.ts`
- Modify: `apps/api/src/modules/ai/ai.module.ts`, `apps/api/src/modules/ai/ai.controller.ts` (drop the old service and endpoint, provide the new service)
- Modify: `apps/mobile/src/services/ai.api.ts` (delete `suggestSplits`)

**Interfaces:**
- Consumes: `ProductRulesService` (Task 4), `CacheService`, `PrismaService`, `resolveCheapModel`.
- Produces: `ReceiptCategorySplitService.classify(params: { accountId: string; items: Array<{ index: number; label: string; amount: number }>; categories: Array<{ id: string; name: string }> }): Promise<Map<number, string>>` — line index → categoryId, missing entries meaning "unassigned".

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/ai/services/receipt-category-split.service.spec.ts`:

```ts
import { ReceiptCategorySplitService } from './receipt-category-split.service';

const CATEGORIES = [
  { id: 'c-food', name: 'Groceries' },
  { id: 'c-alc', name: 'Alcohol' },
];

const ITEMS = [
  { index: 0, label: 'Chleb', amount: 5 },
  { index: 1, label: 'Piwo Żywiec', amount: 8 },
];

function makeService(opts: {
  rules?: Map<string, string>;
  completion?: unknown;
  quotaUsed?: number;
} = {}) {
  const productRules = {
    getRulesMap: jest.fn().mockResolvedValue(opts.rules ?? new Map()),
    upsertRules: jest.fn().mockResolvedValue(undefined),
  };
  const cache = {
    get: jest.fn().mockResolvedValue(opts.quotaUsed ?? 0),
    set: jest.fn().mockResolvedValue(undefined),
  };
  const create = jest.fn().mockResolvedValue({
    choices: [{ message: { content: JSON.stringify(opts.completion ?? { assignments: [] }) } }],
  });

  const service = new ReceiptCategorySplitService(
    { get: () => 'test-key' } as any,
    productRules as any,
    cache as any,
  );
  (service as any).openai = { chat: { completions: { create } } };

  return { service, productRules, cache, create };
}

describe('ReceiptCategorySplitService.classify', () => {
  it('answers from rules without calling the model', async () => {
    const { service, create } = makeService({ rules: new Map([['chleb', 'c-food'], ['piwo żywiec', 'c-alc']]) });

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.get(0)).toBe('c-food');
    expect(result.get(1)).toBe('c-alc');
    expect(create).not.toHaveBeenCalled();
  });

  it('asks the model only about lines the rules did not cover, and learns the answer', async () => {
    const { service, productRules, create } = makeService({
      rules: new Map([['chleb', 'c-food']]),
      completion: { assignments: [{ line: 1, category: 'Alcohol' }] },
    });

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.get(1)).toBe('c-alc');
    const prompt = create.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain('Piwo Żywiec');
    expect(prompt).not.toContain('Chleb');
    expect(productRules.upsertRules).toHaveBeenCalledWith('a1', [
      { canonicalName: 'Piwo Żywiec', categoryId: 'c-alc' },
    ]);
  });

  it('drops an invented category name instead of trusting it', async () => {
    const { service } = makeService({ completion: { assignments: [{ line: 1, category: 'Crypto' }] } });

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.size).toBe(0);
  });

  it('drops an out-of-range line number', async () => {
    const { service } = makeService({ completion: { assignments: [{ line: 99, category: 'Alcohol' }] } });

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.size).toBe(0);
  });

  it('keeps the valid assignments when one entry is bad', async () => {
    const { service } = makeService({
      completion: { assignments: [{ line: 1, category: 'Groceries' }, { line: 2, category: 'Nope' }] },
    });

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.get(0)).toBe('c-food');
    expect(result.has(1)).toBe(false);
  });

  it('falls back to rules only when the daily quota is spent', async () => {
    const { service, create } = makeService({
      rules: new Map([['chleb', 'c-food']]),
      quotaUsed: 999,
    });

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.get(0)).toBe('c-food');
    expect(create).not.toHaveBeenCalled();
  });

  it('returns rule hits and never throws when the model call fails', async () => {
    const { service, create } = makeService({ rules: new Map([['chleb', 'c-food']]) });
    create.mockRejectedValueOnce(new Error('openai down'));

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.get(0)).toBe('c-food');
    expect(result.has(1)).toBe(false);
  });

  it('matches category names case-insensitively', async () => {
    const { service } = makeService({ completion: { assignments: [{ line: 2, category: 'alcohol' }] } });

    const result = await service.classify({ accountId: 'a1', items: ITEMS, categories: CATEGORIES });

    expect(result.get(1)).toBe('c-alc');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest src/modules/ai/services/receipt-category-split.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `apps/api/src/modules/ai/services/receipt-category-split.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { CacheService } from '../../../common/cache/cache.service';
import { ProductRulesService, normalizeProductName } from '../../merchant-rules/product-rules.service';
import { resolveCheapModel } from './model-resolver';
import { sanitizeForPrompt } from '../utils/sanitize';

export interface ClassifyLine {
  index: number;
  /** canonicalName when we have one, else the raw description. */
  label: string;
  amount: number;
}

/** NaN-guarded, mirroring parseInferenceQuotaEnv in the AI import path. */
function resolveDailyLimit(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
}

/**
 * Assigns receipt lines to categories: learned rules first, the model only for
 * what is left.
 *
 * The model returns line numbers and category NAMES and nothing else — never an
 * amount, a percentage or a total. That is the same contract the AI statement
 * import holds the model to, and it is what lets buildCategorySplits own all
 * arithmetic. Anything the model invents is dropped, not trusted.
 */
@Injectable()
export class ReceiptCategorySplitService {
  private readonly logger = new Logger(ReceiptCategorySplitService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly productRules: ProductRulesService,
    private readonly cache: CacheService,
  ) {
    this.openai = new OpenAI({ apiKey: this.configService.get<string>('OPENAI_API_KEY') });
  }

  async classify(params: {
    accountId: string;
    items: ClassifyLine[];
    categories: Array<{ id: string; name: string }>;
  }): Promise<Map<number, string>> {
    const { accountId, items, categories } = params;
    const assigned = new Map<number, string>();
    if (items.length === 0 || categories.length === 0) return assigned;

    const rules = await this.productRules.getRulesMap(accountId);
    const validCategoryIds = new Set(categories.map((c) => c.id));

    const unresolved: ClassifyLine[] = [];
    for (const line of items) {
      const ruleCategoryId = rules.get(normalizeProductName(line.label));
      // A rule can outlive its category (a stale row, a cross-account id): only
      // honour it if the category is still one of this account's.
      if (ruleCategoryId && validCategoryIds.has(ruleCategoryId)) {
        assigned.set(line.index, ruleCategoryId);
      } else {
        unresolved.push(line);
      }
    }

    if (unresolved.length === 0) return assigned;
    if (!(await this.consumeDailyQuota(accountId))) {
      this.logger.log(`[CategorySplit] daily inference quota spent for ${accountId}; rules only`);
      return assigned;
    }

    try {
      const learned = await this.classifyWithModel(unresolved, categories);
      for (const [index, categoryId] of learned) assigned.set(index, categoryId);

      const newRules = Array.from(learned.entries()).map(([index, categoryId]) => ({
        canonicalName: unresolved.find((l) => l.index === index)!.label,
        categoryId,
      }));
      if (newRules.length > 0) await this.productRules.upsertRules(accountId, newRules);
    } catch (error) {
      this.logger.warn(`[CategorySplit] model classification skipped: ${error}`);
    }

    return assigned;
  }

  private async classifyWithModel(
    lines: ClassifyLine[],
    categories: Array<{ id: string; name: string }>,
  ): Promise<Map<number, string>> {
    const numbered = lines.map((line, i) => `${i + 1}. ${sanitizeForPrompt(line.label)}`).join('\n');
    const categoryNames = categories.map((c) => c.name).join(', ');

    const prompt = `Assign each receipt line to exactly one category.

Lines:
${numbered}

Categories: ${categoryNames}

Return JSON: {"assignments":[{"line":1,"category":"<one of the categories above>"}]}
Use only the category names listed, spelled exactly as given.
Omit a line entirely if you are not confident.
Do not return any amounts, prices, totals or percentages.`;

    const response = await this.openai.chat.completions.create({
      model: resolveCheapModel(),
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 800,
    });

    const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
    return this.validateAssignments(parsed?.assignments, lines, categories);
  }

  /**
   * A Set, not an object map, so that inherited keys like "constructor" cannot
   * pass as a category name — the same trap the AI import validator avoids.
   */
  private validateAssignments(
    raw: unknown,
    lines: ClassifyLine[],
    categories: Array<{ id: string; name: string }>,
  ): Map<number, string> {
    const result = new Map<number, string>();
    if (!Array.isArray(raw)) return result;

    const byName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id]));
    const allowed = new Set(byName.keys());

    for (const entry of raw) {
      const lineNumber = Number(entry?.line);
      if (!Number.isInteger(lineNumber) || lineNumber < 1 || lineNumber > lines.length) continue;

      const name = String(entry?.category ?? '').trim().toLowerCase();
      if (!allowed.has(name)) continue;

      result.set(lines[lineNumber - 1].index, byName.get(name)!);
    }
    return result;
  }

  /**
   * Redis, not usage_logs: the only writer of that table is trackAiUsage, the
   * monthly billing counter this path is specified to stay out of. get-then-set
   * is not atomic — the same benign race the AI import ceiling accepts, because
   * this is an abuse ceiling, not an accounting record.
   */
  private async consumeDailyQuota(accountId: string): Promise<boolean> {
    const limit = resolveDailyLimit(process.env.AI_SPLIT_MAX_INFERENCES_PER_DAY);
    const day = new Date().toISOString().slice(0, 10);
    const key = `aisplit:${accountId}:${day}`;
    const used = (await this.cache.get<number>(key)) ?? 0;
    if (used >= limit) return false;
    await this.cache.set(key, used + 1, 24 * 60 * 60);
    return true;
  }
}
```

- [ ] **Step 4: Delete the dead predecessor**

- Delete `apps/api/src/modules/ai/services/split-suggestion.service.ts`.
- In `ai.module.ts`: remove the `SplitSuggestionService` import, provider and export; add `ReceiptCategorySplitService` to `providers` and `exports`; add `MerchantRulesModule` to `imports` if it is not already there.
- In `ai.controller.ts`: remove the `SplitSuggestionService` import, the constructor parameter, and the whole `@Post('suggest-splits')` handler.
- In `apps/mobile/src/services/ai.api.ts`: remove the `suggestSplits` method.

- [ ] **Step 5: Run the tests and a typecheck**

Run: `cd apps/api && npx jest src/modules/ai/ && npx tsc --noEmit -p tsconfig.json`
Expected: PASS; no references to the deleted service remain.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/ai apps/mobile/src/services/ai.api.ts
git commit -m "feat(ai): receipt line category classifier, replacing the dead split suggester"
```

---

### Task 6: Wire the split into the scan funnel

**Files:**
- Modify: `apps/api/src/modules/ai/services/ocr.service.ts` (`ReceiptExpense`, `buildReceiptExpense`, `finalizeReceipt`, constructor)
- Modify: `apps/mobile/src/services/ai.api.ts` (the inline `scanReceipt` response type)
- Test: `apps/api/src/modules/ai/services/ocr.service.spec.ts`

**Interfaces:**
- Consumes: `buildCategorySplits` (Task 1), `ReceiptCategorySplitService.classify` (Task 5).
- Produces: `ReceiptExpense.categorySplits: ReceiptCategorySplit[]` — always present, empty when there is nothing to report.

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/modules/ai/services/ocr.service.spec.ts`:

```ts
describe('finalizeReceipt category splits', () => {
  it('always exposes categorySplits, even when classification finds nothing', async () => {
    // Arrange an OcrService whose classifier returns an empty map, then assert
    // the finalized receipt has `categorySplits: []` — never undefined, so no
    // consumer has to guard for it (the priceFindings rule).
  });

  it('never lets a classifier failure break the scan', async () => {
    // Classifier throws → categorySplits is [] and every other field on the
    // finalized receipt is unchanged.
  });

  it('skips classification for a fully encrypted (tier-2) account', async () => {
    // The classifier is never called; categorySplits is [].
  });
});
```

Follow the arrangement the existing suites in this file already use for mocking `PrismaService` and the OpenAI client; the executor should copy that setup rather than invent a new one.

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/api && npx jest src/modules/ai/services/ocr.service.spec.ts -t "category splits"`
Expected: FAIL.

- [ ] **Step 3: Add the field to the type**

In `ocr.service.ts`, in `interface ReceiptExpense` after `priceFindings`:

```ts
  /** Category groups derived from the receipt's own lines. Always present; empty when there is nothing to split. */
  categorySplits: ReceiptCategorySplit[];
```

Import the type from the util: `import { buildCategorySplits, type ReceiptCategorySplit } from '../../../common/utils/receipt-category-split';`

In `buildReceiptExpense`, initialise it next to `priceFindings: []`:

```ts
      categorySplits: [],
```

- [ ] **Step 4: Add the runner and call it from the funnel**

Add to `OcrService`, next to `runPriceCheck`:

```ts
  /**
   * Groups the receipt's lines into category splits. Fail-silent by contract,
   * for the same reason as runPriceCheck: a scan must never break because a
   * derived extra failed.
   */
  private async runCategorySplit(accountId: string, receipt: ReceiptExpense): Promise<ReceiptCategorySplit[]> {
    try {
      const lines = (receipt.receiptItems ?? [])
        .map((item, index) => ({
          index,
          label: (item.canonicalName?.trim() || item.description?.trim() || ''),
          amount: Number(item.totalPrice),
        }))
        .filter((line) => line.label.length > 0 && Number.isFinite(line.amount) && line.amount > 0);
      if (lines.length < 2) return [];

      const categories = await this.prisma.category.findMany({
        where: { OR: [{ isSystem: true }, { accountId }], type: 'expense', isDeleted: false },
        select: { id: true, name: true },
      });
      if (categories.length === 0) return [];

      const assigned = await this.categorySplitter.classify({ accountId, items: lines, categories });
      if (assigned.size === 0) return [];

      const byId = new Map(categories.map((c) => [c.id, c.name]));
      return buildCategorySplits({
        total: receipt.amount,
        items: lines.map((line) => {
          const categoryId = assigned.get(line.index) ?? null;
          return {
            index: line.index,
            amount: line.amount,
            categoryId,
            categoryName: categoryId ? byId.get(categoryId) ?? null : null,
          };
        }),
      });
    } catch (error) {
      this.logger.warn(`[CategorySplit] skipped: ${error}`);
      return [];
    }
  }
```

Inject `private readonly categorySplitter: ReceiptCategorySplitService` in the constructor, and extend `finalizeReceipt`:

```ts
    const receipt = await this.buildReceiptExpense(parsed, categories);
    receipt.priceFindings = await this.runPriceCheck(accountId, receipt);
    receipt.categorySplits = await this.runCategorySplit(accountId, receipt);
    return receipt;
```

- [ ] **Step 5: Skip tier-2 accounts**

At the top of `runCategorySplit`, before building lines, return `[]` when the account is fully encrypted. Use the same account-encryption lookup the codebase already uses to refuse tier-2 in `receipt-split` and `wrapped`; do not invent a second way of asking that question.

- [ ] **Step 6: Teach the mobile client about the new field**

`apps/mobile/src/services/ai.api.ts` types the scan response **inline** in the
`scanReceipt` generic (around line 139) — there is no shared DTO to update. Add
to that inline type, next to `receiptItems`:

```ts
      categorySplits: {
        categoryId: string;
        categoryName: string;
        amount: number;
        percentage: number;
        itemIndexes: number[];
      }[];
```

Without this the field exists on the wire but not in the mobile type system, and
Task 8 cannot read it.

- [ ] **Step 7: Run the tests**

Run: `cd apps/api && npx jest src/modules/ai/services/ocr.service.spec.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/ai/services/ocr.service.ts apps/api/src/modules/ai/services/ocr.service.spec.ts apps/mobile/src/services/ai.api.ts
git commit -m "feat(ai): compute receipt category splits in the scan funnel"
```

---

### Task 7: Persist line categories and learn from corrections

**Files:**
- Modify: `packages/shared-types/src/dto/expense.ts` (item payload gains `categoryId`)
- Modify: `apps/api/src/modules/expenses/dto/index.ts` (`CreateExpenseItemDto`)
- Modify: `apps/api/src/modules/expenses/expenses.service.ts` (write `categoryId` on items; learn rules)
- Modify: `apps/api/src/modules/sync/sync.service.ts` (`processExpenseItemChange` carries `categoryId`)
- Test: `apps/api/src/modules/expenses/expenses.service.spec.ts`

**Interfaces:**
- Consumes: `ProductRulesService.upsertRules` (Task 4).
- Produces: created expense items carry `categoryId`; every item that arrives with one upserts a product rule.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/modules/expenses/expenses.service.spec.ts`:

```ts
describe('create with categorized receipt items', () => {
  it('persists each item categoryId', async () => {
    // create() with items [{description:'Piwo', canonicalName:'Piwo Żywiec', totalPrice:8, categoryId:'c-alc'}]
    // → expenseItem.createMany receives categoryId 'c-alc' on that row.
  });

  it('learns a product rule from every categorized item', async () => {
    // → productRules.upsertRules called with [{canonicalName:'Piwo Żywiec', categoryId:'c-alc'}]
  });

  it('does not fail the create when rule learning throws', async () => {
    // upsertRules rejects → create() still resolves with the expense.
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/modules/expenses/expenses.service.spec.ts -t "categorized receipt items"`
Expected: FAIL.

- [ ] **Step 3: Extend the DTOs**

Add `categoryId?: string | null` to the receipt-item shape in `packages/shared-types/src/dto/expense.ts`, and to the API-local `CreateExpenseItemDto` with `@IsOptional() @IsString()`.

- [ ] **Step 4: Write it through**

In `ExpensesService.create`, where expense items are created, resolve each item's `categoryId` through the existing `resolveCategoryId(id, accountId)` helper (items arrive from a client that addresses categories by local id, the same reason splits already do this at line 267) and include the resolved value in the `createMany` data. Do the same in `SyncService.processExpenseItemChange`.

- [ ] **Step 5: Learn the rules**

In the post-create fire-and-forget block, next to the existing `communityPrices` / `familyFeed` / shield calls, add:

```ts
      const learnable = (dto.items ?? [])
        .filter((item) => item.categoryId && (item.canonicalName?.trim() || item.description?.trim()))
        .map((item) => ({
          canonicalName: (item.canonicalName?.trim() || item.description.trim()),
          categoryId: item.categoryId as string,
        }));
      if (learnable.length > 0) {
        void this.productRules?.upsertRules(accountId, learnable).catch(() => {});
      }
```

Inject `@Optional() private readonly productRules?: ProductRulesService` exactly as `communityPrices` and `familyFeed` are injected, so existing tests keep passing unmodified.

- [ ] **Step 6: Run the tests**

Run: `cd apps/api && npx jest src/modules/expenses/ src/modules/sync/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/shared-types apps/api/src/modules/expenses apps/api/src/modules/sync
git commit -m "feat(expenses): persist receipt line categories and learn product rules"
```

---

### Task 8: Receipt screen — show and edit the split

**Files:**
- Create: `apps/mobile/src/components/receipt/CategorySplitChips.tsx`
- Create: `apps/mobile/src/components/receipt/ItemCategorySheet.tsx`
- Modify: `apps/mobile/app/expense/receipt.tsx:112-155`
- Modify: all 9 files in `apps/mobile/src/i18n/locales/`

**Interfaces:**
- Consumes: `scannedReceipt.categorySplits` from the scan response; `buildCategorySplits` from `@budget/shared-utils` (Task 2).
- Produces: `splits` and `items[].categoryId` in the `addExpense` payload.

- [ ] **Step 1: Resolve the server's splits against local categories**

In `receipt.tsx`, alongside the existing `resolvedCategoryId` logic, map each incoming split to a local category — by `categoryId` first, falling back to `useCategoryStore.getState().getCategoryByName(split.categoryName, 'expense')`, the same fallback the screen already uses for `categorySuggestion`.

**If any split fails to resolve, drop the entire split set.** A partially resolved set no longer sums to the expense amount, which is the one thing the arithmetic must guarantee.

- [ ] **Step 2: Render the chips**

`CategorySplitChips.tsx` takes `{ splits, currencyCode, onPress }` and renders one chip per split (`Groceries 180 · Household 35 · Alcohol 25`), sized and coloured like the existing chip rows on this screen. It renders `null` for an empty array, so a receipt with no split looks exactly as it does today.

Mount it in `receipt.tsx` directly above the existing items block (`receipt.tsx:329`).

- [ ] **Step 3: Build the reassignment sheet**

`ItemCategorySheet.tsx` takes `{ visible, items, categories, onChange, onClose }` and lists every receipt line with its currently assigned category; tapping a line opens the category picker; picking one calls `onChange(itemIndex, categoryId)`.

The screen holds `itemCategories: Record<number, string | null>`, seeded from the incoming splits' `itemIndexes`. Every change recomputes the chips locally through `buildCategorySplits` from `@budget/shared-utils`, so the edited numbers match what the server would have produced.

- [ ] **Step 4: Send it on save**

Extend the `items` mapping at `receipt.tsx:113` with `categoryId: itemCategories[index] ?? undefined`, and add `splits` to the `addExpense` call at line 139:

```ts
        splits: currentSplits.length > 1
          ? currentSplits.map((s) => ({ categoryId: s.categoryId, amount: s.amount, percentage: s.percentage }))
          : undefined,
```

`expenseStore.addExpense` already accepts and persists both.

- [ ] **Step 5: Add the i18n keys to all 9 locales**

Under a new `receiptSplit` object: `title` ("Split by category"), `edit` ("Change categories"), `itemCategory` ("Category for this item"), `unassigned` ("Not assigned"), `dropped` ("Categories could not be matched — saved without a split"). Polish and the other 8 must be real translations, not English fallbacks.

- [ ] **Step 6: Verify**

Run: `cd apps/mobile && npx tsc --noEmit && npx jest src/features/receipt/`
Expected: PASS. Then scan a multi-category receipt in the app and confirm the chips appear, editing a line updates them, and the saved expense has splits.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/components/receipt apps/mobile/app/expense/receipt.tsx apps/mobile/src/i18n/locales
git commit -m "feat(mobile): show and edit receipt category splits on the scan screen"
```

---

### Task 9: Make mobile analytics honour splits

Without this the whole feature is invisible on the Analytics tab, which computes client-side from SQLite and groups strictly by `expense.categoryId`.

**Files:**
- Modify: `apps/mobile/src/db/splitRepository.ts` (bulk read)
- Modify: `apps/mobile/src/stores/expenseStore.ts` / `apps/mobile/src/stores/expenseSync.ts` (hydrate)
- Modify: `apps/mobile/src/features/analytics/useCategoryAnalytics.ts`
- Test: `apps/mobile/src/features/analytics/__tests__/useCategoryAnalytics.test.ts`

**Interfaces:**
- Consumes: `Expense.splits?: ExpenseCategorySplit[]` on the in-memory expense.
- Produces: category totals derived from splits when present.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/features/analytics/__tests__/useCategoryAnalytics.test.ts` covering the pure grouping:

```ts
describe('category grouping with splits', () => {
  it('attributes a split expense to each of its categories', () => {
    // one 240 expense, categoryId c-food, splits 180/35/25 → three rows.
  });

  it('falls back to the expense category when there are no splits', () => {
    // unchanged behaviour for every existing expense.
  });

  it('keeps the breakdown summing to the period total', () => {
    // Σ category amounts === Σ expense amounts.
  });

  it('uses splits in the trailing-month average too', () => {
    // otherwise vsAverage compares a split month against unsplit history.
  });
});
```

Extract the grouping into a pure exported helper in the same file so it can be tested without rendering a hook — this file currently has no test at all.

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/mobile && npx jest src/features/analytics/__tests__/useCategoryAnalytics.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the bulk split read**

In `splitRepository.ts`, next to `getSplitsForExpense`:

```ts
export async function getSplitsForExpenses(expenseIds: string[]): Promise<Map<string, ExpenseCategorySplit[]>> {
```

One `SELECT ... WHERE expense_id IN (...) AND is_deleted = 0`, chunked so the SQLite variable limit is not exceeded. Per-row reads across a whole account would be hundreds of queries.

- [ ] **Step 4: Hydrate on load**

In the expense pull-and-merge path, after `loadAllExpenses(accountId)`, attach `splits` to each in-memory expense from that map. Add `splits?: ExpenseCategorySplit[]` to the mobile `Expense` type.

- [ ] **Step 5: Group by splits**

In `useCategoryAnalytics.ts`, replace the direct `expense.categoryId` grouping (lines 27-30) with the helper: an expense with `splits.length > 0` contributes each split's converted amount to its own category; otherwise it contributes its whole amount to `categoryId` as today. Apply the same rule inside `getCategoryVsAverage` (lines 40-48), or the delta will compare a split month against unsplit history.

Do not touch `useSummaryAnalytics` or `useFilteredTransactions`: totals are sums of expense amounts and must not change.

- [ ] **Step 6: Run the tests**

Run: `cd apps/mobile && npx jest src/features/analytics/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/db/splitRepository.ts apps/mobile/src/stores apps/mobile/src/features/analytics
git commit -m "feat(mobile): category analytics honour expense splits"
```

---

### Task 10: Bots report the split

**Files:**
- Modify: `apps/api/src/modules/telegram/handlers/photo.handler.ts`, `apps/api/src/modules/whatsapp/handlers/photo.handler.ts`, `apps/api/src/modules/slack/handlers/photo.handler.ts`
- Modify: the three `helpers/i18n.ts` files (9 languages each)
- Test: the three `photo.handler.spec.ts` files

**Interfaces:**
- Consumes: `receipt.categorySplits` on the pending-receipt payload.
- Produces: `buildCategorySplitLine(splits, currencyCode, t): string` per bot.

- [ ] **Step 1: Write the failing tests**

In each `photo.handler.spec.ts`:

```ts
it('passes the receipt category splits into the created expense', async () => {
  // expensesService.create called with splits matching receipt.categorySplits
});

it('appends a split line to the reply', async () => {
  // reply contains "Groceries 180" and "Alcohol 25"
});

it('replies exactly as before when there is no split', async () => {
  // empty categorySplits → reply string unchanged
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/api && npx jest photo.handler.spec`
Expected: FAIL.

- [ ] **Step 3: Carry the splits through**

Add `categorySplits` to each bot's `PendingReceiptData` and pass `splits: data.categorySplits?.length ? data.categorySplits : undefined` into `expensesService.create()` — the same treatment `location` received in ABA-329.

- [ ] **Step 4: Add the reply line**

In each bot's `helpers/i18n.ts`, add a `categorySplit` key in all 9 languages and a `buildCategorySplitLine` helper that returns `''` for an empty array — so a receipt with no split produces a byte-identical reply to today's. Model it on the existing `buildPriceCheckLine`.

- [ ] **Step 5: Run the tests**

Run: `cd apps/api && npx jest photo.handler.spec`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/telegram apps/api/src/modules/whatsapp apps/api/src/modules/slack
git commit -m "feat(bots): report receipt category splits in scan replies"
```

---

### Task 11: Documentation and issue

**Files:**
- Modify: `CLAUDE.md`
- Modify: `user_docs/<lang>/` receipt-scanning section, all 9 languages
- Run: `npm run generate:help`

- [ ] **Step 1: Document the feature in CLAUDE.md**

Add a bullet in the API patterns list covering: the classification chain and where it runs, the "model never emits money" contract, the exact-sum invariant and the tolerance refusal, `AI_SPLIT_MAX_INFERENCES_PER_DAY`, the duplicated util pair, that budgets are deliberately untouched, and that `SplitSuggestionService` / `POST /ai/suggest-splits` were deleted as dead code.

- [ ] **Step 2: Fix the stale safe-to-spend line**

In the same pass, correct the existing claim that `computeSafeToSpend` "lives in `packages/shared-utils`". The API imports its own `apps/api/src/modules/insights/safe-to-spend.util.ts` copy; only the spec file reaches for the shared one. This wording is what nearly caused a fourth repeat of the shared-utils runtime-import outage.

- [ ] **Step 3: Update the user docs**

Describe the split in the receipt-scanning section for all 9 languages, then regenerate: `npm run generate:help`.

- [ ] **Step 4: Run the full check**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: PASS.

- [ ] **Step 5: Commit and create the issue**

```bash
git add CLAUDE.md user_docs apps/mobile/src/help/content.ts
git commit -m "docs: receipt category auto-split"
```

Then create the `ABA-{N}` GitHub issue via the `finish-aba-task` skill (N = highest ABA number in issue titles with `--state all`, plus one).

---

## Self-Review

**Spec coverage.** Classifier chain → Tasks 4, 5. Model-never-emits-money contract and validation → Task 5. Arithmetic invariant, tolerance, residual → Task 1, mirrored in Task 2. `expense_items.category_id` and `product_category_rules` → Task 3. Transport via `ReceiptExpense.categorySplits` in `finalizeReceipt` → Task 6. Mobile chips, reassignment, rule learning → Tasks 7, 8. Mobile analytics → Task 9. Bots → Task 10. E2EE skip → Task 6 Step 5. Daily Redis ceiling → Task 5. Docs → Task 11. Non-goals (budgets, backfill, static dictionary, import paths) appear as Global Constraints and are not implemented anywhere.

**Known softness.** Task 6's tests and Task 8's components are described rather than fully written out: both depend on existing local setup (the OCR spec's mock arrangement, the receipt screen's own style conventions) that the executor should copy from the neighbouring code rather than have invented here. Task 9's steps 3-5 likewise describe the change precisely but leave the SQL chunking and the exact hydration call site to the executor, since that path (`pullAndMergeExpenses`) is shared with several other loaders. Every other task carries literal code.

**Type consistency.** `ReceiptCategorySplit` is defined once in Task 1 and re-exported by Task 2, imported by Task 6, produced by Task 8, and consumed by Task 10 — the same four fields plus `itemIndexes` throughout. `buildCategorySplits` takes `{ items, total, config? }` in every call site. `classify` returns `Map<number, string>` in Task 5 and is consumed as such in Task 6. `normalizeProductName` is defined in Task 4 and used in Task 5.
