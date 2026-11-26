# Plan: inline calculator in the amount field (amount-field-inline-calculator)

Decisions: no shared amount input existed (each form has its own copy), so an `AmountExpressionHelper` is added under the field and wired into the expense and income create forms (main path). Transfer, debt, goal and edit forms reuse it later. Operator keys come from a small row under the field (decimal-pad has none on either OS). The expression is not kept in the notes.

- [x] 1. Pure parser `evaluateAmountExpression` in `packages/shared-utils/src/formatting/amount-expression.ts`
- [x] 2. Contract `docs/contracts/amount-expression.md`
- [x] 3. Mobile `parseAmountExpression` / `isAmountExpressionInvalid` in `src/utils/amount.ts` + tests
- [x] 4. `AmountExpressionHelper` component (live preview, hint, operator row)
- [x] 5. Wire into `ExpenseCreateForm` and `IncomeCreateForm` (Save disabled when invalid)
- [x] 6. i18n `amountCalc` keys in all 11 locales
- [ ] 7. Follow-up: edit forms, transfer/debt/goal forms
- [x] 8. Wiki page, log line, user docs, frontmatter `status: building`
