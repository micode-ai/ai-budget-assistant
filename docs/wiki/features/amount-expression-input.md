# Amount expression input

## What this is
The amount field on the expense and income create forms accepts a small sum such as `12.50+3.20*2`. A live result shows under the field and the stored amount is the evaluated number.

## Entry points
- `packages/shared-utils/src/formatting/amount-expression.ts` — `evaluateAmountExpression`
- `apps/mobile/src/utils/amount.ts` — `parseAmountExpression`, `isAmountExpressionInvalid`
- `apps/mobile/src/components/AmountExpressionHelper.tsx` — operator row, preview, hint
- Contract: `docs/contracts/amount-expression.md`

## Key concepts
A hand-written recursive-descent parser; `,` and `.` are both decimals; result rounded to two places. The decimal pad has no operator keys, so the helper renders an operator row that appends to the text.

## Invariants
- Never `eval`: only digits, operators and brackets are accepted.
- The form stores the evaluated number, never the text.
- Save is disabled while non-empty text does not evaluate.
- `parseAmount` is unchanged for forms not yet migrated.

## Known gaps
Edit forms and the transfer, debt and goal forms still use the plain field. The expression is not kept in the note. Thousands separators are not supported.

## History
ABA-851.
