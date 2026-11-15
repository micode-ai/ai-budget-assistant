import type { WalletMonthlyDeltaPoint } from '@budget/shared-types';

export interface MonthlyDeltaBar {
  month: string;
  label: string;
  /** Net change in the display currency, corrections included. */
  value: number;
  /** The part of `value` that came from balance corrections. */
  adjustment: number;
}

export type MonthConvert = (amount: number, currency: string, month: string) => number;

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
  convert: MonthConvert,
  labelFor: (month: string) => string,
): MonthlyDeltaBar[] {
  return months.map((p) => {
    const inMonth = (amount: number, currency: string) => convert(amount, currency, p.month);
    return {
      month: p.month,
      label: labelFor(p.month),
      value: sumConverted(p.deltas, inMonth),
      adjustment: sumConverted(p.adjustments, inMonth),
    };
  });
}

/**
 * Converts a month's amounts at THAT month's closing rate when the server sent
 * one (`monthEndRates`, EUR-based) and it covers both currencies; otherwise at
 * today's rate through `today` — the current month, a month the source could
 * not answer, and UAH/RUB/BYN, which the ECB set does not carry.
 */
export function monthAwareConverter(
  monthEndRates: Record<string, Record<string, number>> | undefined,
  displayCurrency: string,
  today: (amount: number, currency: string) => number,
): MonthConvert {
  return (amount, currency, month) => {
    if (currency === displayCurrency) return amount;
    const r = monthEndRates?.[month];
    const from = r?.[currency];
    const to = r?.[displayCurrency];
    if (from && to) return (amount / from) * to;
    return today(amount, currency);
  };
}
