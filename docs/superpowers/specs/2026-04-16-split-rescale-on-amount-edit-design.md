# Rescale Splits on Expense Amount Edit — Design

**Date:** 2026-04-16
**Status:** Approved by user (brainstorming phase)
**Scope:** Mobile app (`apps/mobile`) only. No API, shared-types, or DB schema changes.

## Problem

`apps/mobile/app/expense/[id].tsx:287-301` — `handleSaveEdit` updates the
expense's `amount` via `updateExpense`, but does nothing with category splits.
When the user edits the total amount of an expense that already has splits
(`splits.length > 0`), the split amounts keep their old values. The invariant
`sum(splits.amount) === expense.amount` silently breaks and the UI shows
inconsistent data (e.g. total $200, splits summing to $100 with stale
percentages).

Users observed this and reported: "если редактируешь сумму, когда у тебя чек
разделён, то сумма меняется, а в разделении сумма старая."

## Goal

When `handleSaveEdit` changes `amount` and splits exist, rescale every split
proportionally so the invariant holds:

```
new_split.amount = round(old_split.amount * new_total / old_total, 2)
new_split.percentage = (new_split.amount / new_total) * 100
```

Then save the rescaled splits to SQLite and fire-and-forget to the server
using the same path as the existing `handleSaveSplits`.

## Non-goals

- No changes to `walletStore`, `expenseStore`, Prisma, shared-types, API.
- No UI notification/toast about the rescale — the splits simply update
  on-screen after save.
- No opt-out to keep old split amounts, no opt-out to clear splits. A single
  invariant: amount changed ⇒ splits follow proportionally.
- No changes to the receipt-item edit flow (`handleSaveItem` /
  `handleDeleteItem`) — those do not currently modify `expense.amount`, so
  splits are not affected. If that ever changes, it's a separate task.
- No changes to the `SplitEditor` component itself.

## User flow

1. User opens an existing expense that has splits.
2. User taps Edit, changes the amount field, taps Save.
3. `handleSaveEdit`:
   - Parses and validates `numericAmount` (unchanged behaviour).
   - Calls `updateExpense(...)` to persist the new amount (unchanged).
   - If `splits.length > 0` AND `numericAmount !== expense.amount`:
     - Rescales the local `splits` array.
     - Calls a new shared `persistSplits` helper that writes to SQLite and
       syncs to the server. Updates local state.
4. The detail screen re-renders; the split list shows the new amounts, and
   their percentages are recomputed to sum to 100%. Total and split sum match.

### Rounding

Scaling a currency amount by a non-integer ratio introduces rounding
errors of up to ½ cent per split. Summing N rounded splits can diverge from
the new total by up to N × 0.01. To preserve the exact invariant:

1. Round each non-last split to 2 decimal places.
2. Assign the last split the remainder: `new_total - sum(other_new_splits)`.
   This guarantees the sum is exact even when the ratio introduces fractional
   cents.

Percentages are recomputed from the final rounded amounts, not scaled
directly, so the displayed percentages stay consistent with the stored
amounts.

### Same-amount short-circuit

If `numericAmount === expense.amount`, no rescale is needed — skip the split
update entirely. This avoids unnecessary SQLite writes and server round-trips
when the user edits other fields (description, date, category) without
touching the amount.

### Empty-split short-circuit

If `splits.length === 0`, nothing to rescale. The existing code path is
preserved untouched.

## Implementation outline

**File touched (mobile only):** `apps/mobile/app/expense/[id].tsx`.

### Extract a shared `persistSplits` helper

The current `handleSaveSplits` (lines 303-336) handles:
- Deleting all existing splits via `deleteAllSplitsForExpense(id)`
- Inserting a fresh set via `insertSplit(...)`
- Updating local `splits` state
- Fire-and-forget to `api.setExpenseSplits(id, ...)`

Extract this persistence logic into a private async helper inside the
component, callable from both:
1. `handleSaveSplits` (existing SplitEditor path) — unchanged behavior.
2. `handleSaveEdit` (new amount-rescale path).

Signature:

```ts
const persistSplits = async (
  nextSplits: Array<{ categoryId: string; amount: number; percentage: number; notes?: string }>
): Promise<void> => { /* delete all, insert each, update state, sync to server */ };
```

The helper accepts a plain-object shape (not full `ExpenseCategorySplit`) so
both callers can pass their natural data without boilerplate.

### Rescale logic in `handleSaveEdit`

Inline function in the handler:

```ts
if (splits.length > 0 && numericAmount !== expense.amount) {
  const ratio = numericAmount / expense.amount;
  const rescaled = splits.map((s, i) => {
    const isLast = i === splits.length - 1;
    // Non-last: scale and round to 2dp. Last: remainder.
    // Computed after we know the non-last sums, so we iterate twice.
    return { categoryId: s.categoryId, amount: s.amount * ratio, percentage: 0, notes: s.notes };
  });
  // Round all except last, then assign remainder to last
  let runningSum = 0;
  const finalSplits = rescaled.map((s, i) => {
    let amount: number;
    if (i === rescaled.length - 1) {
      amount = Math.round((numericAmount - runningSum) * 100) / 100;
    } else {
      amount = Math.round(s.amount * 100) / 100;
      runningSum += amount;
    }
    return {
      categoryId: s.categoryId,
      amount,
      percentage: numericAmount > 0 ? (amount / numericAmount) * 100 : 0,
      notes: s.notes,
    };
  });
  await persistSplits(finalSplits);
}
```

Note: `expense.amount` is the OLD value at the time `handleSaveEdit` fires,
before `updateExpense` mutates the store. Reading `expense.amount` before
calling `updateExpense` captures the correct baseline. Either order works
(read old value into a local first, or call update after rescale) — the
rescale only needs the old value, so capturing it into a local `const
oldAmount = expense.amount;` at the top of the handler is the safest form.

### Ordering

1. Capture `const oldAmount = expense.amount;` (before any mutation).
2. Validate parsed amount (unchanged).
3. `updateExpense(expense.id, { amount: numericAmount, ... })` — existing call.
4. If rescale conditions met, compute `finalSplits` and `await persistSplits(finalSplits)`.
5. `setIsEditing(false)` — existing call.

If `persistSplits` throws (unlikely, but possible from SQLite), the local
`splits` state stays stale; the expense update already succeeded. The UI will
still show an inconsistent state until the user reloads. Acceptable for this
pass — the SQLite repository errors are already `console.error`'d in
`handleSaveSplits`; we follow the same pattern. A failed server sync leaves
`syncStatus=pending` (already how `setExpenseSplits` works) and retries on
next sync cycle.

## Manual test plan

- [ ] Expense $100 with splits 30/70: edit to $200 → A=$60 (30%), B=$140 (70%), sum = $200.
- [ ] Same expense: edit to $50 → A=$15, B=$35.
- [ ] Same expense: re-open edit, tap Save without changing amount → splits unchanged, no DB write (verify by checking no log of `setExpenseSplits` call).
- [ ] Expense $100, splits 33.33/33.33/33.34 (odd thirds): edit to $200 → last split absorbs remainder; sum equals $200 exactly.
- [ ] Expense $100, no splits: edit amount → existing behaviour, no split side-effects.
- [ ] Offline: edit amount on split expense → local splits update immediately, `syncStatus=pending` on splits, sync completes when online.
- [ ] Server sync: after successful rescale, open the expense on another device → splits reflect the new amounts.

## Risks / open questions

- **Negative amounts.** `updateExpense` existing validation rejects
  `numericAmount <= 0`. Rescale never runs for invalid inputs. No additional
  guard needed.
- **Large ratio (e.g. $1 → $10,000).** Rescale is a pure multiplication;
  floats stay accurate far beyond typical currency ranges. No concern.
- **Split count ≥ 10.** `SplitEditor` caps splits at 10 entries; no
  performance concern for the rescale loop.
- **Concurrent edits from two devices.** The server's split endpoint replaces
  all splits on each call (`api.setExpenseSplits`). If two devices rescale
  simultaneously, last-writer-wins — same behaviour as today's split edit
  flow. Out of scope for this fix.
