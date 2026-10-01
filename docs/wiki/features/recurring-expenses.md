# Recurring expenses

*Hub: [api](../api.md) · related: [subscription-manager](subscription-manager.md),
[safe-to-spend](safe-to-spend.md)*

## What this is

An expense the user marks "Repeat" (weekly, monthly or yearly) is cloned by a daily server cron
when its next occurrence comes due, with a push telling the user it was booked. Distinct from the
[subscription manager](subscription-manager.md), which tracks named subscriptions with their own
renewal dates.

## Entry points

- `apps/api/src/modules/expenses/expense-recurring.cron.ts` — `ExpenseRecurringCron`,
  `@Cron('0 8 * * *')`, `addPeriod`, `fetchRecurringPage`
- `apps/api/src/modules/expenses/expenses.controller.ts` — `PATCH /expenses/:id/stop-recurring`
  → `ExpensesService.stopRecurring`
- `apps/mobile/src/hooks/useRecurringExpenseFields.ts` +
  `apps/mobile/src/components/expenses/RecurringExpenseFields.tsx` — the Repeat toggle and period
  chips, rendered by `src/components/expenses/create/ExpenseCreateForm.tsx` (new expense) and by
  `src/components/expenses/detail/ExpenseDetailsCard.tsx` (start a series on an existing expense)
- `apps/mobile/src/features/dashboard/attentionActions.ts` — the "mark as recurring" action on an
  anomaly `recurring_suggestion` alert
- `apps/mobile/app/expense/[id].tsx` — the "Part of a recurring series" banner and its inline Stop
  Recurring button; `expenseStore.stopRecurringExpense`
- `apps/mobile/src/components/settings/notifications/NotificationsSettings.tsx` — the preference
  toggle

## Key concepts

**A series is a `recurringId`.** Starting a series — from the create form, from the edit card, or
from the mark-as-recurring alert action — sets `isRecurring: true`, a `recurringId` UUID generated
**on the client** (`generateUUID()`; `UpdateExpenseDto.recurringId` accepts it) and
`recurringPeriod`, through the ordinary create or `PATCH /expenses/:id`. Every clone carries the
same `recurringId`.

**The cron.** Streams every `isRecurring` row with a `recurringId` and period through
`paginateById`, keeps the **latest-dated row per `recurringId`** as the series template, computes
`nextDue = lastDate + period`, and when `nextDue <= today` creates a clone dated today (new
`clientId`, `source: 'manual'`) and sends a `recurring_expense` push via
`NotificationsService.sendToUser`.

**Stopping.** `stopRecurring` resolves the expense by `id` or `clientId`, sets `isRecurring: false`
and bumps `syncVersion`. History is preserved; nothing is deleted.

**Preference.** `User.notifyRecurringExpenses` (default `true`) is checked inside `sendToUser`; it
suppresses the push, not the clone. Exposed as `recurringExpenses` on
`GET/PATCH /users/me/notification-preferences`.

## Invariants

**Latest-date wins, compared per row.** Pagination is by `id`, not date, so the template is chosen by
comparing `date` across all rows of the series — "first seen wins" (correct under the old global
`orderBy: date desc`) would now pick an arbitrary instance as the template.

**Never re-roll an existing series' `recurringId`.** The edit card offers the Repeat toggle only
on an expense that is not already recurring, and the alert action tags only the triggering expense,
never its earlier occurrences — the cron clones forward from the latest row regardless of history.

**One failed clone must not stop the run.** Each clone is in its own `try`, logged and skipped.

**Stopping recurrence stops the whole series.** `stopRecurring` clears `isRecurring` on every live
row sharing the `recurringId` in the account, not only the row it was pressed on — the cron picks
its template among rows still recurring, so stopping just the newest instance handed it an older,
already-due copy and the series kept cloning (fixed in ABA-626, pinned by a cron-level test).

## Known gaps

- The clone copies amount, currency, description, notes and category only — not `merchant`, tags,
  project links, line items or splits.
- "Today" and the `nextDue` arithmetic use the server clock, not `user.timezone`.

## History

ABA-457 (paginated, latest-date-wins dedup) ·
ABA-477 (the create-screen sub-form split) · ABA-532 (mark-as-recurring from the alert) ·
ABA-615 (start a series from the edit card).
