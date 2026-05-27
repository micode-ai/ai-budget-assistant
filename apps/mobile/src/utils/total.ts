import { convertAmount } from '@/stores/exchangeRateStore';

/**
 * Sum `items` amounts converted into `baseCurrency` using `rates`
 * (each rate relative to the base). Used for the Expenses/Income filter-row total.
 */
export function sumConverted(
  items: { amount: number; currencyCode: string }[],
  baseCurrency: string,
  rates: Record<string, number>,
): number {
  return items.reduce(
    (sum, it) => sum + convertAmount(it.amount, it.currencyCode, baseCurrency, rates),
    0,
  );
}
