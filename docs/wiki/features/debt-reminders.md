# Debt reminders

*Hub: [api](../api.md) · related: [recurring-expenses](recurring-expenses.md),
[gamification](gamification.md)*

## What this is

A daily push about money lent or borrowed: three days before a debt's due date, and the day after
it became overdue. Only debts with something still outstanding are mentioned.

## Entry points

- `apps/api/src/modules/debts/debt-reminder.cron.ts` — `DebtReminderCron.handleDebtReminders`
  (`@Cron('0 9 * * *')`), `notifyLentDebts`, `notifyBorrowedDebts`
- `apps/api/src/modules/notifications/notifications.service.ts` — `sendToUser`, where the
  preference gate lives
- `apps/mobile/src/components/settings/notifications/NotificationsSettings.tsx` — the toggle
  (rendered by `app/settings/notifications.tsx`)

## Key concepts

**What a debt is.** A lent debt is an `Expense` with `isDebt: true`; a borrowed debt is an
`Income` with `isDebt: true`. Repayments are rows on the opposite side flagged `isDebtRepayment`
and linked back to the debt (`relatedDebtExpenseId` for a lent debt).

**Four passes per run** — lent/upcoming, lent/overdue, borrowed/upcoming, borrowed/overdue — each
streaming the debts whose `debtDueDate` falls in the window (the whole day three days ahead, or the
whole of yesterday) through `paginateById`.

**Remaining balance per batch.** For each batch the repayments are fetched for that batch's debt ids
only, summed per debt, and a debt whose remaining amount is `<= 0` is skipped. The push names the
contact and the remaining amount, localized server-side.

**Preference.** `User.notifyDebtReminders` (default `true`), exposed as `debtReminders` on
`GET/PATCH /users/me/notification-preferences`; enforced by `sendToUser` for the `debt_reminder`
type, not by the cron.

## Invariants

**Scope the repayment lookup to the batch.** Fetching repayments for the whole day's debt set is
what the pagination was introduced to avoid; the per-batch `in: debtIds` keeps memory bounded.

**A fully repaid debt is never reminded about**, even if its due date is in the window — the
reminder is about money still owed.

**Sends are fire-and-forget with a logged rejection** (`logFireAndForget`), so one failed push does
not stop the run.

## Known gaps

- Only the debt's creator (`userId`) is notified, not other members of a shared account.
- The windows are computed on the server clock, not `user.timezone`.
- An overdue debt is reminded about once (the day after it fell due), never again.

## History

ABA-457 (paginated; per-batch repayment lookup).
