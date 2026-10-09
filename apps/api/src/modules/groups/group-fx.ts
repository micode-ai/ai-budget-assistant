import { applyUnitRate } from '../../common/utils/fx';
import { round2 } from '../trip-settle-up/settle-up-calculator';
import { SUPPORTED_RATE_CURRENCIES } from '../currency-exchange/exchange-rate.service';
import type { ShareType } from '../expenses/trip-share-calculator';
import { resolveGroupShares, type RawGroupShare, type ResolvedGroupShare } from './group-ledger';

/**
 * Write-time currency conversion for group expenses (ABA-654). Pure, no DI.
 *
 * The group currency is the LEDGER currency. An expense entered in another currency is converted
 * ONCE, when it is written, and both figures are stored: `amount` (group currency, what the ledger
 * sums) plus `originalAmount` / `originalCurrency` / `fxRate` / `fxRateSource` / `fxRateAt`. Nothing
 * converts at read time, so a settled ledger never drifts with the exchange rate.
 *
 * `fxRate` is the value of ONE unit of the original currency in the group currency (1 EUR = 4.3167
 * PLN) and `amount = round2(originalAmount * fxRate)`; `unitRate` in `common/utils/fx.ts` derives it
 * from the provider's `1 base = rates[X] X` table.
 */

export const GROUP_AMOUNT_MIN = 0.01;
export const GROUP_AMOUNT_MAX = 1_000_000;
/** Bounds of a manual rate: positive, at most 8 decimals (the column is Decimal(18, 8)). */
export const FX_RATE_MAX = 1_000_000;

export type FxRateSource = 'provider' | 'manual';

/** The original-currency columns of a GroupExpense; all null for an expense entered in group currency. */
export interface GroupExpenseFxColumns {
  originalAmount: number | null;
  originalCurrency: string | null;
  fxRate: number | null;
  fxRateSource: FxRateSource | null;
  fxRateAt: Date | null;
}

export const NO_FX: GroupExpenseFxColumns = {
  originalAmount: null,
  originalCurrency: null,
  fxRate: null,
  fxRateSource: null,
  fxRateAt: null,
};

/** A currency an expense may be entered in: the group's own, or one the rate provider covers. */
export function isAllowedEntryCurrency(code: unknown, groupCurrency: string): code is string {
  if (typeof code !== 'string') return false;
  return code === groupCurrency || (SUPPORTED_RATE_CURRENCIES as readonly string[]).includes(code);
}

/** The guest form's list: the group currency first, then the provider's list without it. */
export function entryCurrencyOptions(groupCurrency: string): string[] {
  return [groupCurrency, ...SUPPORTED_RATE_CURRENCIES.filter((c) => c !== groupCurrency)];
}

export function isValidManualRate(rate: unknown): rate is number {
  return (
    typeof rate === 'number' &&
    Number.isFinite(rate) &&
    rate > 0 &&
    rate <= FX_RATE_MAX &&
    Math.round(rate * 1e8) / 1e8 === rate
  );
}

export type ConversionResult =
  | { ok: true; amount: number; fx: GroupExpenseFxColumns }
  | { ok: false; reason: 'out_of_range' };

/**
 * Converts an entry amount at a KNOWN unit rate. `entryCurrency === groupCurrency` stores no FX
 * columns at all. The converted amount must itself be a valid ledger amount (0.01 .. 1 000 000).
 */
export function convertAtRate(
  entryAmount: number,
  entryCurrency: string,
  groupCurrency: string,
  rate: number,
  source: FxRateSource,
  at: Date,
): ConversionResult {
  if (entryCurrency === groupCurrency) return { ok: true, amount: round2(entryAmount), fx: NO_FX };
  const amount = applyUnitRate(entryAmount, rate);
  if (amount < GROUP_AMOUNT_MIN || amount > GROUP_AMOUNT_MAX) return { ok: false, reason: 'out_of_range' };
  return {
    ok: true,
    amount,
    fx: {
      originalAmount: round2(entryAmount),
      originalCurrency: entryCurrency,
      fxRate: rate,
      fxRateSource: source,
      fxRateAt: at,
    },
  };
}

/**
 * Shares of a converted expense (spec F). Equal, percentage and shares are currency-free and resolve
 * on the converted amount directly. An EXACT split is entered in the ORIGINAL currency: it must add
 * up to the original amount (the usual 400 otherwise), and its values are then applied as WEIGHTS to
 * the converted amount, so the shares sum exactly to the stored group amount, residual cent on the
 * last member. The raw values (original currency) are what is stored as `shareValue`, so an edit
 * re-applies them to whatever the converted amount then is.
 */
export function resolveConvertedShares(
  convertedAmount: number,
  originalAmount: number | null,
  splitType: ShareType,
  raw: RawGroupShare[],
): ResolvedGroupShare[] {
  if (originalAmount === null || splitType !== 'exact') return resolveGroupShares(convertedAmount, splitType, raw);
  resolveGroupShares(originalAmount, 'exact', raw); // throws when the exact values do not add up
  return resolveGroupShares(convertedAmount, 'shares', raw).map((s, i) => ({ ...s, shareValue: raw[i].value ?? 0 }));
}

/** What an edit does to the figures (spec F, "Edits"). Pure decision; the service fetches the rate. */
export type EditFxPlan =
  /** Nothing figure-related changed: keep the stored amount and FX columns exactly. */
  | { kind: 'keep' }
  /** Entered (now) in the group currency: the entry amount IS the ledger amount, FX columns cleared. */
  | { kind: 'group'; entryAmount: number }
  /** Same foreign currency, new amount: the STORED rate is reused. */
  | { kind: 'reuse'; entryAmount: number }
  /** A manual rate was given (new currency or a changed rate). */
  | { kind: 'manual'; entryAmount: number; currency: string; rate: number }
  /** A different foreign currency with no override: a new provider rate is needed. */
  | { kind: 'provider'; entryAmount: number; currency: string };

export function planExpenseFxEdit(
  stored: { amount: number; originalAmount: number | null; originalCurrency: string | null; fxRate: number | null },
  groupCurrency: string,
  dto: { amount?: number; currencyCode?: string; fxRate?: number },
): EditFxPlan {
  const storedForeign = stored.originalCurrency !== null && stored.originalCurrency !== groupCurrency;
  const currentCurrency = storedForeign ? (stored.originalCurrency as string) : groupCurrency;
  const nextCurrency = dto.currencyCode ?? currentCurrency;
  const currentEntry = storedForeign && stored.originalAmount !== null ? stored.originalAmount : stored.amount;
  const entryAmount = dto.amount ?? currentEntry;

  if (nextCurrency === groupCurrency) {
    if (!storedForeign && dto.amount === undefined) return { kind: 'keep' };
    return { kind: 'group', entryAmount };
  }
  if (nextCurrency !== currentCurrency) {
    return dto.fxRate !== undefined
      ? { kind: 'manual', entryAmount, currency: nextCurrency, rate: dto.fxRate }
      : { kind: 'provider', entryAmount, currency: nextCurrency };
  }
  if (dto.fxRate !== undefined && dto.fxRate !== stored.fxRate) {
    return { kind: 'manual', entryAmount, currency: nextCurrency, rate: dto.fxRate };
  }
  if (dto.amount !== undefined && dto.amount !== currentEntry) return { kind: 'reuse', entryAmount };
  return { kind: 'keep' };
}
