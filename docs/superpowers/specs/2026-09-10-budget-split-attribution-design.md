# Budgets count category splits

**Date:** 2026-09-10
**Status:** design approved, pending implementation plan

## Problem

A budget on a category that a receipt only reaches through a split reads zero.
Reported as: "если в чеке позиции разделены по категориям, потом в бюджет эта
категория не попадает."

Budgets scope spend by the expense's own `categoryId` and never read
`expense_category_splits`:

- `budgets.service.ts:348` — `whereExpenses.categoryId = { in: categoryIds }`, then `_sum: { amount }`
- `budgets.service.ts:286` — the same in `getHistory`
- `budget-alert.service.ts:64,171` — the same in the daily cron, overall and per category
- `budgetStore.ts:504,507` — the mobile client computes progress locally and does the same

`analytics.service.ts:225` already does the opposite: splits when they exist,
the expense's own category when they do not. So the Analytics tab and the
Budgets screen disagree about the same category in the same period.

### Two errors, one cause

A 240 zł Biedronka receipt split Groceries 180 / Household 35 / Kaucja 25:

| Budget on | Today | Correct |
|---|---|---|
| Household | 0 | 35 |
| Kaucja | 0 | 25 |
| Groceries | 240 | 180 |
| Overall (no allocations) | 240 | 240 |

The report names the first two rows. The third is the mirror image and the same
root cause: a Groceries budget currently absorbs the alcohol and the deposit.

## The decision this reverses

ABA-398's locked decision 1 ("Analytics only") states that splits "do NOT count
against category budgets" and lists budget integration as a v1 non-goal. Its
stated rationale is scope plus consistency: "this matches how manual splits
already behave — no new inconsistency is introduced."

That rationale now cuts the other way. Manual splits (`SplitEditor`, no line
items) share the same table and the same defect, so making budgets split-aware
fixes both and removes the inconsistency rather than creating one. The reversal
is deliberate and recorded here.

`SafeToSpendService` is listed in CLAUDE.md as split-blind. It reads neither
budgets nor categories, so the claim is vacuous; correct the wording rather than
change the service.

## Decisions

1. **Full attribution, both directions.** Splits decide when present; the
   expense's own category takes the whole amount when absent. Existing budget
   numbers will move down for anyone who scans receipts. Accepted: Budgets and
   Analytics start reporting one number.
2. **Ship everything at once.** The API deploys on push; native screens follow
   at the next store release. Until then a native user can receive a push about
   a budget their app still shows at 0%. Accepted.
3. **Fix the two neighbouring divergences in the same lines** — see below.

## Rule

One function, on top of the existing `attributeToCategories`:

```
attributableAmountForCategories(expense, categoryIds): number
```

Live splits present ⇒ the sum of those whose `categoryId` is in the set.
No live splits ⇒ the whole `amount` when the expense's own category is in the
set, otherwise zero. Soft-deleted splits never count.

`attributeToCategories` already holds this rule and its own doc comment calls
itself "the one place the rule lives". Adding a second implementation would
recreate exactly the drift it exists to prevent, so the new helper is built on
it, in the same file.

**Move the file** from `modules/ai/utils/category-attribution.ts` to
`common/utils/category-attribution.ts`. Two modules consume it now, and
`common/utils/` is where this repo keeps shared pure logic
(`budget-projection.ts`, `receipt-category-split.ts`, `expense-filters.ts`,
`fx.ts`).

**Mirror** in `packages/shared-utils/src/formatting/category-attribution.ts` for
the mobile client. This is the repo's standing duplicated-pair convention
(`financial-month.ts`, `wallet-currencies.ts`, `budget-projection.ts`), forced by
the API having no build step and being unable to import `@budget/shared-utils` at
runtime — the `check-no-shared-utils-runtime-import.sh` deploy guard enforces it.
Both copies carry the same case table.

`attributeToCategories` today reads `expense.category?.id`, the relation, because
its existing callers need the category *name* for narration. Budgets need only
the id and have no reason to join the table. Widen `AttributableExpense` with an
optional scalar `categoryId` preferred over `category?.id` when present, rather
than forcing an `include` on every budget query — one field, no behaviour change
for the existing callers. The mobile mirror reads the same scalar plus
`expense.splits` (`ExpenseCategorySplit[]`, already carrying `categoryId` and
`isDeleted`).

### Only category-scoped budgets change path

A budget with no allocations sums everything, and by the Σ invariant the splits
of an expense sum to its amount, so attribution returns the identical number.
Overall budgets keep the existing cheap `aggregate`; only budgets with
`categoryAllocations` switch to `findMany({ include: { categorySplits } })`. This
keeps the daily cron's cost bounded to the budgets that actually need it.

## Call sites

| File | What changes |
|---|---|
| `budgets.service.ts` `getProgress` | `spent`, the daily groups feeding the projection, `categoryBreakdown` |
| `budgets.service.ts` `getHistory` | `actual` per period |
| `budget-alert.service.ts` | overall threshold and per-category threshold |
| `budgetStore.ts` `getBudgetProgress` | `spent`, `categoryBreakdown` |

`get_budget_status` calls `getProgress` and is fixed for free.

`categoryBreakdown` must use attributed amounts too, or its rows stop summing to
`spent`. The projection's `dailyTotals` must be attributed and then grouped by the
expense's date in JS — a rate computed on unattributed money would be wrong in
exactly the cases this fixes.

## Two divergences fixed in the same lines

`budgets.service.ts` builds `whereExpenses` without two filters that its own
siblings apply:

- **`EXCLUDE_SPLIT_RECEIVABLE`** — `budget-alert.service.ts:56,174` and
  `budgetStore.ts:481` (`filterConsumption`) both apply it. Without it, a receipt
  split with friends inflates the server's budget number. The server and the
  phone already disagree today for anyone who splits bills.
- **`isPlanned: false`** — a planned expense from an approved purchase request has
  not happened. `loadAllExpenses` filters it out at the SQL level on mobile, so
  the phone already excludes it; the API does not.

Both are added to `getProgress`, `getHistory` and the cron. Without them the chat
and the pushes would keep disagreeing with the screen after the split fix lands,
which defeats the point.

## Edge cases

- **Σ invariant.** `buildCategorySplits` creates it and `rebuildCategorySplits`
  defends it, so attribution can never total more than the expense. Two budgets
  that both include one category still both count it — already true today, and
  correct.
- **Currency.** A split has none of its own; the `budget.currencyCode` filter
  stays at the expense level and no FX is introduced. Budgets remain
  single-currency by design.
- **Deposit (Kaucja).** The deposit split leaves the receipt's own category for
  its own. A Groceries budget stops counting it. Correct by the rule, and visible
  — worth saying in the release notes.
- **Manual splits** are fixed by the same change, since they live in the same
  table.
- **Retroactive by construction.** Splits are already stored, so current and
  historical periods both correct themselves. There is no forward-only option
  short of an artificial date gate, and none is wanted.

## Rollout side effect

On the first cron run after deploy, budgets on split-only categories acquire
non-zero spend. `BudgetAlert` dedup is keyed
`(budgetId, categoryId, thresholdPercentage, periodStart)` and the loop sends one
push per un-alerted crossed threshold, so a single budget can emit two or three
pushes at once (50/80/100).

This is not new behaviour — any sudden jump does it — but the deploy triggers it
for every affected user simultaneously. **Accepted.** The affected population is
small (it needs a budget on a category fed only by splits) and the information is
correct and until now withheld.

The opposite direction is silent: a budget whose spend drops crosses no threshold
and sends nothing. Already-sent alert rows for the period stay and are harmless.

Rejected alternative: a data migration pre-inserting `notificationSent: true` rows
for the current period. Available if the burst turns out worse than expected.

## Testing

- `common/utils/category-attribution.spec.ts` — the new helper: splits present,
  splits absent, split-only category, own-category-with-splits, soft-deleted
  splits ignored, empty set, non-numeric amounts.
- A parity assertion between the API copy and the shared-utils mirror. The
  duplicated-pair convention has a known drift failure mode; a test must catch it,
  not review.
- Extend `budgets.service.spec.ts` (`getProgress` has three tests today) and
  `budget-alert.service.spec.ts` (seven).
- `budgetStore.getBudgetProgress` has no test today. Add one for attribution if
  the store's dependencies mock cleanly; the pure pair carries the real coverage
  either way.

## Non-goals

- FX across currencies in budgets. Unchanged.
- Splits for bank/Wise imports or manual entry — neither has line items.
- Tier-2 (fully E2EE) accounts — the server cannot read encrypted line items, and
  their splits do not exist server-side.
- Any change to how splits are produced.

## Documentation to update

- CLAUDE.md: the ABA-398 paragraph ("Budgets are deliberately untouched"), the
  `attributeToCategories` paragraph ("do not wire this util into them"), the false
  Safe-to-Spend claim, and the deferred-items list.
- `docs/superpowers/specs/2026-08-12-receipt-category-autosplit-design.md`: mark
  locked decision 1 superseded by this document.
- `user_docs/*/` budget and receipt-split sections, all nine languages.
