# Monthly Budget Home-Screen Consistency — Design

**Date:** 2026-04-16
**Status:** Approved by user (brainstorming phase)
**Scope:** Mobile app (`apps/mobile`) only. No API, shared-types, or DB schema changes.

## Problem

On `apps/mobile/app/(tabs)/index.tsx` (home), the "Monthly Budget" card derives
its numerator and denominator with **different logic** than
`apps/mobile/app/(tabs)/budgets.tsx` and the budget detail page. When the
user inspects the same monthly budget in both places, they see different
numbers.

- Home denominator: `getTotalBudget()` (monthly budgets only, converted to
  user's base currency). Returns the overall monthly budget if one exists,
  otherwise sums all monthly category budgets.
- Home numerator: `convertedExpenseTotal` from `exchangeRateStore` — sum of
  **all current-month expenses** across all currencies converted to base,
  with **no category filter**.
- Budget-detail numerator (via `getBudgetProgress`): per-budget, filtered to
  the budget's currency and its categories/allocations.

Asymmetry sources:
1. **Category filter** — home counts every current-month expense; per-budget
   only counts expenses in the budget's categories. In case B (only
   categorised budgets) this is wrong: expenses in uncovered categories
   inflate the home percentage.
2. **Currency filter** — home converts expense amounts to base currency and
   sums; `getBudgetProgress` only counts expenses whose `currencyCode`
   matches the budget's currency, no conversion.
3. **Aggregation selection** — `getTotalBudget()` returns only the overall
   budget if one exists, ignoring categorised monthlies.

## Goal

Give the home card a computation that is consistent with the budget-detail
values. When the user taps from home into the budgets list, numbers visible
on the card align with numbers visible on per-budget rows.

## Non-goals

- No change to `getBudgetProgress`.
- No change to the budgets list (`(tabs)/budgets.tsx`) or per-budget detail
  page.
- No change to `convertedExpenseTotal` — it remains the source for the
  "Total expenses" widget at `index.tsx:292`.
- No new UI elements describing which subset of budgets the card represents.
- No API, no shared-types, no Prisma, no SQLite changes.

## Approach

Introduce a single `getMonthlyBudgetSummary()` selector in `budgetStore`
that aggregates per-budget `getBudgetProgress(id).spent` values and each
budget's amount, both converted to user's base currency. Home uses this
single return value for denominator, numerator, percent, and remaining.

Because the summary numerator is a sum of per-budget `spent` values, and
each `spent` is the SAME value the budget-detail page shows, the home card
numbers become an aggregate of what the user sees when they enter a
budget.

### `getMonthlyBudgetSummary()` signature

```ts
getMonthlyBudgetSummary(): {
  totalAmount: number;   // sum of monthly budget amounts in base currency
  totalSpent: number;    // sum of corresponding spent values in base currency
  budgetCount: number;   // number of monthly budgets included
  isOverall: boolean;    // true if driven by a single overall monthly budget
};
```

### Aggregation rules

Let `activeMonthly = budgets.filter(b => b.isActive && !b.isDeleted && b.period === 'monthly')`.

Define `overall` = the first `activeMonthly` entry with no `categoryId` AND
empty (or absent) `categoryAllocations`. At most one overall is expected in
practice (the budget creation flow enforces a sensible model). If the user
creates two, we pick the first — same behaviour as today's `getTotalBudget`
with `find`.

Branches:

1. **Overall exists** (covers user scenarios A and C):
   - `totalAmount = convertToBase(overall.amount, overall.currencyCode)`
   - `totalSpent = convertToBase(getBudgetProgress(overall.id).spent, overall.currencyCode)`
   - `budgetCount = activeMonthly.length` (informational — we still count all monthlies for the "is this card meaningful" check)
   - `isOverall = true`

2. **No overall, at least one categorised monthly** (scenario B):
   - `totalAmount = Σ convertToBase(b.amount, b.currencyCode)` over `activeMonthly`
   - `totalSpent = Σ convertToBase(progress.spent, b.currencyCode)` where
     `progress = getBudgetProgress(b.id)` (skip the budget if progress is null)
   - `budgetCount = activeMonthly.length`
   - `isOverall = false`

3. **No monthly budgets**:
   - All zero, `budgetCount = 0`, `isOverall = false`.

`convertToBase` uses the existing pattern already in `getTotalBudget`:
```ts
const { rates, baseCurrency } = useExchangeRateStore.getState();
const convertToBase = (amount: number, from: string) => {
  if (!baseCurrency || from === baseCurrency) return amount;
  const rate = rates[from];
  if (!rate || rate === 0) return amount;
  return amount / rate;
};
```

### Home-screen consumption

Replace these three lines (`apps/mobile/app/(tabs)/index.tsx:83, 84, 101`):

```ts
const totalBudget = getTotalBudget();
const budgetUsedPercent = totalBudget > 0 ? (convertedExpenseTotal / totalBudget) * 100 : 0;
...
const remaining = totalBudget - convertedExpenseTotal;
```

with:

```ts
const monthlySummary = getMonthlyBudgetSummary();
const totalBudget = monthlySummary.totalAmount;
const totalSpent = monthlySummary.totalSpent;
const budgetUsedPercent = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
...
const remaining = totalBudget - totalSpent;
```

Rename the local `totalBudget` to preserve the JSX unchanged — or let the
implementer wire the summary straight into the JSX. Either is fine.

Add a visibility guard to the card: the existing condition
`{widgetVisibility.monthlyBudget && ...}` becomes
`{widgetVisibility.monthlyBudget && monthlySummary.budgetCount > 0 && ...}`
so the card doesn't render an awkward empty state when no monthly budget
exists. Users who toggled the card on still see nothing if they have no
monthly budget — consistent with the no-data story on other widgets.

### Remove `getTotalBudget`

`getTotalBudget` has exactly one caller (home screen) and is replaced by
`getMonthlyBudgetSummary`. Remove it from both the `BudgetState`
interface and the store implementation.

## Expected outcomes by scenario

| Scenario | Home card says | Budgets tab says | Aligned? |
|---|---|---|---|
| A. Only overall monthly | `overall.spent / overall.amount` | Same overall's spent/amount on its card | Yes — identical |
| B. Only categorised monthly (N ≥ 1) | `Σ spent_i / Σ amount_i` across all | Each categorised budget shown individually with its own spent/amount | Yes — home is the exact sum of what the list shows |
| C. Overall + categorised | `overall.spent / overall.amount` (same as today's `getTotalBudget` behaviour, but numerator now category-aware via `getBudgetProgress`) | Overall + categorised shown individually | Home card = overall row on list — user can drill into either |
| Nothing | Card hidden | Empty-state in tab | N/A |

## Implementation outline

**Files touched (mobile only):**

1. `apps/mobile/src/stores/budgetStore.ts`
   - Add `getMonthlyBudgetSummary` to `BudgetState` interface.
   - Implement in the store — call `getBudgetProgress` for each included
     budget; use the existing `convertToBase` pattern.
   - Remove `getTotalBudget` from interface and implementation.

2. `apps/mobile/app/(tabs)/index.tsx`
   - Destructure `getMonthlyBudgetSummary` instead of `getTotalBudget`.
   - Derive `totalBudget`, `totalSpent`, `budgetUsedPercent`, `remaining` from it.
   - Drop the dependency on `convertedExpenseTotal` for the budget card.
     `convertedExpenseTotal` is still used for `totalExpenses` (line 292) — do NOT remove that.
   - Add `budgetCount > 0` guard to the card's render condition.

**No changes to:**
- `getBudgetProgress`, `convertAmount`, `exchangeRateStore`, `convertedExpenseTotal`
  wiring (other consumers unaffected).
- Budget list, budget detail, budget new/edit screens.
- API, shared types, Prisma schema, SQLite schema.

## Manual test plan

- [ ] Scenario A: one overall monthly 1500 UAH, spend 300 UAH on Food and 100 UAH on Transport. Home shows 400/1500 ≈ 27%. Tap into budgets tab → overall card shows 400/1500. Match.
- [ ] Scenario B: only Food 500 UAH and Transport 300 UAH (both monthly). Spend 200 UAH Food + 100 UAH Transport + 150 UAH on Entertainment (no budget). Home shows 300/800 ≈ 37.5% (Entertainment NOT counted). Budgets tab: Food 200/500, Transport 100/300. Sum = home.
- [ ] Scenario C: overall 1500 + Food 500. Spend anything. Home shows overall's spent/amount. Budgets tab shows both rows; overall matches home.
- [ ] No monthly budgets: home card hidden even if toggled on.
- [ ] Mixed currencies: budget in USD, base currency UAH. Conversion uses existing rate plumbing; summary values are in UAH; budget detail shows USD. Numbers transform via rates but the card shows them consistently in base currency.
- [ ] Toggle widget off in settings: card hidden regardless.
- [ ] No current-month expenses: card shows 0 / amount, 0%.
- [ ] Over-budget case (spent > amount): percent > 100%, progress bar capped at 100% visually (existing behaviour via `Math.min`), remaining can be negative — verify the existing label handles this (if it already does, no regression).

## Risks / open questions

- **Numerator semantics change in scenarios B and C.** Before this change,
  home's numerator was `convertedExpenseTotal` — all current-month expenses
  across all categories. After this change, numerator only includes expenses
  that fall under a monthly budget's categories (or the overall budget's
  scope). In scenario B this is the intended fix. In scenario A/C the
  numerator equals the overall budget's tracked spend, which in practice
  equals the sum of all expenses in the overall budget's currency — may
  differ from prior behaviour if the user had expenses in currencies other
  than the budget's.
- **Two or more overall monthly budgets.** Defensive: `find` returns the
  first. Same as today's `getTotalBudget`. No UI exists to create two at
  once in the standard flow; if a user has two via sync merge, they should
  clean up — out of scope.
- **Performance.** `getMonthlyBudgetSummary` calls `getBudgetProgress` once
  per monthly budget. Budgets typically number in the single digits; each
  call iterates current-month expenses (a few hundred at most). Negligible.
- **`convertedExpenseTotal` still used elsewhere.** Confirm no other budget
  card on home depends on it; only the "Total expenses" column at line 292.
