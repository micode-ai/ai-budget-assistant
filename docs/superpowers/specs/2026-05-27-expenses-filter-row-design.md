# Expenses-tab Filter Row + Multi-select Merchant + Filtered Total — Design

**Date:** 2026-05-27
**ABA issue:** to be created on completion
**Status:** Approved (design)
**Depends on:** merchant field (ABA-140) + merchant filter (already on the Expenses tab).

## Problem

On the Expenses tab the category and merchant filters render as two separate stacked rows,
the merchant filter is single-select, and there is no running total of the currently filtered
list. Users want: (1) category + merchant filters on one line with the filter-aware total on
that line, (2) multi-select merchants with individual removal.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Layout | One row: `[Category ▾] [Merchants N ▾]  ……  total` (total right-aligned). Category keeps its inline dropdown below the row; merchants open a picker. Income tab: `[Category ▾] …… total` (no merchant pill). |
| Multi-select UX | Merchant picker is multi-select with checkmarks; tapping toggles and stays open; "All merchants" clears. Remove one by one = untick. (No separate removable-chips row.) |
| Total currency | One converted total in the account's main currency (`baseCurrency`) via `convertAmount`. |

## Changes by layer (mobile only)

### 1. `apps/mobile/src/stores/expenseStore.ts`
- `ExpenseFilters`: replace `merchant: string | null` with **`merchants: string[]`**. Default `merchants: []`.
- `getFilteredExpenses`: replace the single-merchant block with:
  ```ts
  if (filters.merchants.length > 0) {
    filtered = filtered.filter((e) => e.merchant != null && filters.merchants.includes(e.merchant));
  }
  ```
  (Search block unchanged — still matches `merchant` substring.)
- No other store method depends on `filters.merchant` (merchant management uses `getDistinctMerchants`/`renameMerchant`, not the filter).

### 2. `apps/mobile/src/utils/total.ts` (new, + test)
```ts
import { convertAmount } from '@/stores/exchangeRateStore';
/** Sum amounts converted to `baseCurrency` using `rates` (relative to base). */
export function sumConverted(
  items: { amount: number; currencyCode: string }[],
  baseCurrency: string,
  rates: Record<string, number>,
): number {
  return items.reduce((s, it) => s + convertAmount(it.amount, it.currencyCode, baseCurrency, rates), 0);
}
```
Unit test with a small `rates` map (e.g. base USD, EUR rate) asserting a mixed-currency sum and the empty case (0).

### 3. `apps/mobile/app/(tabs)/expenses.tsx`
- **Filter row:** replace the two `categoryFilterWrapper` blocks (category + merchant) with a single
  row container (`flexDirection: 'row'`, `alignItems: 'center'`): the category pill, then the
  merchant pill (only when `activeTab === 'expenses'`), then a spacer, then the total
  (`marginLeft: 'auto'`, right-aligned). The category inline dropdown (`categoryPickerContainer`)
  renders **below** this row when `showCategoryPicker` (full width), not inside the pill.
- **Merchant pill label:** `merchants.length === 0 ? t('expenses.merchantAll') : t('expenses.merchantsSelected', { count: merchants.length })`. Active style when `merchants.length > 0`. Opens the picker.
- **Merchant picker (multi-select):** the existing modal becomes multi-select:
  - "All merchants" row → `setExpenseFilters({ merchants: [] })` and close.
  - Each merchant row → toggle membership: `setExpenseFilters({ merchants: next })` where `next`
    adds/removes that name; **does not close** (pick several / untick to remove). Checkmark shows
    membership. A "Done" button (or tap-outside overlay) closes.
- **Total:** computed with `useMemo` from the active tab's filtered list:
  - expenses: `sumConverted(getFilteredExpenses(), base, rates)` → shown as `−{formatCurrency(total, base)}`, color `theme.colors.danger`.
  - income: `sumConverted(getFilteredIncomes(), base, rates)` → `+…`, color `theme.colors.success`.
  - `base = useExchangeRateStore.getState().baseCurrency || user.currencyCode || 'USD'`; `rates` from `useExchangeRateStore`. Subscribe so the total recomputes on rate/expense/filter change (use the store selectors already driving the list).
- Replace the three existing `setExpenseFilters({ merchant: ... })` / `expenseFilters.merchant`
  references with the `merchants` array equivalents.

### 4. i18n (8 locales)
Add `expenses.merchantsSelected` = `"{{count}} selected"` (de/es/fr/pl/ru/ua/be translated). Reuse
`expenses.merchantAll`. `{{count}}` stays literal. (`i18n-add-strings` discipline.)

### 5. Docs (finish-aba-task)
CLAUDE.md: update the merchant-field bullet — filter is now multi-select (`ExpenseFilters.merchants: string[]`), category+merchant on one row with a converted filtered total. user_docs touch-up if needed; ABA issue.

## Edge cases
- Empty `merchants` → no merchant filtering (all). Selecting then unticking all → back to all.
- Rates not loaded / missing currency → `convertAmount` fallback (existing behavior) applies; base-currency rows always convert (base rate = 1).
- Income tab: total uses incomes; no merchant pill (income has no merchant field).
- A selected merchant that no longer exists (renamed/deleted) simply matches nothing — harmless; user can untick it.

## Out of scope
- Removable chips row (decided against — managed in picker).
- Per-currency total breakdown.
- Merchant management screen / capture reconciliation (separate, shipped).
- Income merchant filter.

## Testing
- Unit: `sumConverted` (mixed-currency sum, empty → 0).
- Manual: select 2 merchants → list + total reflect both; untick one → updates; category + merchant + period together → total matches visible list; switch to income tab → total switches to income (green, no merchant pill); multi-currency account → total in main currency.
- `tsc --noEmit` + eslint on changed files.
