import type { WalletMonthlyDeltaPoint } from '@budget/shared-types';

export interface MonthlyDeltaBar {
  month: string;
  label: string;
  /** Net change in the display currency, corrections included. */
  value: number;
  /** The part of `value` that came from balance corrections. */
  adjustment: number;
}

export function sumConverted(
  amounts: Record<string, number> | undefined,
  convert: (amount: number, currency: string) => number,
): number {
  let total = 0;
  for (const [currency, amount] of Object.entries(amounts ?? {})) total += convert(amount, currency);
  return total;
}

export function buildMonthlyBars(
  months: WalletMonthlyDeltaPoint[],
  convert: (amount: number, currency: string) => number,
  labelFor: (month: string) => string,
): MonthlyDeltaBar[] {
  return months.map((p) => ({
    month: p.month,
    label: labelFor(p.month),
    value: sumConverted(p.deltas, convert),
    adjustment: sumConverted(p.adjustments, convert),
  }));
}
