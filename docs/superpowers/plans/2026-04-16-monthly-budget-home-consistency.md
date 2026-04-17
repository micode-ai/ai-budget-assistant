# Monthly Budget Home-Screen Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "Monthly Budget" card on home use the same semantics as the budgets tab/detail by sourcing its numerator from `getBudgetProgress` per-budget, aggregated via a new `getMonthlyBudgetSummary` selector.

**Architecture:** Add one selector to `budgetStore` that iterates active monthly budgets, uses existing `getBudgetProgress` for numerator per budget, converts both amount and spent to the user's base currency, and returns `{ totalAmount, totalSpent, budgetCount, isOverall }`. Home screen consumes the summary directly. `getTotalBudget` is removed (single caller). `convertedExpenseTotal` stays untouched for other consumers.

**Tech Stack:** Zustand, no new deps. No API, no Prisma, no shared-types, no SQLite.

**Spec:** `docs/superpowers/specs/2026-04-16-monthly-budget-home-consistency-design.md`

**Testing reality:** No unit tests for screens or stores in this project. Verification is `tsc --noEmit`, `eslint`, and manual on Expo dev server.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/mobile/src/stores/budgetStore.ts` | modify | Add `getMonthlyBudgetSummary`; remove `getTotalBudget` |
| `apps/mobile/app/(tabs)/index.tsx` | modify | Replace `getTotalBudget` + `convertedExpenseTotal` budget-card use with `getMonthlyBudgetSummary`; add `budgetCount > 0` render guard |

No files created. No deletions. No i18n keys.

---

## Task 1: Add `getMonthlyBudgetSummary` to `budgetStore`

**Files:**
- Modify: `apps/mobile/src/stores/budgetStore.ts` (interface near line 46; implementation near line 539)

- [ ] **Step 1: Update the `BudgetState` interface**

Find the interface at around lines 44-47:

```ts
  getBudgetProgress: (budgetId: string) => BudgetProgress | null;
  getTotalBudget: () => number;
  reset: () => void;
}
```

Replace with:

```ts
  getBudgetProgress: (budgetId: string) => BudgetProgress | null;
  getMonthlyBudgetSummary: () => {
    totalAmount: number;
    totalSpent: number;
    budgetCount: number;
    isOverall: boolean;
  };
  reset: () => void;
}
```

- [ ] **Step 2: Replace the `getTotalBudget` implementation**

Find the `getTotalBudget` block at around lines 539-561. Replace the whole block with:

```ts
    getMonthlyBudgetSummary: () => {
      const activeMonthly = get().budgets.filter(
        (b) => b.isActive && !b.isDeleted && b.period === 'monthly',
      );

      const { rates, baseCurrency } = useExchangeRateStore.getState();
      const convertToBase = (amount: number, fromCurrency: string) => {
        if (!baseCurrency || fromCurrency === baseCurrency) return amount;
        const rate = rates[fromCurrency];
        if (!rate || rate === 0) return amount;
        return amount / rate;
      };

      if (activeMonthly.length === 0) {
        return { totalAmount: 0, totalSpent: 0, budgetCount: 0, isOverall: false };
      }

      const overall = activeMonthly.find(
        (b) => !b.categoryId && (!b.categoryAllocations || b.categoryAllocations.length === 0),
      );

      if (overall) {
        const progress = get().getBudgetProgress(overall.id);
        const spent = progress ? progress.spent : 0;
        return {
          totalAmount: convertToBase(overall.amount, overall.currencyCode),
          totalSpent: convertToBase(spent, overall.currencyCode),
          budgetCount: activeMonthly.length,
          isOverall: true,
        };
      }

      let totalAmount = 0;
      let totalSpent = 0;
      for (const b of activeMonthly) {
        totalAmount += convertToBase(b.amount, b.currencyCode);
        const progress = get().getBudgetProgress(b.id);
        if (progress) {
          totalSpent += convertToBase(progress.spent, b.currencyCode);
        }
      }

      return {
        totalAmount,
        totalSpent,
        budgetCount: activeMonthly.length,
        isOverall: false,
      };
    },
```

Verify there are no other usages of `getTotalBudget` before removing (plan already confirmed only `index.tsx` references it).

- [ ] **Step 3: Typecheck (will fail on home screen until Task 2)**

```bash
cd apps/mobile && npm run typecheck
```

Expected: TypeScript errors in `app/(tabs)/index.tsx` about `getTotalBudget` not existing. This is the intermediate state; Task 2 fixes it. Do NOT edit the home screen in this task.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/stores/budgetStore.ts
git commit -m "feat(mobile): add getMonthlyBudgetSummary selector to budget store"
```

The commit is intentionally broken-at-tip for typecheck because the consumer isn't yet updated. Task 2 is the follow-up. If you want an unbroken commit, do Tasks 1 and 2 atomically — acceptable alternative.

---

## Task 2: Wire home-screen budget card to the new summary

**Files:**
- Modify: `apps/mobile/app/(tabs)/index.tsx` (around lines 42, 83-84, 101, 251)

- [ ] **Step 1: Swap the store destructure**

Find at line ~42:

```tsx
  const { getTotalBudget } = useBudgetStore();
```

Replace with:

```tsx
  const { getMonthlyBudgetSummary } = useBudgetStore();
```

- [ ] **Step 2: Compute summary-backed values**

Find the block at lines 83-84:

```tsx
  const totalBudget = getTotalBudget();
  const budgetUsedPercent = totalBudget > 0 ? (convertedExpenseTotal / totalBudget) * 100 : 0;
```

Replace with:

```tsx
  const monthlyBudgetSummary = getMonthlyBudgetSummary();
  const totalBudget = monthlyBudgetSummary.totalAmount;
  const budgetSpent = monthlyBudgetSummary.totalSpent;
  const budgetUsedPercent = totalBudget > 0 ? (budgetSpent / totalBudget) * 100 : 0;
```

Find at line ~101:

```tsx
  const remaining = totalBudget - convertedExpenseTotal;
```

Replace with:

```tsx
  const remaining = totalBudget - budgetSpent;
```

- [ ] **Step 3: Add render guard**

Find at around line 251:

```tsx
        {widgetVisibility.monthlyBudget && <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => router.push('/(tabs)/budgets')}>
```

Replace the condition to include `budgetCount > 0`:

```tsx
        {widgetVisibility.monthlyBudget && monthlyBudgetSummary.budgetCount > 0 && <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => router.push('/(tabs)/budgets')}>
```

Do NOT touch the JSX inside the card — `totalBudget`, `budgetUsedPercent`, and `remaining` are already the variables it reads.

Do NOT touch the separate usage of `convertedExpenseTotal` at line 292 (the "Total expenses" widget).

- [ ] **Step 4: Typecheck**

```bash
cd apps/mobile && npm run typecheck
```

Expected: clean, no errors.

- [ ] **Step 5: Lint**

```bash
cd apps/mobile && npm run lint 2>&1 | grep -E "\(tabs\)/index\.tsx|budgetStore\.ts" || echo "no new warnings"
```

Expected: `no new warnings`.

- [ ] **Step 6: Manual smoke**

From `apps/mobile/` run `npx expo start --web`. Sign in, on Home:

- With an overall monthly budget (no category), verify the card shows the same "spent / total" that the budget detail shows.
- With only categorised monthly budgets, verify card shows Σspent / Σamount and unrelated-category expenses do NOT inflate the percent.
- With no monthly budget, verify the card is hidden even if the toggle is on.
- Bar clamps at 100% on over-budget; remaining can be negative.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/app/\(tabs\)/index.tsx
git commit -m "feat(mobile): align home monthly-budget card with per-budget progress"
```

---

## Task 3: Full integration verification

**Files:** No code changes.

- [ ] **Step 1: Root typecheck + lint**

```bash
npm run typecheck
npm run lint
```

Expected: typecheck clean. Lint shows the same pre-existing 47 warnings — no new ones introduced.

- [ ] **Step 2: Walk the spec's manual test plan**

From `docs/superpowers/specs/2026-04-16-monthly-budget-home-consistency-design.md` § Manual test plan, walk each checkbox on the dev server:

- [ ] Scenario A: overall 1500 UAH, spend 400 UAH total → home shows 400/1500 ≈ 27%; budgets tab matches
- [ ] Scenario B: Food 500 + Transport 300, spend 200+100+150 (last uncovered) → home 300/800 ≈ 37.5%; budgets tab per-budget matches; Entertainment NOT in numerator
- [ ] Scenario C: overall 1500 + Food 500 → home card matches overall row on the list
- [ ] No monthly budgets → card hidden
- [ ] Mixed currencies → conversion works; card in base currency
- [ ] Widget toggled off → card hidden
- [ ] No current-month expenses → 0/amount, 0%
- [ ] Over-budget → percent > 100%, bar capped at 100%, remaining negative

- [ ] **Step 3: Follow-up commit if manual testing reveals regressions**

If so, fix and commit with a descriptive message. Otherwise skip.

---

## Out-of-scope reminders

- Do not touch `getBudgetProgress`, `convertAmount`, `exchangeRateStore`.
- Do not rename or replace `convertedExpenseTotal` — it stays for the "Total expenses" card.
- Do not modify `(tabs)/budgets.tsx` or `app/budget/[id].tsx` — they already use `getBudgetProgress` correctly.
- Do not add a label explaining which subset of budgets the card represents — spec says no extra UI.
- Do not add unit tests for stores or screens; project doesn't test them.
