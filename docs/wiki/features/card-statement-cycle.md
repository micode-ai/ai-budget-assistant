# Credit card statement cycle

*Hub: [api](../api.md) · [mobile-app](../mobile-app.md) · related:
[account-transfers](account-transfers.md), [safe-to-spend](safe-to-spend.md)*

## What this is

Mark an account as a credit card by giving it a statement day, a payment due day and an optional
credit limit. The wallet screen then shows "this cycle" spend, the statement and due dates, a thin
utilisation bar, and the API pushes a reminder 3 days before the due date with the closed
statement's amount. Paying the card stays an ordinary account transfer.

## Entry points

- `apps/api/src/modules/card-cycles/` — `GET/PUT/DELETE /card-cycles`, `CardCyclesService`,
  `CardCycleReminderCron` (daily 09:00 UTC)
- `apps/api/src/common/utils/card-cycle.ts` ↔ `packages/shared-utils/src/formatting/card-cycle.ts`
- `apps/api/prisma/migrations/20261126120000_card_cycle_settings`
- `apps/mobile/src/components/wallet/CardCycleSection.tsx`

## Invariants

**The setting is its own table (`CardCycleSetting`, one row per account), not a field on
`WalletBalance`.** A balance row is per currency, a card is per account. It is server-only: the
summary is computed from expenses by the API, so there is no SQLite mirror and web works unchanged.

**The cut-off is the transaction date (`Expense.date`)**, and the UI says so. Banks that cut off by
posting date will differ by a day or two; do not silently switch rules.

**`card-cycle.ts` is a deliberately duplicated pair** (API canonical, shared-utils mirror, the API
cannot import shared-utils at runtime). Parity is pinned by `cardCycleParity.test.ts`. Change both.

**A statement day 29–31 clamps to the month's last day**; the statement day itself belongs to the
closing cycle.

**Spend excludes** soft-deleted, planned (`isPlanned`) and split-receivable rows, and counts only the
card's currency. Other currencies are not converted or summed.

**The reminder is at most once per due date** (`lastRemindedDueDate`, written BEFORE the push so a
lost push does not repeat daily; reset when the schedule is edited). An empty statement sends
nothing. It reuses the `debt_reminder` notification type, so the debt-reminders switch gates it.

**No interest or minimum-payment advice**; the data to compute it honestly is not there.

## Known gaps

- The Safe-to-Spend "subtract the unpaid statement" switch is NOT built.
- One card per account; the summary list shape leaves room for more.
