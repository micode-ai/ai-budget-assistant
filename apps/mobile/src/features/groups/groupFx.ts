import { formatCurrency, SUPPORTED_CURRENCIES } from '@budget/shared-utils';
import type { GroupExpense } from '@budget/shared-types';
import { parseAmount } from './groupSplit';

/**
 * Pure multi-currency logic for the group expense form and the activity rows (ABA-654). The SERVER
 * converts, once, at write time, and stores both figures; nothing here converts a stored expense.
 * The form only previews `amount * rate` so the user sees what will be stored, and decides whether to
 * send a manual rate. Unit-tested because nothing renders in CI.
 *
 * Rate convention, as on the server: `rate` is the value of ONE unit of the entry currency in the
 * group currency (1 EUR = 4.3167 PLN), and the stored amount is `round2(entryAmount * rate)`.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The currencies an expense may be entered in: the group's first, then the app's list. */
export function entryCurrencies(groupCurrency: string): string[] {
  return [groupCurrency, ...SUPPORTED_CURRENCIES.map((c) => c.code).filter((c) => c !== groupCurrency)];
}

/** True when the expense was entered in another currency than the group's. */
export function isForeignExpense(
  expense: Pick<GroupExpense, 'originalCurrency' | 'originalAmount'>,
  groupCurrency: string,
): boolean {
  return !!expense.originalCurrency && expense.originalCurrency !== groupCurrency && expense.originalAmount !== null;
}

export interface FxAmountParts {
  /** As entered, e.g. "€12.00". */
  original: string;
  /** The stored group-currency figure, e.g. "51.80 zł". */
  converted: string;
  /** "€12.00 → 51.80 zł" */
  line: string;
}

/** The two figures of a converted expense, as stored; null for an expense in the group currency. */
export function fxAmountParts(
  expense: Pick<GroupExpense, 'amount' | 'originalCurrency' | 'originalAmount'>,
  groupCurrency: string,
): FxAmountParts | null {
  if (!isForeignExpense(expense, groupCurrency)) return null;
  const original = formatCurrency(expense.originalAmount as number, expense.originalCurrency as string);
  const converted = formatCurrency(expense.amount, groupCurrency);
  return { original, converted, line: `${original} → ${converted}` };
}

/** A rate the user typed ("4,3167" or "4.3167"); 0 when it is not a usable positive number. */
export function parseRate(text: string): number {
  const n = parseAmount(text);
  return n > 0 && n <= 1_000_000 ? Math.round(n * 1e8) / 1e8 : 0;
}

/** What the server will store for this entry amount at this rate (display only). */
export function convertedPreview(entryAmount: number, rate: number): number {
  return entryAmount > 0 && rate > 0 ? round2(entryAmount * rate) : 0;
}

/** The form's starting currency and rate text: an edited expense restores what it was entered with. */
export function initialFxState(
  existing: Pick<GroupExpense, 'amount' | 'originalCurrency' | 'originalAmount' | 'fxRate'> | null,
  groupCurrency: string,
): { currency: string; rateText: string; entryAmountText: string } {
  if (existing && isForeignExpense(existing, groupCurrency)) {
    return {
      currency: existing.originalCurrency as string,
      rateText: existing.fxRate !== null ? String(existing.fxRate) : '',
      entryAmountText: String(existing.originalAmount),
    };
  }
  return { currency: groupCurrency, rateText: '', entryAmountText: existing ? String(existing.amount) : '' };
}

/** A foreign entry needs a usable rate (the provider's, or one the user typed) before it can be saved. */
export function fxIssue(currency: string, groupCurrency: string, rateText: string): 'rate' | null {
  if (currency === groupCurrency) return null;
  return parseRate(rateText) > 0 ? null : 'rate';
}

/**
 * The FX part of the request body. `currencyCode` always goes (the server treats the group's own as
 * "no conversion"); `fxRate` only when the user overrode the rate, so an untouched rate means "use the
 * provider's" on create and "reuse the stored one" on an edit (the server's edit rule).
 */
export function buildFxBody(input: {
  currency: string;
  groupCurrency: string;
  rateText: string;
  rateEdited: boolean;
}): { currencyCode: string; fxRate?: number } {
  if (input.currency === input.groupCurrency || !input.rateEdited) return { currencyCode: input.currency };
  const rate = parseRate(input.rateText);
  return rate > 0 ? { currencyCode: input.currency, fxRate: rate } : { currencyCode: input.currency };
}

/** 400 FX_RATE_UNAVAILABLE: the server had no rate and none was given. */
export function isFxRateUnavailable(e: unknown): boolean {
  const err = e as { status?: number; code?: string } | null;
  return !!err && err.status === 400 && err.code === 'FX_RATE_UNAVAILABLE';
}
