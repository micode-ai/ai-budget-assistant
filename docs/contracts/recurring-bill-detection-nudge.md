# Contract: Recurring Bill Detection Nudge

Product idea: `docs/product-ideas/recurring-bill-detection-nudge.md`
Plan: `docs/plans/recurring-bill-detection-nudge-plan.md`

## Summary

Closes the gap ABA-523's budget-projection fix left open: the projection math
now excludes the single largest day's spend from the daily burn rate, but
nothing ever offered to flag a genuinely recurring bill (rent, a subscription
entered by hand) as `isRecurring`, so the same heuristic re-armed every month.

**No new alert type, no new server endpoint, no migration.** The existing
`AnomalyService.detectRecurringSuggestion` detector (3+ same-amount,
same-payee charges at a 25–35 day or 6–8 day cadence) already fires the
`recurring_suggestion` alert for exactly this pattern — on both `checkExpense`
(manual/voice/OCR/bot creation) and `checkExpenseBatch` (import commits). The
only gap was that the alert offered just one action, "Track this
subscription" (writes a `UserSubscription` row). This feature adds a SECOND,
independent action to the SAME alert: "Mark as recurring", which sets
`isRecurring: true` + a fresh `recurringId` + `recurringPeriod` on the
alert's own triggering expense via the existing `PATCH /expenses/:id`
(`UpdateExpenseDto` already accepts all three fields — see
`docs/contracts/recurring-expense.md`).

## Why reuse instead of a new alert type

A new detector matching the identical 3-occurrence/monthly-cadence signal
would fire a SECOND alert for the same underlying pattern (e.g. two separate
alert cards for one rent payment: "track as subscription" and "mark as
recurring"). Reusing the alert and only adding a second action keeps one
signal → one alert → two possible resolutions, matching how the codebase
already treats `recurring_suggestion` as informational-with-actions rather
than write-once.

## Value delivered by "mark as recurring" alone (no budget-projection change)

Marking the expense `isRecurring: true` + `recurringId` immediately:
- Makes `expense-recurring.cron.ts` auto-clone the bill forward each period
  (the user stops re-entering rent by hand).
- Feeds `SafeToSpendService`'s "upcoming recurring expenses" input (mirrors
  the same cron's grouping), so Safe-to-Spend correctly reserves the bill.
- Excludes the expense from ever re-triggering `detectRecurringSuggestion`
  (that detector already skips `expense.isRecurring || expense.recurringId`).
- Surfaces the existing "Part of a recurring series" banner + "Stop
  Recurring" action on the expense detail screen.

Whether `budget-projection.ts` itself should treat a known-recurring amount
as a fixed "already accounted for" obligation (rather than folding it into
the excluded-largest-day heuristic) is explicitly deferred as v2 — see
"Deferred" below.

## Client-side pure logic

`apps/mobile/src/features/dashboard/attentionActions.ts`

```ts
export interface MarkRecurringUpdate {
  expenseId: string;
  isRecurring: true;
  recurringId: string;
  recurringPeriod: RecurringPeriod; // 'weekly' | 'monthly' (never 'yearly' — the detector can't emit it)
}

export function buildMarkRecurringUpdate(
  alert: AnomalyAlert,
  generateId: () => string = generateUUID,
): MarkRecurringUpdate | null;
```

- Returns `null` for any alert type other than `recurring_suggestion`, for a
  missing `expenseId`, or for a `params.cycle` outside `{monthly, weekly}`.
- `recurringId` is generated CLIENT-SIDE (`generateUUID()`, injectable for
  tests) and sent as-is — mirrors `ExpenseCreateForm.tsx`'s own Repeat-toggle
  flow. No server round trip is needed to learn an id before the optimistic
  local write applies.
- Only the alert's own triggering expense is tagged. Prior occurrences in the
  series are NOT retroactively marked (decision, not an oversight — see the
  plan's decision #3).

## Call sites

Both call the pure function then delegate the write to the existing,
already-fire-and-forget `expenseStore.updateExpense`:

1. **Native `app/alerts/index.tsx`** — a small outlined button rendered
   under a `recurring_suggestion` card's body (alongside the existing
   whole-card tap, which still navigates to `/subscriptions/new` for
   Track). Calls `updateExpense`, `markRead`, then `dismiss`.
2. **Desktop `useAlertTapThrough.onMarkRecurring`** + `AttentionPanel.tsx`'s
   new `secondaryActionLabel`/`onSecondaryAction` props on `AttentionRow` —
   rendered as an outlined button beside the existing filled "Track" button.

Dismissing the alert (whether via Track, Mark as recurring, or the plain X)
relies entirely on the EXISTING `recur:{merchantNorm}` dedup key on
`anomaly_alerts` — the detector never fires again for that merchant, so no
new dedup-ledger store was needed.

## Mobile local DB

`updateExpenseInDb` (`src/db/expenseRepository.ts`) gained a `recurring_id`
branch (it previously wrote `is_recurring`/`recurring_period` but silently
dropped `recurringId`) — without it, the local SQLite row would drift from
the in-memory/server state until the next full sync pull backfilled it.

## i18n

One new key, `alerts.markAsRecurring`, in all 9 mobile locale files.

## Deferred (v2, not built here)

- `apps/api/src/common/utils/budget-projection.ts` treating a known
  `isRecurring` amount as a fixed obligation subtracted before the
  excluded-largest-day daily-rate math, rather than relying solely on that
  heuristic. This needs its own design pass (mixing a "fixed obligation" term
  into a formula whose only current inputs are daily totals) and is out of
  scope for this nudge.
- Retroactively tagging prior occurrences with the new `recurringId`.
- Any dedup mechanism beyond the alert's own existing dedupKey (a
  once-per-merchant-ever guarantee was judged sufficient; a "for a while"
  ledger as originally sketched in the product idea was not needed once the
  existing dedupKey was confirmed to already cover it).
