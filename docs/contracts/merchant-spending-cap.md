# Contract: merchant spending cap

## Key
`merchantKey(raw) = raw.trim().toLowerCase()` — identical to the merchant category rules key.

## Model `MerchantSpendingCap` (`merchant_spending_caps`)
`id, accountId, userId, merchantNormalized, merchantLabel, amount Decimal(12,2), currencyCode, lastAlertPeriod String?(YYYY-MM), lastAlertThreshold Int?, createdAt, updatedAt`.
`@@unique([accountId, merchantNormalized])`, cascade from account and user.

## API (`modules/merchant-caps`, `JwtAuthGuard + AccountContextGuard`)
- `GET /merchant-caps` -> `MerchantSpendingCap[]` with `spent`, `percentUsed` for the current calendar month.
- `PUT /merchant-caps` body `{ merchant, amount>0, currencyCode }` — upsert on key; resets alert state; viewer-blocked; max 30 per account.
- `DELETE /merchant-caps/:id` — viewer-blocked, scoped by `accountId`.
- `MerchantCapsService.checkAccount(accountId, currencyCode)` — called fire-and-forget from `BudgetAlertService.checkBudgetsForAccount`; never throws.

## Alerts
Thresholds 80 and 100. At most one push per threshold per month: the row stores `(lastAlertPeriod, lastAlertThreshold)`; the row is claimed with a conditional `updateMany` BEFORE the push and rolled back when the send fails. Push type `budget_alert` (inherits the user's budget-alert switch and quiet hours).

## Invariants
- Never changes any Budget total and never writes an Expense/Income.
- Every query filters by `accountId`; delete resolves the row by `{id, accountId}`.
- Copy says "spent at <merchant>", never advice.
