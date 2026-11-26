# Contract: amount expression

**`@budget/shared-utils` `evaluateAmountExpression(input, decimals = 2)`** returns `{ ok: true, value, isExpression }` or `{ ok: false, reason }`, with `reason` one of `empty | invalid | divide_by_zero`. Grammar: numbers, `+ - * /` (also `×` `−` `÷`), unary minus, parentheses, whitespace; `,` and `.` are both decimal separators (no thousands separators). A hand-written recursive-descent parser — no `eval`, no `Function`. `value` is rounded to `decimals` places. `isExpression` is false for a plain number, so the preview stays hidden.

**Mobile `parseAmountExpression(text)`** in `src/utils/amount.ts` — the value or `NaN`. `isAmountExpressionInvalid(text)` — true for non-empty text that does not evaluate; forms use it to disable Save.

**`AmountExpressionHelper`** (`src/components/AmountExpressionHelper.tsx`) — preview (`= 18.9`), invalid hint, and an operator row that appends to the text.

**Invariants** — the stored amount is always the evaluated, rounded number, never the text; the API must not import this at runtime; `parseAmount` is untouched and keeps its old behaviour for the other forms.
