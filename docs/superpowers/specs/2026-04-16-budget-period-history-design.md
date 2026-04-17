# Budget Period History — Design

**Date:** 2026-04-16
**Status:** Approved by user (brainstorming phase)
**Scope:** Mobile app (`apps/mobile`) only. No API, shared-types, or DB schema changes.

## Problem

Budgets recur on a period (`daily`, `weekly`, `monthly`, `yearly`, `custom`).
`getBudgetProgress` in `apps/mobile/src/stores/budgetStore.ts` always
computes the period window from `new Date()`. The moment a period rolls
over (e.g. April → May for a monthly budget), the previous period's state
vanishes from the UI — the `spent` counter resets from the raw expenses
that still live in the database.

Users want to look back at how past periods went ("In March I had $1500
budget, spent $1200, 80%"). The raw expense data is already preserved —
it's just not reachable from the budget detail screen.

## Goal

Make the budget detail screen (`app/budget/[id].tsx`) let the user
navigate to previous periods of the same budget, computing `spent`,
`remaining`, `percentageUsed`, and the per-category breakdown for that
historical window.

## Non-goals

- No snapshot table, no new Prisma schema. Historical data is derived
  from existing expense rows on the fly.
- No historical tracking of budget-amount changes. If the user edited the
  amount from $1000 to $1500 at some point, retrospective views use the
  current `amount`. Documented limitation for v1.
- No forward-looking simulation of future periods.
- No changes to the budget list (`(tabs)/budgets.tsx`), home card, or
  analytics.
- No archive UI for inactive budgets.
- No API changes, no shared-types changes.

## Approach

### Extend `getBudgetProgress` with an optional reference date

Current signature:
```ts
getBudgetProgress: (budgetId: string) => BudgetProgress | null;
```

New signature (backward compatible — no caller needs to change):
```ts
getBudgetProgress: (budgetId: string, referenceDate?: Date) => BudgetProgress | null;
```

Inside the implementation, replace the hard-coded `new Date()` with a
parameter that defaults to `now = referenceDate ?? new Date()`. Every
`getStartOfWeek`/`getStartOfMonth`/etc. call already uses `now`, so only
the declaration line changes. All other logic (filtering expenses by the
computed period, computing `daysRemaining`, projections, etc.) continues
to work — the only behavioral difference is which period is considered
"current".

**Consequence for projections in past periods:** `estimatedExhaustionDate`
and `projectedTotal` are computed from `dailyAverage` and `daysRemaining`
relative to the `now` parameter. For a past period, `daysRemaining` will
be 0 (the end of the period is earlier than the real current time) — the
existing `daysRemaining = Math.max(0, ...)` already clamps this. The
`estimatedExhaustionDate` block is only set when
`dailyBurnRate > 0 && !isOverBudget` AND the projected exhaustion falls
within the period. For past periods the UI will hide these values
explicitly (see below), so subtle edge cases in projection math don't
matter — we won't display them.

### Period-navigation UI on `app/budget/[id].tsx`

Add a navigation row above the existing progress card, styled like the
analytics screen's `monthPickerRow` (`apps/mobile/app/(tabs)/analytics.tsx`).

Layout:
```
  ‹   <period label>   ›
```

- Left chevron (`chevron-back`): step back one period; disabled when the
  previous period would start before `budget.startDate`.
- Right chevron (`chevron-forward`): step forward one period; disabled
  when the next period would start at or after today's "current" period.
- Label format depends on `budget.period`:
  - `monthly` → "March 2026" (via `toLocaleDateString(..., { month: 'long', year: 'numeric' })`)
  - `yearly`  → "2026"
  - `weekly`  → "Mar 10 – Mar 16" (range via `toLocaleDateString`)
  - `daily`   → "March 16, 2026"
  - `custom`  → navigation row hidden entirely (a custom budget is a
    single bounded period by definition; there's no "previous").

Stepping rules (always applied to the period-start date of the current view):
- `monthly`: subtract/add 1 month to `referenceDate`; internally we store
  a `referenceDate = getStartOfMonth(...)`.
- `yearly`: subtract/add 1 year.
- `weekly`: subtract/add 7 days.
- `daily`: subtract/add 1 day.
- `custom`: N/A (navigation hidden).

### Hide projection widgets for past periods

Compute `const isCurrentPeriod = <ref is within today's period>`. When
`!isCurrentPeriod`:
- Hide the `daysRemaining` row (currently rendered at
  `app/budget/[id].tsx:526-527`).
- Hide the `projectedTotal` row (currently rendered at
  `app/budget/[id].tsx:531-538`). A projection for a completed period
  is meaningless.
- `estimatedExhaustionDate` is **not rendered on the detail screen
  today** — it's computed in the store but has no JSX row. Nothing to
  hide. No new render for it in this change.

When `isCurrentPeriod === true`, the screen renders exactly as today.

### `isCurrentPeriod` check

Compare `referenceDate`'s computed period window vs. today's period
window. Implementation sketch:

```ts
function periodsMatch(
  period: BudgetPeriod,
  a: Date,
  b: Date,
): boolean {
  // Already-imported helpers used by budgetStore:
  switch (period) {
    case 'daily':
      return a.toDateString() === b.toDateString();
    case 'weekly':
      return getStartOfWeek(a).getTime() === getStartOfWeek(b).getTime();
    case 'monthly':
      return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
    case 'yearly':
      return a.getFullYear() === b.getFullYear();
    case 'custom':
      return true; // no alternate periods
  }
}
```

Either include this helper inline on the screen or promote to a shared
utility. Scope note: we will inline it to avoid introducing a new export
unless a second consumer shows up.

### Capping navigation

Backward cap: the step button is disabled when the candidate previous
period would start before `budget.startDate`. Compute the candidate start
date (subtract one period) and compare via `getStartOfMonth(candidate)` vs
`getStartOfMonth(budget.startDate)` (or the period-appropriate bucket).

Forward cap: the step button is disabled when `isCurrentPeriod === true`.

## Implementation outline

**Files touched (mobile only):**

1. `apps/mobile/src/stores/budgetStore.ts`
   - Update `BudgetState.getBudgetProgress` signature to accept optional `referenceDate?: Date`.
   - In the implementation (currently ~line 420-537), change
     `const now = new Date();` to `const now = referenceDate ?? new Date();`.
   - No other changes to the function body.

2. `apps/mobile/app/budget/[id].tsx`
   - Add `const [referenceDate, setReferenceDate] = useState(new Date());`.
   - Pass `referenceDate` to `getBudgetProgress(budget.id, referenceDate)`.
   - Import `getStartOfWeek` from `@budget/shared-utils` for use in the
     `periodsMatch` helper (currently not imported in this file).
   - Compute `isCurrentPeriod` via the local `periodsMatch` helper.
   - Add a period-picker row above the progress card when `budget.period !== 'custom'`.
   - Handlers `goToPrevPeriod` / `goToNextPeriod` mutate `referenceDate`
     according to `budget.period`.
   - Label formatter returns a string per period type using `toLocaleDateString(getIntlLocale(), ...)`.
   - Disable backward chevron when the previous period would start before `budget.startDate`.
   - Disable forward chevron when `isCurrentPeriod`.
   - Wrap the `daysRemaining` row (lines 525-528) and the `projectedTotal`
     row (lines 531-538) with `isCurrentPeriod &&`. No `estimatedExhaustionDate` row exists on this screen today; do not add one.

3. `apps/mobile/src/i18n/locales/{en,de,es,fr,pl,ru,ua,be}.ts` — 8 files.
   - Potentially add one key for weekly period label interpolation, e.g.
     `budgetDetail.weekRange: '{{from}} – {{to}}'`. If locales already
     have a suitable range pattern, skip. We'll default to a plain
     `${from} – ${to}` string if no i18n key is warranted — a short
     month-day range is language-neutral enough to not require a key per
     spec's YAGNI bias.

**No changes to:**
- Prisma, shared-types, API, SQLite schema.
- `(tabs)/budgets.tsx`, `(tabs)/index.tsx`, any analytics screen.
- `SplitEditor`, expense screens, etc.

## Manual test plan

- [ ] Monthly budget, created 2026-01-01, several months of history: open detail → current month shown by default. Tap ‹ → previous month label appears, `spent` reflects that month's expenses. Tap › → returns to current. Backward arrow disabled when reaching the month of `budget.startDate`. Forward arrow disabled on current.
- [ ] Weekly budget: same navigation at 7-day steps. Label shows from–to range.
- [ ] Daily budget: ± 1 day steps, "March 16, 2026" label.
- [ ] Yearly budget: ± 1 year steps, "2025" / "2026".
- [ ] Custom budget: navigation row not rendered at all.
- [ ] Past period: `daysRemaining` row hidden, `estimatedExhaustionDate` hidden.
- [ ] Current period: rendering identical to pre-change (regression check).
- [ ] Category breakdown: works for past periods too (each category's `spent` reflects that period's expenses in that category).
- [ ] Budget with `startDate` in current month: backward arrow disabled immediately.
- [ ] Editing the budget (name, amount) and returning: still lands on current period; navigation continues to work.
- [ ] Account switch: referenceDate resets to current on mount (state is component-local).

## Risks / open questions

- **Budget amount changed mid-way.** Retrospective view uses the current
  `amount`, not the amount that was active at that past time. This is
  the accepted v1 limitation (no snapshot history). Reasonable: most
  users rarely change budget amounts, and those who do understand
  they're looking at a recomputation.
- **Budget `startDate` in the future.** If the user created a budget with
  a future start date, we cap navigation so both arrows start disabled.
  Edge case — not expected to be common.
- **Rolling-period correctness for weekly near DST.** `getStartOfWeek`
  handles DST for the existing paths; our ± 7-days navigation may land
  slightly off around DST boundaries. Mitigation: re-align via
  `getStartOfWeek(candidate)` after the raw step. Same for month boundary
  edge cases with `new Date(year, month-1, 1)`.
- **`custom` budgets.** By hiding the navigation row entirely, we keep
  behaviour identical to today (no regression).
- **Store-level default.** Making `referenceDate` optional means existing
  callers (home screen's `getMonthlyBudgetSummary`, budgets tab) keep
  calling without the argument and get current-period behaviour — no
  regression elsewhere.
