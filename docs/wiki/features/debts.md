# Debts and loans

*Hub: [mobile-app](../mobile-app.md) · [api](../api.md) · related:
[wallet-currencies](wallet-currencies.md), [chat-undo-last-action](chat-undo-last-action.md)*

## What this is

Tracks money the user lent to someone or borrowed from someone, with repayments and an optional
due date, plus push reminders around that date. A debt is not its own table: it is an expense
(lent) or an income (borrowed) flagged `isDebt`, so it moves the wallet balance like any other
transaction.

## Entry points

- `apps/api/src/modules/debts/` — `debts.service.ts` (list/summary), `debt-reminder.cron.ts`
- `apps/api/src/modules/notifications/notification-i18n.ts` — `debtUpcoming*` / `debtOverdue*`
  push copy, 9 languages; pinned by `notification-i18n.spec.ts`
- AI chat: `create_debt`, `record_debt_repayment`, `get_debt_summary` (the AI functions list in
  `CLAUDE.md`), handlers in `ai-debt-goal-tools.service.ts`
- Mobile: `app/debts/index.tsx`, `src/components/debts/`, `src/features/debts/debtDisplay.ts`,
  `src/stores/debtStore.ts`; the toggles in `DebtExpenseFields.tsx` / `IncomeCreateForm.tsx`
- User docs: `user_docs/<lang>/17-debts-and-loans.md`

## Key concepts

**Lent = expense, borrowed = income.** A repayment is the opposite kind of transaction linked to
the original (repaying a lent debt is an income; repaying a borrowed one is an expense). Status is
derived: active while a balance remains, paid at zero, overdue past the due date.

**Reminders.** `@Cron('0 9 * * *')` finds active lent and borrowed debts due in 3 days (upcoming)
or whose due date was yesterday (overdue), batches the repayment queries to compute what remains,
and calls `NotificationsService.sendToUser(..., 'debt_reminder')`. Gated by
`user.notifyDebtReminders` (default `true`; toggle in `app/settings/notifications.tsx`, exposed as
`debtReminders` in `NotificationPreferencesResponse`).

## Invariants

- **The reminder goes to the debt's owner only, never to the other party.** The contact is a free
  text name with no account behind it. Anything describing the feature — help pages, adverts —
  must not show the other person being notified.
- **The push body must word `lent` and `borrowed` differently in every language.** The recipient
  can be either side. Polish once shipped the lender's sentence for both, telling borrowers
  "Pożyczyłeś…" (you lent) about money they owe (ABA-628); the spec now fails on any locale whose
  two branches are equal.

## Known gaps

- The push body prints the currency CODE (`50 PLN`), not the app's display symbol.

## History

ABA-628 — Polish borrowed-debt reminder copy; page created from the CLAUDE.md bullet.
