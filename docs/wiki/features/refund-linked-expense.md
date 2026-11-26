# Refund linked to the original expense

*Hub: [api](../api.md) · see also [budgets](budgets.md), [analytics-tab-breakdowns](analytics-tab-breakdowns.md)*

## What this is
An income can be marked as the refund of one expense (`Income.refundOfExpenseId`). Spend then nets out in the original's category, in the **refund's own month**, and the income leaves income totals. Partial refunds are allowed. Status: API + netting in analytics summary and budgets; **no app UI yet**.

## Entry points
- `apps/api/src/common/utils/refund-netting.ts` — `EXCLUDE_REFUND_INCOME`, `attributeRefund`, `sumRefunds`, `netOfRefunds`, `loadRefundsInRange`. The one place the rule lives.
- `apps/api/src/modules/incomes/income-refund.service.ts` — candidates, link, unlink; routes on `incomes.controller.ts` (`GET :id/refund-candidates`, `PUT|DELETE :id/refund-link`).
- Consumers: `analytics.service.ts` `getSummary`; `budgets.service.ts` `getProgress` and `getHistory`.

## Key concepts
- A refund reduces the category of its original expense; with live splits it is shared in proportion to them.
- Refund month, not original month: closed periods never change retroactively.
- A linked income stays in the wallet balance (the cash arrived) but is not earnings, hence a separate predicate from `EXCLUDE_SPLIT_RECEIVABLE`, which is spread on Expense queries too.
- Link rules: same account and currency, not debt/split receivable, no E2EE row on either side, total refunds on one expense ≤ its amount.

## Invariants
- Never add a second literal of the predicate; spread `EXCLUDE_REFUND_INCOME` into every income TOTAL, and never into wallet balance.
- Net spend is clamped at 0 per total; a refund bigger than the period's spend is not negative spend.
- Link resolves the expense by `id` OR `clientId` and writes the resolved server PK.
- The FK is `onDelete: SetNull`; deleting the original un-links silently (the refund then counts as a plain non-income row only until re-linked — see gaps).

- Netting only applies while the original expense is live: `NETTING_REFUND_WHERE` (spend side) and `EXCLUDE_REFUND_INCOME` (income side) are defined together in `refund-netting.ts`, so a refund whose original is soft-deleted counts as ordinary income again. Analytics nets per currency and its category rows sum to the total.

## Known gaps
Totals not yet netted/excluded: safe-to-spend, budget-alert cron, wrapped, story, digest, cash-flow forecast, reports, public-API analytics, gamification, goal planner, and the mobile local budget progress (shared-utils mirror). Income totals in those places still count a linked refund. Also missing: link UI (phone + desktop, 11 locales), "refunded 12 of 40" chip, bank-import preview suggestion, E2EE matching. 

## History
ABA-854.
