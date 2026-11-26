# Merchant spending caps

*Hub: [api](../api.md) · see also [merchants](merchants.md), [budgets](budgets.md)*

## What this is
A monthly cap for a single merchant, with a progress bar on the Merchants settings screen and a push at 80% and 100%. Independent of budgets: it changes no budget total.

## Entry points
- `apps/api/src/modules/merchant-caps/merchant-caps.service.ts` — CRUD, progress, `checkAccount` (the alert hook).
- `apps/api/src/modules/budgets/budget-alert.service.ts` — `checkBudgetsForAccount` calls the hook (`@Optional()` injection) on every expense write.
- `apps/mobile/src/components/settings/merchants/MerchantCapsCard.tsx`, `src/features/merchants/`.
- Push copy: `merchantCapTitle/Body` in `notification-i18n.ts`.

## Key concepts
- Separate table `merchant_spending_caps`, unique on `(accountId, merchantNormalized)`; key = `trim().toLowerCase()`, the same as the category rules.
- Spend = full `Expense.amount` in the cap's currency for the calendar month; deleted, planned and split-receivable rows excluded. Category splits are not used — the merchant belongs to the whole receipt.
- Alert state is `(lastAlertPeriod, lastAlertThreshold)` on the row; a conditional `updateMany` claims it BEFORE the push and is rolled back if the send fails. Push type is `budget_alert`, so quiet hours and the user's budget-alert switch apply.

## Invariants
- Never writes an Expense/Income or touches a Budget.
- Every query filters by `accountId`; delete matches `{id, accountId}`.
- `checkAccount` never throws (it runs inside the expense write path).
- Merchant match is `equals` insensitive on the stored value, so a stored name with stray whitespace is not matched.

- Spend at a merchant is net of same-currency refunds linked (ABA-854) to a live expense at that merchant, dated in the period (`sumRefundsForExpenses` in `refund-netting.ts`), floored at zero.

## Known gaps
No inline warning at expense entry, no bar in the analytics merchant donut, no Pro limit (hard ceiling 30 per account), calendar month rather than the financial-month anchor.

## History
ABA-853.
