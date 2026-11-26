# Plan: monthly spending cap for a single merchant (`merchant-spending-cap`)

Decisions on the idea's open questions (non-interactive run, simplest path chosen):
- **Separate table** `merchant_spending_caps` (not a field on `MerchantCategoryRule`): a cap can exist for a merchant with no category rule, and it stays out of rule-reapply logic.
- **Counting**: full `Expense.amount` of rows whose lower-cased trimmed merchant equals the cap key, in the cap's currency, calendar month, excluding deleted, planned and split-receivable rows. Category splits are NOT used (the merchant is a property of the whole receipt). Refunds count as whatever sign the stored amount has.
- **Limit**: no tier gate in v1 (hard ceiling 30 caps per account); a Pro limit is a follow-up.
- **Period**: calendar month (the financial-month anchor is a budget notion; caps do not change any budget).

## Checklist
- [x] Plan + contract (`docs/contracts/merchant-spending-cap.md`)
- [x] Prisma model + migration
- [x] shared-types
- [x] API module + i18n
- [x] Hook into BudgetAlertService
- [x] API unit spec
- [x] Mobile card + 11 locales
- [ ] Wiki page, log line, user docs, finish-aba-task
- [ ] Idea frontmatter `status: building`

## Follow-ups (not in v1)
Inline warning at expense entry; progress bar in the analytics merchant donut; Pro limit; financial-month period.
