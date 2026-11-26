import { evaluateAmountExpression } from '@budget/shared-utils';

export function parseAmount(value: string): number {
  return parseFloat(value.replace(',', '.'));
}

/** Evaluated value of an amount field that may hold a sum like `12.50+3.20*2`; NaN when invalid. */
export function parseAmountExpression(value: string): number {
  const r = evaluateAmountExpression(value);
  return r.ok ? r.value : NaN;
}

/** True for non-empty text that does not evaluate — Save must stay disabled. */
export function isAmountExpressionInvalid(value: string): boolean {
  if (!value.trim()) return false;
  return !evaluateAmountExpression(value).ok;
}
