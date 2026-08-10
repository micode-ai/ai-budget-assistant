import type { AmountColumnMapping, ColumnMapping } from '@budget/shared-types';

/**
 * Structural equality for the `amount` field of a `ColumnMapping`, which is
 * either a single column name or a `{ debit, credit }` pair — never both, so
 * a string on one side and an object on the other is always unequal, not a
 * type error to guard against.
 */
function amountMappingsEqual(a: AmountColumnMapping, b: AmountColumnMapping): boolean {
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  return a.debit === b.debit && a.credit === b.credit;
}

/**
 * Structural comparison of two `ColumnMapping`s — by value, not by reference
 * or JSON string order. This is what tells a genuine correction (the user
 * changed a column the AI/signature dictionary got wrong) from a commit that
 * merely carries the same mapping it was given (a plain AI-inferred import,
 * or a trip through the mapper where nothing was actually changed).
 *
 * `currency`/`counterparty` are optional columns: `undefined` and an absent
 * key must compare equal, so both sides are normalized to `undefined` before
 * comparing rather than compared as object keys.
 */
export function columnMappingsEqual(a: ColumnMapping, b: ColumnMapping): boolean {
  return (
    a.date === b.date &&
    amountMappingsEqual(a.amount, b.amount) &&
    a.description === b.description &&
    (a.currency ?? undefined) === (b.currency ?? undefined) &&
    (a.counterparty ?? undefined) === (b.counterparty ?? undefined)
  );
}
