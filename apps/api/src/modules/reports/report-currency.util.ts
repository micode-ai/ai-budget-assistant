/**
 * Expresses a report's amounts in ONE currency before anything is summed.
 *
 * `ReportsService` used to do `rows.reduce((s, r) => s + Number(r.amount), 0)` with
 * no currency awareness at all, and label the result with `account.currencyCode`.
 * So a PLN-labelled report added a `EUR 12.00` charge as 12 zloty, and the
 * category table and its percentages inherited the same blend — in the one
 * artifact users hand to an accountant. Same defect class as ABA-386 (Fat Finder
 * took the currency of whichever row was newest) and ABA-387 (Spending Story took
 * the currency of the largest charge).
 *
 * A row whose rate is unknown is **excluded from the totals, never mislabelled**,
 * and sets `fxApproximate` so the document can say so. The row itself still
 * appears in the transaction list with its own currency: the list is a ledger and
 * must show what was actually recorded.
 */
import { convertAmount } from '../../common/utils/fx';

export interface CurrencyRow {
  amount: unknown;
  currencyCode: string;
}

export interface ConvertedRows<T> {
  /** Only the rows that could be expressed in the base currency. */
  rows: Array<{ row: T; baseAmount: number }>;
  /** Sum of `rows`, in the base currency. */
  total: number;
  /** At least one amount came from a different currency and was converted. */
  fxConverted: boolean;
  /** At least one amount was dropped because its rate was unknown. */
  fxApproximate: boolean;
}

/**
 * True when at least one row is in something other than the base currency —
 * the rate provider is only worth calling then.
 */
export function needsConversion(rows: CurrencyRow[], baseCurrency: string): boolean {
  return rows.some((r) => r.currencyCode !== baseCurrency);
}

export function convertRowsToBase<T extends CurrencyRow>(
  rows: T[],
  baseCurrency: string,
  rates: Record<string, number> | null,
): ConvertedRows<T> {
  const out: Array<{ row: T; baseAmount: number }> = [];
  let total = 0;
  let fxConverted = false;
  let fxApproximate = false;

  for (const row of rows) {
    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) {
      // A non-numeric amount cannot be summed OR converted. Excluding it silently
      // would understate the total, so it counts as an approximation too.
      fxApproximate = true;
      continue;
    }

    if (row.currencyCode === baseCurrency) {
      out.push({ row, baseAmount: amount });
      total += amount;
      continue;
    }

    const converted = convertAmount(amount, row.currencyCode, baseCurrency, rates);
    if (converted === null) {
      fxApproximate = true;
      continue;
    }

    fxConverted = true;
    out.push({ row, baseAmount: converted });
    total += converted;
  }

  // Sum of 2dp values still carries the usual IEEE-754 epsilon.
  return { rows: out, total: Math.round(total * 100) / 100, fxConverted, fxApproximate };
}

/**
 * Category totals over already-converted rows, largest first, with each share as
 * a percentage of the converted total.
 */
export function buildCategoryTotals<T extends CurrencyRow>(
  converted: Array<{ row: T; baseAmount: number }>,
  categoryNameOf: (row: T) => string,
  total: number,
  uncategorizedLabel = 'Uncategorized',
): Array<{ name: string; amount: number; percentage: number }> {
  const byName = new Map<string, number>();
  for (const { row, baseAmount } of converted) {
    const name = categoryNameOf(row) || uncategorizedLabel;
    byName.set(name, (byName.get(name) || 0) + baseAmount);
  }

  return Array.from(byName.entries())
    .map(([name, amount]) => ({
      name,
      amount: Math.round(amount * 100) / 100,
      percentage: total > 0 ? (amount / total) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}
