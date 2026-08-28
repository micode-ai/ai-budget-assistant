# Returnable-Packaging Deposit Category Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the returnable-packaging deposit on a scanned receipt (`kaucja` / `Pfand` / `statiegeld` / `consigne`) its own category in the receipt's split, and store it on the expense so it is visible even when no split is emitted.

**Architecture:** The OCR already extracts the deposit into `ReceiptExpense.depositAmount`, where it only widens the split tolerance gate. Four changes carry it the rest of the way: the pure `buildCategorySplits` gains an explicit deposit *group* (rather than letting the deposit dissolve into the residual); a new `Expense.depositAmount` column persists it; the finalizer names the group in the account owner's language and hands it a real category id when one already exists; and the mobile app stores and displays it beside the existing discount line.

**Tech Stack:** NestJS 10 + Prisma 5 (API), Expo 54 + SQLite (mobile), Jest, TypeScript.

**Spec:** `docs/superpowers/specs/2026-08-28-returnable-deposit-category-design.md`

## Global Constraints

- **Totals never change.** The deposit stays part of spending. Do not touch budgets, safe-to-spend, wallet, or any spend total.
- **`buildCategorySplits` is a deliberately duplicated pair.** Canonical: `apps/api/src/common/utils/receipt-category-split.ts`. Mirror: `packages/shared-utils/src/formatting/receipt-category-split.ts`. Change one, change the other, in the same commit. The API cannot import `@budget/shared-utils` at runtime — a deploy guard fails the build over it.
- **The pure arithmetic must not learn about nullable category ids.** `ReceiptCategorySplit.categoryId` stays `string`. A category that does not exist yet is carried by the existing `proposed:<name>` sentinel key, which `runCategorySplit` rewrites to `categoryId: null` before anything leaves it.
- **The invariant:** group cent-values sum to the receipt total exactly, by integer construction.
- **TDD.** Every task writes the failing test first, watches it fail, then implements.
- i18n changes touch all 9 locales: `en`, `de`, `es`, `fr`, `pl`, `ru`, `ua`, `be`, `nl`.

---

### Task 1: Deposit becomes its own group in the split arithmetic

**Files:**
- Modify: `apps/api/src/common/utils/receipt-category-split.ts`
- Modify: `packages/shared-utils/src/formatting/receipt-category-split.ts` (identical change)
- Test: `apps/api/src/common/utils/receipt-category-split.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `buildCategorySplits({ items, total, discount?, deposit?, depositGroup?, config? })` where `depositGroup?: { categoryId: string; categoryName: string } | null`. When present together with a positive `deposit`, the returned array contains one extra `ReceiptCategorySplit` whose `amount` is exactly the deposit and whose `itemIndexes` is `[]`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/common/utils/receipt-category-split.spec.ts`, inside the `describe('buildCategorySplits', ...)` block:

```typescript
  describe('deposit as its own group', () => {
    const depositGroup = { categoryId: 'c-dep', categoryName: 'Kaucja' };

    it('emits the deposit as a group of exactly the deposit amount', () => {
      const items = [item(0, 180, 'c-food', 'Groceries'), item(1, 60, 'c-beer', 'Beer')];

      const splits = buildCategorySplits({ items, total: 244.5, deposit: 4.5, depositGroup });

      expect(splits.find((s) => s.categoryId === 'c-dep')?.amount).toBe(4.5);
      expect(splits.reduce((sum, s) => sum + Math.round(s.amount * 100), 0)).toBe(24450);
    });

    it('carries no item indexes, because no line of the receipt is the deposit', () => {
      const items = [item(0, 180, 'c-food', 'Groceries'), item(1, 60, 'c-beer', 'Beer')];

      const splits = buildCategorySplits({ items, total: 244.5, deposit: 4.5, depositGroup });

      expect(splits.find((s) => s.categoryId === 'c-dep')?.itemIndexes).toEqual([]);
    });

    it('counts toward the two-category minimum, so one category plus a deposit splits', () => {
      // Previously this receipt produced nothing: a single category is not a split.
      const items = [item(0, 200, 'c-food', 'Groceries')];

      const splits = buildCategorySplits({ items, total: 204.5, deposit: 4.5, depositGroup });

      expect(splits.map((s) => s.categoryId).sort()).toEqual(['c-dep', 'c-food']);
      expect(splits.reduce((sum, s) => sum + Math.round(s.amount * 100), 0)).toBe(20450);
    });

    it('is not a split on its own, with no line categories behind it', () => {
      expect(
        buildCategorySplits({ items: [item(0, 200, null, null)], total: 204.5, deposit: 4.5, depositGroup }),
      ).toEqual([]);
    });

    it('keeps the residual off the deposit, which is an exact printed figure', () => {
      // 5 of unassigned lines must land on Groceries, never on the deposit.
      const items = [
        item(0, 180, 'c-food', 'Groceries'),
        item(1, 60, 'c-beer', 'Beer'),
        item(2, 5, null, null),
      ];

      const splits = buildCategorySplits({ items, total: 249.5, deposit: 4.5, depositGroup });

      expect(splits.find((s) => s.categoryId === 'c-dep')?.amount).toBe(4.5);
      expect(splits.find((s) => s.categoryId === 'c-food')?.amount).toBe(185);
    });

    it('leaves the discount off the deposit too', () => {
      // A basket coupon discounts goods, not the bottle deposit.
      const items = [item(0, 120, 'c-food', 'Groceries'), item(1, 80, 'c-beer', 'Beer')];

      const splits = buildCategorySplits({ items, total: 184.5, discount: 20, deposit: 4.5, depositGroup });

      expect(splits.find((s) => s.categoryId === 'c-dep')?.amount).toBe(4.5);
      expect(splits.reduce((sum, s) => sum + Math.round(s.amount * 100), 0)).toBe(18450);
    });

    it('ignores the group when there is no deposit to put in it', () => {
      const items = [item(0, 180, 'c-food', 'Groceries'), item(1, 60, 'c-beer', 'Beer')];

      const splits = buildCategorySplits({ items, total: 240, deposit: 0, depositGroup });

      expect(splits.map((s) => s.categoryId)).not.toContain('c-dep');
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/common/utils/receipt-category-split.spec.ts`
Expected: FAIL — TypeScript rejects `depositGroup` as an unknown property of the params object.

- [ ] **Step 3: Implement the deposit group**

In `apps/api/src/common/utils/receipt-category-split.ts`, add the parameter to the signature:

```typescript
  deposit?: number | null;
  /**
   * The category the deposit belongs to, when it should be shown as its own
   * group rather than left in the residual. `categoryId` may be a real id or
   * the caller's `proposed:<name>` sentinel — this function only uses it as a
   * grouping key and never interprets it.
   */
  depositGroup?: { categoryId: string; categoryName: string } | null;
  config?: ReceiptSplitConfig;
}): ReceiptCategorySplit[] {
  const { items, total, discount, deposit, depositGroup } = params;
```

Replace the two-category guard:

```typescript
  // A deposit counts as a category of its own, which is what lets a receipt
  // that is otherwise entirely groceries split at all.
  const depositSplit =
    depositCents > 0 && depositGroup
      ? { categoryId: depositGroup.categoryId, categoryName: depositGroup.categoryName, cents: depositCents }
      : null;

  if (groups.size + (depositSplit ? 1 : 0) < 2) return [];
```

Replace the residual calculation (the deposit is already accounted for, so it must come out of what the line groups have to absorb):

```typescript
  const assignedCents = ordered.reduce((sum, g) => sum + g.cents, 0);
  const residual = totalCents - assignedCents - (depositSplit?.cents ?? 0);
  ordered[0].cents += residual;
```

Then, after the existing `if (ordered[0].cents <= 0) return [];` guard, fold the deposit in before sorting:

```typescript
  // Appended only now: the deposit takes no share of the discount and absorbs
  // no residual. It is a printed, exact figure, and the two adjustments above
  // exist for figures that are neither.
  const all = depositSplit
    ? [...ordered, { ...depositSplit, itemIndexes: [] as number[] }]
    : ordered;

  // Re-sort: absorbing the residual can change which group is largest.
  all.sort((a, b) => b.cents - a.cents || a.categoryId.localeCompare(b.categoryId));

  const splits = all.map((group) => ({
```

(The existing `ordered.sort(...)` line is replaced by the `all.sort(...)` above, and the `ordered.map` that follows becomes `all.map`.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/common/utils/receipt-category-split.spec.ts`
Expected: PASS, all cases including the pre-existing ones.

- [ ] **Step 5: Mirror the change into shared-utils**

Apply the identical edit to `packages/shared-utils/src/formatting/receipt-category-split.ts`. The two files must stay byte-comparable in behaviour; a diff of the two should show only the header comment differing.

Verify: `cd apps/mobile && npx jest src/features/receipt`
Expected: PASS (no behaviour change for the mobile manual-split path, which does not pass `depositGroup`).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/common/utils/receipt-category-split.ts apps/api/src/common/utils/receipt-category-split.spec.ts packages/shared-utils/src/formatting/receipt-category-split.ts
git commit -m "Give a returnable-packaging deposit its own split group"
```

---

### Task 2: Persist the deposit on the expense

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (the `Expense` model, beside `discountAmount` at line 472)
- Create: `apps/api/prisma/migrations/20260828140000_add_expense_deposit_amount/migration.sql`
- Modify: `packages/shared-types/src/entities/expense.ts:50` (beside `discountAmount`)
- Modify: `apps/api/src/modules/expenses/dto/index.ts` (both `CreateExpenseDto` ~line 128 and `UpdateExpenseDto` ~line 261)
- Modify: `apps/api/src/modules/expenses/expenses.service.ts:200` (the create data block)
- Test: `apps/api/src/modules/expenses/expenses.service.spec.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `Expense.depositAmount?: number` on the entity and both DTOs; `ExpensesService.create` persists `dto.depositAmount`.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/modules/expenses/expenses.service.spec.ts`, inside the describe block that already uses `makeCategorizedItemsCreateService()` (it returns `{ service, prisma, createManyMock, createdHooks }` — no new factory is needed):

```typescript
  it('persists the returnable-packaging deposit alongside the discount', async () => {
    const { service, prisma } = makeCategorizedItemsCreateService();

    await service.create('a1', 'u1', { ...baseDto, discountAmount: 70.34, depositAmount: 4.5 } as any);

    expect(prisma.expense.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ discountAmount: 70.34, depositAmount: 4.5 }),
      }),
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && npx jest src/modules/expenses/expenses.service.spec.ts -t "returnable-packaging deposit"`
Expected: FAIL — `depositAmount` is not a known DTO property.

- [ ] **Step 3: Add the column and the migration**

In `apps/api/prisma/schema.prisma`, directly below `discountAmount`:

```prisma
  depositAmount  Decimal? @map("deposit_amount") @db.Decimal(12, 2)
```

Create `apps/api/prisma/migrations/20260828140000_add_expense_deposit_amount/migration.sql`:

```sql
-- Returnable-packaging deposits (kaucja / Pfand / statiegeld / consigne).
--
-- Stored separately from the category split because the split is only emitted
-- when the receipt's arithmetic reconciles, and it frequently does not. A
-- deposit the app read but could not split must still be visible on the
-- expense — and this column is also the only way to measure how reliably the
-- deposit is extracted at all, which nothing could do while the value was
-- never written down.
ALTER TABLE "expenses" ADD COLUMN "deposit_amount" DECIMAL(12,2);
```

Then run `npx prisma generate` from `apps/api`.

- [ ] **Step 4: Thread it through the types and the service**

`packages/shared-types/src/entities/expense.ts`, beside `discountAmount?: number;`:

```typescript
  /** Returnable-packaging deposit included in `amount` (kaucja / Pfand). */
  depositAmount?: number;
```

`apps/api/src/modules/expenses/dto/index.ts`, in BOTH `CreateExpenseDto` and `UpdateExpenseDto`, directly after the `discountAmount` block:

```typescript
  @IsOptional()
  @IsNumber()
  @Min(0)
  depositAmount?: number;
```

`apps/api/src/modules/expenses/expenses.service.ts`, in the create data block beside `discountAmount: dto.discountAmount,`:

```typescript
        depositAmount: dto.depositAmount,
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/api && npx jest src/modules/expenses/expenses.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma apps/api/src/modules/expenses packages/shared-types/src/entities/expense.ts
git commit -m "Persist the returnable-packaging deposit on the expense"
```

---

### Task 3: Name the deposit group and emit it from the finalizer

**Files:**
- Modify: `apps/api/src/modules/ai/services/receipt-category-split.service.ts` (add the name table beside `LANGUAGE_NAMES` at line 54)
- Modify: `apps/api/src/modules/ai/services/receipt-finalizer.service.ts` (`runCategorySplit`, the `buildCategorySplits` call at ~line 283 and the refusal log at ~line 307)
- Test: `apps/api/src/modules/ai/services/receipt-finalizer.service.spec.ts`

**Interfaces:**
- Consumes: `buildCategorySplits({ depositGroup })` from Task 1; `ReceiptExpense.depositAmount` (already exists).
- Produces: `depositCategoryName(language?: string): string`, exported from `receipt-category-split.service.ts`.

- [ ] **Step 1: Write the failing tests**

Add a new describe block to `apps/api/src/modules/ai/services/receipt-finalizer.service.spec.ts`, following the shape of the existing `ReceiptFinalizerService.runCategorySplit with proposals` block — same `prisma` / `categorySplitterMock` doubles from the file's `beforeEach`, same `(service as any).runCategorySplit(...)` call:

```typescript
  describe('ReceiptFinalizerService.runCategorySplit with a deposit', () => {
    const RECEIPT_WITH_DEPOSIT = {
      amount: 204.5,
      depositAmount: 4.5,
      receiptItems: [{ description: 'Chleb', canonicalName: 'Chleb', totalPrice: 200 }],
    } as any;

    beforeEach(() => {
      categorySplitterMock.classify.mockResolvedValue({
        assignments: new Map([[0, 'c-food']]),
        proposals: [],
      });
    });

    it('gives the deposit its own group, named in the account owner language', async () => {
      prisma.user.findUnique.mockResolvedValue({ aiModel: null, language: 'pl', timezone: 'UTC' });
      prisma.category.findMany.mockResolvedValue([{ id: 'c-food', name: 'Groceries' }]);

      const { splits } = await (service as any).runCategorySplit('a1', RECEIPT_WITH_DEPOSIT, 'u1');

      const deposit = splits.find((s: any) => s.categoryName === 'Kaucja');
      expect(deposit).toBeDefined();
      expect(deposit.amount).toBeCloseTo(4.5, 2);
      // Not a real category yet: it is created when the user saves.
      expect(deposit.categoryId).toBeNull();
      expect(JSON.stringify(splits)).not.toContain('proposed:');
    });

    it('splits a receipt that is otherwise a single category', async () => {
      prisma.user.findUnique.mockResolvedValue({ aiModel: null, language: 'pl', timezone: 'UTC' });
      prisma.category.findMany.mockResolvedValue([{ id: 'c-food', name: 'Groceries' }]);

      const { splits } = await (service as any).runCategorySplit('a1', RECEIPT_WITH_DEPOSIT, 'u1');

      expect(splits).toHaveLength(2);
      expect(splits.reduce((sum: number, s: any) => sum + s.amount, 0)).toBeCloseTo(204.5, 2);
    });

    it('reuses the deposit category when the account already has it', async () => {
      prisma.user.findUnique.mockResolvedValue({ aiModel: null, language: 'pl', timezone: 'UTC' });
      prisma.category.findMany.mockResolvedValue([
        { id: 'c-food', name: 'Groceries' },
        { id: 'c-dep', name: 'Kaucja' },
      ]);

      const { splits } = await (service as any).runCategorySplit('a1', RECEIPT_WITH_DEPOSIT, 'u1');

      expect(splits.find((s: any) => s.categoryName === 'Kaucja').categoryId).toBe('c-dep');
    });

    it('is not subject to the 10% materiality floor that governs proposals', async () => {
      // 4.5 of 204.5 is 2.2%. A model proposal that small is dropped; a deposit
      // is not a proposal — it is a printed, named block of the receipt.
      prisma.user.findUnique.mockResolvedValue({ aiModel: null, language: 'en', timezone: 'UTC' });
      prisma.category.findMany.mockResolvedValue([{ id: 'c-food', name: 'Groceries' }]);

      const { splits } = await (service as any).runCategorySplit('a1', RECEIPT_WITH_DEPOSIT, 'u1');

      expect(splits.map((s: any) => s.categoryName)).toContain('Deposit');
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/modules/ai/services/receipt-finalizer.service.spec.ts`
Expected: FAIL — no deposit group is present in `categorySplits`.

- [ ] **Step 3: Add the localized name table**

In `apps/api/src/modules/ai/services/receipt-category-split.service.ts`, beside `LANGUAGE_NAMES`:

```typescript
/**
 * The deposit category's name, per app locale.
 *
 * Ours, not the model's: unlike a proposed category this one has a fixed
 * meaning, so it is not worth an inference and must not drift between scans.
 * One word per language — it sits in a category list next to "Groceries".
 * Resolved from the ACCOUNT OWNER's language so a shared account does not
 * accumulate one deposit category per member.
 */
const DEPOSIT_CATEGORY_NAMES: Record<string, string> = {
  en: 'Deposit',
  pl: 'Kaucja',
  de: 'Pfand',
  es: 'Depósito',
  fr: 'Consigne',
  nl: 'Statiegeld',
  ru: 'Залог за тару',
  ua: 'Застава за тару',
  be: 'Закладзь за тару',
};

export const depositCategoryName = (language?: string): string =>
  DEPOSIT_CATEGORY_NAMES[language ?? ''] ?? DEPOSIT_CATEGORY_NAMES.en;
```

- [ ] **Step 4: Emit the group from `runCategorySplit`**

In `apps/api/src/modules/ai/services/receipt-finalizer.service.ts`, import `depositCategoryName` alongside the existing `proposedKey` import, and insert directly above the `buildCategorySplits` call:

```typescript
      // The deposit is deliberately NOT routed through `proposals` and so never
      // meets MIN_PROPOSAL_SHARE_PCT. That floor exists to stop the model
      // inventing a lasting category to hold three zloty; a deposit is a
      // printed, labelled block of the receipt with a name we supply ourselves,
      // and at a typical 1-2% of the basket the floor would drop it every time.
      const depositAmount = Number(receipt.depositAmount ?? 0);
      const depositName = depositCategoryName(user?.language ?? undefined);
      const existingDeposit = categories.find(
        (c) => c.name.trim().toLowerCase() === depositName.toLowerCase(),
      );
      const depositGroup =
        Number.isFinite(depositAmount) && depositAmount > 0
          ? {
              categoryId: existingDeposit ? existingDeposit.id : proposedKey(depositName),
              categoryName: depositName,
            }
          : null;
```

Add `depositGroup,` to the `buildCategorySplits({ ... })` argument object, directly after `deposit: receipt.depositAmount,`.

- [ ] **Step 5: Correct the refusal log**

The `one_category` label counts line categories only, so a receipt with one line category plus a deposit would be labelled `one_category` when it actually refused on arithmetic. In the refusal log, replace the condition:

```typescript
            new Set(keyByIndex.values()).size + (depositGroup ? 1 : 0) < 2 ? 'one_category' : 'refused_by_arithmetic'
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/modules/ai`
Expected: PASS — all 17 suites, including the pre-existing OCR and split-service tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/ai/services/receipt-category-split.service.ts apps/api/src/modules/ai/services/receipt-finalizer.service.ts apps/api/src/modules/ai/services/receipt-finalizer.service.spec.ts
git commit -m "Emit the deposit as a named category group from the receipt finalizer"
```

---

### Task 4: Store and show the deposit in the mobile app

**Files:**
- Modify: `apps/mobile/src/db/client.native.ts` (beside the `discount_amount` migration at line 558)
- Modify: `apps/mobile/src/db/expenseRepository.ts` (row type line 11, mapping line 52, the two column lists at lines 150 and 369, the update setter at line 177)
- Modify: `apps/mobile/app/expense/receipt.tsx` (the `addExpense` payload at line 247; the discount display at line 407)
- Modify: `apps/mobile/app/expense/[id].tsx` (the discount display at line 192)
- Modify: `apps/mobile/src/i18n/locales/{en,de,es,fr,pl,ru,ua,be,nl}.ts`
- Test: `apps/mobile/src/db/__tests__/expenseRepository.test.ts` if one exists; otherwise no new mobile test — the display is presentational, matching how `discountAmount` is covered today.

**Interfaces:**
- Consumes: `Expense.depositAmount?: number` from Task 2.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Add the SQLite column**

In `apps/mobile/src/db/client.native.ts`, directly after the `discount_amount` block:

```typescript
    // Add deposit_amount column to expenses (returnable packaging)
    try {
      expoDb.execSync(`ALTER TABLE expenses ADD COLUMN deposit_amount REAL`);
    } catch {
      // Column already exists, ignore
    }
```

- [ ] **Step 2: Map it in the repository**

In `apps/mobile/src/db/expenseRepository.ts`: add `deposit_amount: number | null;` to the row type beside `discount_amount`; add `depositAmount: row.deposit_amount ?? undefined,` to the mapping; add `deposit_amount` to both column lists; and add the update setter beside the discount one, following the exact shape of the surrounding code.

- [ ] **Step 3: Carry it from the scan screen**

In `apps/mobile/app/expense/receipt.tsx`, beside `discountAmount: scannedReceipt.discountAmount ?? undefined,`:

```typescript
        depositAmount: scannedReceipt.depositAmount ?? undefined,
```

- [ ] **Step 4: Show the line on both screens**

In `apps/mobile/app/expense/receipt.tsx`, directly below the existing discount block, mirroring its structure exactly:

```tsx
              {scannedReceipt?.depositAmount != null && scannedReceipt.depositAmount > 0 && (
                <Text style={styles.discountText}>
                  {t('receipt.deposit')}: {formatCurrency(scannedReceipt.depositAmount, currencyCode)}
                </Text>
              )}
```

In `apps/mobile/app/expense/[id].tsx`, below the existing discount block:

```tsx
          {expense.depositAmount != null && expense.depositAmount > 0 && (
            <Text style={styles.metaText}>
              {t('receipt.deposit')}: {formatCurrency(expense.depositAmount, expense.currencyCode)}
            </Text>
          )}
```

(Use whatever style names the neighbouring discount lines use in each file — do not invent new ones.)

- [ ] **Step 5: Add the label to all nine locales**

In each of `apps/mobile/src/i18n/locales/{en,de,es,fr,pl,ru,ua,be,nl}.ts`, add to the `receipt` object beside the existing `discount` key:

```
en: deposit: 'Deposit'
de: deposit: 'Pfand'
es: deposit: 'Depósito'
fr: deposit: 'Consigne'
pl: deposit: 'Kaucja'
ru: deposit: 'Залог за тару'
ua: deposit: 'Застава за тару'
be: deposit: 'Закладзь за тару'
nl: deposit: 'Statiegeld'
```

- [ ] **Step 6: Verify the app still builds and its tests pass**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && npx jest`
Expected: typecheck clean, all suites pass.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/db apps/mobile/app/expense apps/mobile/src/i18n/locales
git commit -m "Store and show the returnable-packaging deposit in the app"
```

---

### Task 5: Keep the deposit whole when the user reassigns a line

**Files:**
- Modify: `apps/mobile/src/features/receipt/manualSplits.ts`
- Modify: `apps/mobile/app/expense/receipt.tsx:134-152` (the `currentSplits` memo)
- Test: `apps/mobile/src/features/receipt/__tests__/receiptCategorySplit.test.ts`

**Interfaces:**
- Consumes: the deposit split produced by Task 3, recognisable because it is the only split with `itemIndexes: []`.
- Produces: `withDepositGroup(manual: ReceiptCategorySplit[], deposit: ReceiptCategorySplit | null, total: number): ReceiptCategorySplit[]`.

**Why this task exists.** Once the user reassigns any line, `currentSplits` stops using the server's splits and rebuilds from the receipt's items with `buildManualSplits(items, scannedReceipt.amount)`. The deposit has no item behind it, so it vanishes — and worse, `buildManualSplits` scales the user's assignment across the *whole* total, so the deposit's money is silently redistributed into the user's own categories. One tap on a category would undo the feature.

- [ ] **Step 1: Write the failing test**

Add to `apps/mobile/src/features/receipt/__tests__/receiptCategorySplit.test.ts`:

```typescript
describe('withDepositGroup', () => {
  const deposit = {
    categoryId: null as any,
    categoryName: 'Kaucja',
    amount: 4.5,
    percentage: 2.2,
    itemIndexes: [] as number[],
  };

  it('appends the deposit untouched and keeps the set summing to the total', () => {
    const manual = buildManualSplits(
      [
        { index: 0, amount: 120, categoryId: 'c-food', categoryName: 'Groceries' },
        { index: 1, amount: 80, categoryId: 'c-beer', categoryName: 'Beer' },
      ],
      200,
    );

    const result = withDepositGroup(manual, deposit, 204.5);

    expect(result.find((s) => s.categoryName === 'Kaucja')?.amount).toBe(4.5);
    expect(result.reduce((sum, s) => sum + Math.round(s.amount * 100), 0)).toBe(20450);
  });

  it('recomputes percentages against the full total, so they still sum to 100', () => {
    const manual = buildManualSplits(
      [{ index: 0, amount: 200, categoryId: 'c-food', categoryName: 'Groceries' }],
      200,
    );

    const result = withDepositGroup(manual, deposit, 204.5);

    expect(result.reduce((sum, s) => sum + s.percentage, 0)).toBeCloseTo(100, 2);
  });

  it('is a no-op when the receipt had no deposit', () => {
    const manual = buildManualSplits(
      [{ index: 0, amount: 200, categoryId: 'c-food', categoryName: 'Groceries' }],
      200,
    );

    expect(withDepositGroup(manual, null, 200)).toBe(manual);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/mobile && npx jest src/features/receipt`
Expected: FAIL — `withDepositGroup` is not exported.

- [ ] **Step 3: Implement the helper**

Append to `apps/mobile/src/features/receipt/manualSplits.ts`:

```typescript
/**
 * Re-attaches the deposit group after the user's own assignment has been
 * rebuilt.
 *
 * `buildManualSplits` scales an assignment across the total it is given, which
 * is right for lines and wrong for a deposit: a deposit is a printed figure,
 * not a share of the basket. So the caller rescales the lines against the total
 * MINUS the deposit and puts the deposit back here, whole.
 *
 * Percentages are recomputed against the full total — the manual splits were
 * computed against the smaller base and would otherwise sum past 100 once the
 * deposit is added.
 */
export function withDepositGroup(
  manual: ReceiptCategorySplit[],
  deposit: ReceiptCategorySplit | null,
  total: number,
): ReceiptCategorySplit[] {
  if (!deposit || !Number.isFinite(total) || total <= 0) return manual;

  const all = [...manual, deposit];
  const withPct = all.map((split) => ({
    ...split,
    percentage: Math.round((split.amount / total) * 10000) / 100,
  }));

  // The largest share absorbs the rounding drift, the same way buildManualSplits
  // and buildCategorySplits both do, so the set still reads as exactly 100%.
  const drift = 100 - withPct.reduce((sum, s) => sum + s.percentage, 0);
  const largest = withPct.reduce((a, b) => (b.amount > a.amount ? b : a), withPct[0]);
  largest.percentage = Math.round((largest.percentage + drift) * 100) / 100;
  return withPct;
}
```

- [ ] **Step 4: Use it in the receipt screen**

In `apps/mobile/app/expense/receipt.tsx`, replace the memo's return (currently `return buildManualSplits(items, scannedReceipt.amount);`) with:

```typescript
    // The deposit group is the only split with no lines behind it. Identified
    // structurally rather than by name, because the name is localized and comes
    // from the server.
    const depositSplit = serverSplits.find((s) => s.itemIndexes.length === 0) ?? null;
    const base = scannedReceipt.amount - (depositSplit?.amount ?? 0);
    return withDepositGroup(buildManualSplits(items, base), depositSplit, scannedReceipt.amount);
```

Add `withDepositGroup` to the existing import from `@/features/receipt/manualSplits`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/mobile && npx jest src/features/receipt && npx tsc --noEmit -p tsconfig.json`
Expected: PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/features/receipt apps/mobile/app/expense/receipt.tsx
git commit -m "Keep the deposit group whole when a receipt line is reassigned"
```

---

### Task 6: Documentation and the measurement this feature owes

**Files:**
- Modify: `CLAUDE.md` (the receipt category auto-split entry)
- Modify: `docs/en/ARCHITECTURE.md` and `docs/ru/ARCHITECTURE.md` (the `Receipt Category Auto-Split` / `Авторазбивка чека по категориям` section added on 2026-08-28)
- Modify: `user_docs/{en,de,es,fr,pl,ru,ua,be,nl}/04-voice-and-receipt.md`

- [ ] **Step 1: Update the technical docs**

In `CLAUDE.md` and both `ARCHITECTURE.md` files, extend the auto-split description: the deposit is now its own group rather than residual, it counts toward the two-category minimum, it is named from an API-local table in the account owner's language, it bypasses `MIN_PROPOSAL_SHARE_PCT` by never being a proposal, and `Expense.depositAmount` persists it so it shows even when no split is emitted.

- [ ] **Step 2: Update the user docs in all nine locales**

`user_docs/en/04-voice-and-receipt.md` already says: *"If the items don't add up closely enough to the receipt total, the app falls back to one category instead of guessing."* Add one sentence after it, translated into each of the nine files:

> Bottle and can deposits are recognised and shown as their own category, so you can see how much of your spending is packaging you can get back.

Then regenerate from the project root:

```bash
npm run generate:help
python docs/marketing/help/build_help.py
LANDING_BASE= ROBOTS="index,follow,max-image-preview:large" python docs/marketing/landing/build_landing.py
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs user_docs apps/mobile/src/help/content.ts
git commit -m "Document the deposit category"
```

- [ ] **Step 4: Measure what the spec says is unknown**

After the API deploys, scan a receipt with a deposit block and check both halves:

```bash
ssh -i ~/.ssh/id_ed25519 root@46.225.23.232 \
  'docker logs budget-api-prod 2>&1 | grep -a CategorySplit | tail -3'
```

Expect an `ok groups=N` line whose group count includes the deposit. Then, on the database, confirm the figure was both read and stored, and start the reliability measurement the spec asks for:

```sql
SELECT count(*) FILTER (WHERE deposit_amount IS NOT NULL) AS with_deposit,
       count(*) AS ocr_receipts
FROM expenses
WHERE source = 'ocr' AND created_at > now() - interval '30 days';
```

A deposit on well under half of grocery receipts means the OCR prompt needs work, not the split — record the ratio in the follow-up issue rather than assuming the feature is done.

---

## Notes for the implementer

- **The one way to build this and see nothing happen** is to route the deposit through the model-proposal path. `MIN_PROPOSAL_SHARE_PCT` is 10% and a deposit is 1–2%, so it would be dropped and the only trace would be a `dropped 1 immaterial proposal(s)` log line. Task 3 keeps the deposit out of `proposals` entirely; do not "simplify" it back in.
- **Do not synthesize a fake line item for the deposit.** It would double-count against the tolerance gate (which already has a `deposit` term) and would put an index into `itemIndexes` that matches no real `expense_items` row, which the mobile edit path reads.
- Splits reach mobile analytics only through the pull-and-merge cycle, so a freshly scanned receipt shows its deposit slice on the next pull, not instantly. That is pre-existing behaviour, not a bug to chase.
