# Contract: credit card statement cycle

## `common/utils/card-cycle.ts` (pure; mirror `packages/shared-utils/src/formatting/card-cycle.ts`)
- `clampDay(year, monthIndex, day) -> number` — a statement/due day 29..31 clamps to the month's last day.
- `currentCycle(today: Date, statementDay: number) -> { start: Date; end: Date; statementDate: Date }` — `statementDate` is the next statement day on/after today; the cycle covers `(previous statement day, statementDate]` by calendar date (the statement day itself belongs to the closing cycle). `start` is the day after the previous statement day.
- `nextDueDate(statementDate: Date, dueDay: number) -> Date` — the first `dueDay` strictly after the statement date.
- `lastClosedCycle(today, statementDay)` — the cycle that closed most recently (its statement is what is currently payable).
- `daysUntil(from: Date, to: Date) -> number` — whole calendar days.
All dates are date-only, local-calendar, no `toISOString()`.

## API (`modules/card-cycles`, `JwtAuthGuard + AccountContextGuard`)
- `GET /card-cycles` -> `CardCycleSummary[]` for the request account's cards (0 or 1 row in v1).
- `PUT /card-cycles` body `{ statementDay 1..31, dueDay 1..31, creditLimit? number>0, currencyCode }` — upsert; `@UseGuards(new ViewerBlockGuard())`.
- `DELETE /card-cycles` — remove the setting; viewer-blocked.
- `CardCycleSummary = { accountId, currencyCode, statementDay, dueDay, creditLimit|null, cycleStart, cycleEnd(statement date), dueDate, spent, utilisation|null, daysToDue, statementAmount|null }` (dates `YYYY-MM-DD`).
- `spent` = sum of non-deleted, non-planned `Expense.amount` in the cycle with `currencyCode` equal to the card currency; excluded: `isSplitReceivable`. Other-currency expenses are not summed (not converted).

## Cron `CardCycleReminderCron` (daily 09:00 UTC)
Paginated by id. For each setting whose `dueDate - today == 3`, push the closed cycle's amount to the account owner (`sendToUser`, type `debt_reminder`), at most once per cycle: `lastRemindedDueDate` on the row.

## Invariants
- Never an Expense/Income written by this feature; payment stays an AccountTransfer.
- Setting is account-scoped: every query filters by `accountId`.
- Copy never gives interest or minimum-payment advice and says the cut-off is by transaction date.
