# Expenses Filter Row + Multi-select Merchant + Filtered Total — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Expenses tab, put the category + merchant filters on one row with a filter-aware converted total, and make the merchant filter multi-select with per-item removal.

**Architecture:** Mobile-only. `ExpenseFilters.merchant: string | null` → `merchants: string[]`; one filter row in `(tabs)/expenses.tsx` with the two pills + a right-aligned total; merchant picker becomes multi-select; total = sum of the active tab's filtered list converted to the main currency via a small tested `sumConverted` util.

**Tech Stack:** Expo/React Native, Zustand, Jest (jest-expo), i18n (8 locales), `exchangeRateStore.convertAmount`.

**Spec:** `docs/superpowers/specs/2026-05-27-expenses-filter-row-design.md`.

**Conventions:** Branch `development`. Commit per task. Do NOT push. Do NOT bump version. Update all 8 locales together.

---

### Task 1: `sumConverted` utility (TDD)

**Files:**
- Create: `apps/mobile/src/utils/total.ts`
- Test: `apps/mobile/src/utils/__tests__/total.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/utils/__tests__/total.test.ts`:
```ts
import { sumConverted } from '../total';

describe('sumConverted', () => {
  // rates are relative to base (USD): EUR 0.5 means 1 USD = 0.5 EUR
  const rates = { USD: 1, EUR: 0.5 };
  it('sums amounts converted to the base currency', () => {
    const items = [
      { amount: 100, currencyCode: 'USD' },
      { amount: 10, currencyCode: 'EUR' }, // 10 EUR -> 20 USD
    ];
    expect(sumConverted(items, 'USD', rates)).toBe(120);
  });
  it('returns 0 for an empty list', () => {
    expect(sumConverted([], 'USD', rates)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `cd apps/mobile && npx jest src/utils/__tests__/total.test.ts`
Expected: FAIL — `Cannot find module '../total'`.

- [ ] **Step 3: Implement**

Create `apps/mobile/src/utils/total.ts`:
```ts
import { convertAmount } from '@/stores/exchangeRateStore';

/**
 * Sum `items` amounts converted into `baseCurrency` using `rates`
 * (each rate relative to the base). Used for the Expenses/Income filter-row total.
 */
export function sumConverted(
  items: { amount: number; currencyCode: string }[],
  baseCurrency: string,
  rates: Record<string, number>,
): number {
  return items.reduce(
    (sum, it) => sum + convertAmount(it.amount, it.currencyCode, baseCurrency, rates),
    0,
  );
}
```

- [ ] **Step 4: Run it, expect PASS**

Run: `cd apps/mobile && npx jest src/utils/__tests__/total.test.ts`
Expected: PASS (2 tests). (Note: `convertAmount` uses `amount / fromRate * toRate`; with the rates above, 10 EUR → 10/0.5*1 = 20 USD, total 120.)

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/utils/total.ts apps/mobile/src/utils/__tests__/total.test.ts
git commit -m "feat(mobile): add sumConverted utility with tests"
```

---

### Task 2: store — multi-select merchant filter

**Files:**
- Modify: `apps/mobile/src/stores/expenseStore.ts`

- [ ] **Step 1: Change the filter type + default**

In `interface ExpenseFilters`, replace `merchant: string | null;` with:
```ts
  merchants: string[];
```
In the store's default `filters` object (~line 119), replace `merchant: null,` with:
```ts
      merchants: [],
```

- [ ] **Step 2: Update `getFilteredExpenses`**

Replace the existing merchant filter block:
```ts
      // Apply merchant filter
      if (filters.merchant) {
        filtered = filtered.filter((e) => e.merchant === filters.merchant);
      }
```
with:
```ts
      // Apply merchant filter (multi-select)
      if (filters.merchants.length > 0) {
        filtered = filtered.filter((e) => e.merchant != null && filters.merchants.includes(e.merchant));
      }
```
(Leave the `searchQuery` block — which also matches `merchant` — unchanged.)

- [ ] **Step 3: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json`
Expected: FAIL — `(tabs)/expenses.tsx` still references `expenseFilters.merchant` / `setExpenseFilters({ merchant })`. That's expected; Task 3 fixes the screen. (Confirm the only errors are in `expenses.tsx`.)

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/stores/expenseStore.ts
git commit -m "feat(mobile): multi-select merchant filter (merchants: string[])"
```

---

### Task 3: Expenses tab — one filter row, multi-select picker, total

**Files:**
- Modify: `apps/mobile/app/(tabs)/expenses.tsx`

- [ ] **Step 1: Imports + currency state + total**

Add imports near the other store imports:
```ts
import { useExchangeRateStore } from '@/stores/exchangeRateStore';
import { sumConverted } from '@/utils/total';
```
After the `const expenses = getFilteredExpenses();` / `const incomes = getFilteredIncomes();` lines (~83-84), add:
```ts
  const rates = useExchangeRateStore((s) => s.rates);
  const baseCurrencyRaw = useExchangeRateStore((s) => s.baseCurrency);
  const baseCurrency = baseCurrencyRaw || 'USD';
  const filteredTotal = sumConverted(activeTab === 'expenses' ? expenses : incomes, baseCurrency, rates);
```
(`formatCurrency` is already imported and used in the row renderers.)

- [ ] **Step 2: Replace the two stacked filter blocks with one row + dropdown-below**

Replace the entire Category Filter IIFE block AND the Merchant Filter IIFE block (from `{/* Category Filter */}` through the end of the merchant block — currently ~lines 391-485) with:

```tsx
      {/* Filter row: category + merchant pills + filtered total */}
      {(() => {
        const isExpense = activeTab === 'expenses';
        const currentFilters = isExpense ? expenseFilters : incomeFilters;
        const selectedCategory = categories.find((c) => c.id === currentFilters.categoryId);
        const hasCat = currentFilters.categoryId !== null;
        const hasMerchants = expenseFilters.merchants.length > 0;
        const accent = isExpense ? theme.colors.primary : theme.colors.success;
        return (
          <>
            <View style={styles.filterRow}>
              <TouchableOpacity
                style={[styles.categoryFilterButton, styles.filterPill, hasCat && (isExpense ? styles.categoryFilterButtonActive : styles.categoryFilterButtonActiveIncome)]}
                onPress={() => setShowCategoryPicker(!showCategoryPicker)}
              >
                <Ionicons name={(selectedCategory?.icon as any) || 'pricetag-outline'} size={14} color={hasCat ? accent : theme.colors.textTertiary} />
                <Text style={[styles.categoryFilterButtonText, hasCat && (isExpense ? styles.categoryChipTextActive : styles.categoryChipTextActiveIncome)]} numberOfLines={1}>
                  {selectedCategory ? selectedCategory.name : t('expenses.categoryAll')}
                </Text>
                <Ionicons name={showCategoryPicker ? 'chevron-up' : 'chevron-down'} size={14} color={hasCat ? accent : theme.colors.textTertiary} />
              </TouchableOpacity>

              {isExpense && (
                <TouchableOpacity
                  style={[styles.categoryFilterButton, styles.filterPill, hasMerchants && styles.categoryFilterButtonActive]}
                  onPress={() => setShowMerchantPicker(true)}
                >
                  <Ionicons name="storefront-outline" size={14} color={hasMerchants ? theme.colors.primary : theme.colors.textTertiary} />
                  <Text style={[styles.categoryFilterButtonText, hasMerchants && styles.categoryChipTextActive]} numberOfLines={1}>
                    {hasMerchants ? t('expenses.merchantsSelected', { count: expenseFilters.merchants.length }) : t('expenses.merchantAll')}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color={hasMerchants ? theme.colors.primary : theme.colors.textTertiary} />
                </TouchableOpacity>
              )}

              <Text style={[styles.filterTotal, { color: isExpense ? theme.colors.danger : theme.colors.success }]} numberOfLines={1}>
                {isExpense ? '−' : '+'}{formatCurrency(filteredTotal, baseCurrency)}
              </Text>
            </View>

            {showCategoryPicker && (
              <View style={styles.categoryFilterWrapper}>
                <View style={styles.categoryPickerContainer}>
                  <ScrollView style={styles.categoryPickerScroll} nestedScrollEnabled>
                    <TouchableOpacity
                      style={[styles.categoryPickerItem, !hasCat && styles.categoryPickerItemSelected]}
                      onPress={() => {
                        if (isExpense) setExpenseFilters({ categoryId: null });
                        else setIncomeFilters({ categoryId: null });
                        setShowCategoryPicker(false);
                      }}
                    >
                      <Ionicons name="list-outline" size={18} color={!hasCat ? accent : theme.colors.textSecondary} />
                      <Text style={[styles.categoryPickerItemText, !hasCat && (isExpense ? styles.categoryChipTextActive : styles.categoryChipTextActiveIncome)]}>
                        {t('expenses.categoryAll')}
                      </Text>
                      {!hasCat && <Ionicons name="checkmark" size={18} color={accent} style={styles.categoryPickerCheck} />}
                    </TouchableOpacity>
                    {categories.map((cat) => {
                      const isSelected = currentFilters.categoryId === cat.id;
                      return (
                        <TouchableOpacity
                          key={cat.id}
                          style={[styles.categoryPickerItem, isSelected && styles.categoryPickerItemSelected]}
                          onPress={() => {
                            if (isExpense) setExpenseFilters({ categoryId: cat.id });
                            else setIncomeFilters({ categoryId: cat.id });
                            setShowCategoryPicker(false);
                          }}
                        >
                          <Ionicons name={(cat.icon as any) || 'pricetag-outline'} size={18} color={isSelected ? accent : theme.colors.textSecondary} />
                          <Text style={[styles.categoryPickerItemText, isSelected && (isExpense ? styles.categoryChipTextActive : styles.categoryChipTextActiveIncome)]}>
                            {cat.name}
                          </Text>
                          {isSelected && <Ionicons name="checkmark" size={18} color={accent} style={styles.categoryPickerCheck} />}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
            )}
          </>
        );
      })()}
```

- [ ] **Step 3: Make the merchant picker multi-select**

Replace the merchant `<Modal>` block (currently ~lines 705-733) with:
```tsx
      <Modal visible={showMerchantPicker} transparent animationType="slide" onRequestClose={() => setShowMerchantPicker(false)}>
        <TouchableOpacity style={styles.merchantModalOverlay} activeOpacity={1} onPress={() => setShowMerchantPicker(false)}>
          <View style={styles.merchantModalSheet}>
            <View style={styles.merchantModalHeader}>
              <Text style={styles.merchantModalTitle}>{t('expenses.merchant')}</Text>
              <TouchableOpacity onPress={() => setShowMerchantPicker(false)}>
                <Text style={styles.merchantDone}>{t('common.done')}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              <TouchableOpacity
                style={styles.merchantRow}
                onPress={() => setExpenseFilters({ merchants: [] })}
              >
                <Text style={styles.merchantRowText}>{t('expenses.merchantAll')}</Text>
                {expenseFilters.merchants.length === 0 && <Ionicons name="checkmark" size={18} color={theme.colors.primary} />}
              </TouchableOpacity>
              {getDistinctMerchants().map((m) => {
                const selected = expenseFilters.merchants.includes(m);
                return (
                  <TouchableOpacity
                    key={m}
                    style={styles.merchantRow}
                    onPress={() => setExpenseFilters({
                      merchants: selected
                        ? expenseFilters.merchants.filter((x) => x !== m)
                        : [...expenseFilters.merchants, m],
                    })}
                  >
                    <Text style={styles.merchantRowText} numberOfLines={1}>{m}</Text>
                    {selected && <Ionicons name="checkmark" size={18} color={theme.colors.primary} />}
                  </TouchableOpacity>
                );
              })}
              {getDistinctMerchants().length === 0 && (
                <Text style={styles.merchantEmpty}>{t('expenses.merchantNone')}</Text>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
```

- [ ] **Step 4: Add the new styles**

In the `createStyles` object add (near `categoryFilterButton`):
```ts
  filterRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[2],
    zIndex: 10,
  },
  filterPill: {
    flexShrink: 1,
  },
  filterTotal: {
    marginLeft: 'auto' as const,
    fontSize: 15,
    fontWeight: '700' as const,
    flexShrink: 0,
  },
  merchantModalHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[3],
  },
  merchantDone: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.primary,
  },
```
(The pre-existing `merchantModalTitle` already has a `marginBottom`; that's fine inside the header row.)

- [ ] **Step 5: Typecheck + lint**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && npx eslint "app/(tabs)/expenses.tsx"`
Expected: PASS (no more `expenseFilters.merchant` singular refs; confirm none remain with `grep -n "filters.merchant\b\|\.merchant " app/(tabs)/expenses.tsx` showing only `.merchants`).

- [ ] **Step 6: Commit**

```bash
git add "apps/mobile/app/(tabs)/expenses.tsx"
git commit -m "feat(mobile): one-line category+merchant filters with multi-select and filtered total"
```

---

### Task 4: i18n — `merchantsSelected` (8 locales)

**Files:** `apps/mobile/src/i18n/locales/{en,de,es,fr,pl,ru,ua,be}.ts`

REQUIRED SUB-SKILL: `i18n-add-strings`.

- [ ] **Step 1: Add the key** to the `expenses` namespace in each locale (`{{count}}` literal):
  - en: `merchantsSelected: '{{count}} selected',`
  - de: `'{{count}} ausgewählt',`
  - es: `'{{count}} seleccionados',`
  - fr: `'{{count}} sélectionnés',`
  - pl: `'Wybrano: {{count}}',`
  - ru: `'Выбрано: {{count}}',`
  - ua: `'Вибрано: {{count}}',`
  - be: `'Выбрана: {{count}}',`

- [ ] **Step 2: Verify**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json` and `grep -l "merchantsSelected" src/i18n/locales/*.ts | wc -l` → 8.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/i18n/locales
git commit -m "feat(mobile): add merchantsSelected i18n key (8 locales)"
```

---

### Task FINAL: verify + docs + ABA issue

- [ ] **Step 1: Full verify**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && npx jest src/utils/__tests__/total.test.ts src/utils/__tests__/merchant.test.ts`
Expected: tsc PASS; tests PASS.

- [ ] **Step 2: CLAUDE.md** — update the merchant bullet: the Expenses-tab merchant filter is now **multi-select** (`ExpenseFilters.merchants: string[]`); category + merchant filters share one row with a right-aligned **converted filtered total** (`sumConverted` over the active tab's filtered list, in `baseCurrency`).

- [ ] **Step 3: user_docs (8 locales)** — in `03-expenses-and-income.md`, note that you can filter by multiple merchants at once and see the filtered total. Then `npm run generate:help` from repo root.

- [ ] **Step 4: ABA issue** — `gh issue list --limit 1 --state all --json number,title` → N+1; create `ABA-{N}: Expenses filter row — one line, multi-select merchants, filtered total` (English; Problem/Implementation/Out-of-scope).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md user_docs apps/mobile/src/help/content.ts
git commit -m "docs: expenses filter row + multi-select merchant + total"
```

---

## Self-Review

**Spec coverage:** `merchants: string[]` + default + filter ✔ (Task 2); `sumConverted` util+test ✔ (Task 1); one filter row with category+merchant pills + right-aligned converted total, category dropdown below ✔ (Task 3 Step 2); income tab total + no merchant pill ✔ (Step 2 `isExpense` gating); multi-select picker (toggle, stays open, "All" clears, Done closes) ✔ (Step 3); i18n `merchantsSelected` ✔ (Task 4); docs/issue ✔ (FINAL).

**Placeholder scan:** none — full JSX/code in every step; i18n values explicit per locale.

**Type/name consistency:** `merchants: string[]` (store interface + default + getFilteredExpenses + all expenses.tsx refs), `sumConverted(items, baseCurrency, rates)` (util + test + screen), `filteredTotal`/`baseCurrency`/`rates` (screen), styles `filterRow`/`filterPill`/`filterTotal`/`merchantModalHeader`/`merchantDone`, i18n `expenses.merchantsSelected` (screen + 8 locales). `common.done` reused (already in locales).

**Risks for implementer:**
- Task 2 intentionally leaves `expenses.tsx` failing tsc until Task 3 — run them in order; the only tsc errors after Task 2 must be in `expenses.tsx`.
- After Task 3, grep to confirm NO singular `expenseFilters.merchant` (without `s`) remains.
- The category-dropdown JSX in Step 2 is the existing dropdown moved below the row — preserve `categoryPickerContainer`/`categoryPickerScroll`/`categoryPickerItem*` style names (they already exist).
- `filterTotal` uses `marginLeft: 'auto'` to right-align; pills use `flexShrink: 1` and `numberOfLines={1}` so a long category/merchant label truncates instead of pushing the total off-screen.
