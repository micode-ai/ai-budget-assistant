/**
 * How much the user has paid in returnable-packaging deposits.
 *
 * A deposit ("kaucja", "Pfand", "statiegeld", "залог за тару") is printed in
 * its own block on the receipt, never as a line item, yet it is included in
 * the total the user paid. `Expense.depositAmount` is where that printed
 * figure lands, and it is the ONLY place it always lands: the receipt's
 * category split — which is what the deposit category the user sees comes
 * from — is refused whenever fewer than two categories result or the
 * arithmetic does not reconcile, so a chat answer built on the split alone is
 * silent for exactly the shopping trips where the deposit is the whole point.
 *
 * Reading the column also makes the answer region-independent by construction:
 * a number carries no language, so the same tool answers a Polish `kaucja`
 * question and a German `Pfand` one without matching either word.
 *
 * All arithmetic lives here, out of the IO layer, because this states an
 * amount of the user's money back to them.
 */

/** Display cap for the "where did it come from" list. Not a filter — the total counts every row. */
export const DEPOSIT_TOP_MERCHANTS = 5;
/** Display cap for the recent-receipts list. Not a filter either. */
export const DEPOSIT_RECENT_RECEIPTS = 5;

export interface DepositRow {
  /** `Expense.date` is `@db.Date`, so a Date here is midnight UTC. */
  date: Date | string;
  merchant?: string | null;
  description?: string | null;
  /** Prisma `Decimal(12,2)`, so a string at runtime. */
  depositAmount: unknown;
  currencyCode?: string | null;
}

export interface DepositMerchantTotal {
  merchant: string;
  amount: number;
  receiptCount: number;
}

export interface DepositReceipt {
  /** `YYYY-MM-DD`. */
  date: string;
  /** Null when the receipt named neither a merchant nor a description. */
  merchant: string | null;
  amount: number;
}

export interface DepositSummary {
  /** In the display currency. Counts only rows `convert` could handle. */
  total: number;
  /** Receipts counted toward `total`. */
  receiptCount: number;
  /** Native per-currency totals over EVERY row, convertible or not. */
  totalsByCurrency: Record<string, number>;
  byMerchant: DepositMerchantTotal[];
  recent: DepositReceipt[];
  /** Rows dropped from `total` for want of an exchange rate. */
  unconvertedCount: number;
}

/**
 * Returns the converted amount, or `null` when no rate is available for
 * `from` — in which case the row is excluded from every converted figure
 * rather than added in the wrong currency (the fat-finder/wrapped rule).
 */
export type DepositConverter = (amount: number, from: string) => number | null;

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** The payee to report a deposit under, mirroring `expensePayee()` in the duplicate detector. */
const payeeOf = (row: DepositRow): string | null =>
  row.merchant?.trim() || row.description?.trim() || null;

const isoDay = (date: Date | string): string =>
  date instanceof Date ? date.toISOString().slice(0, 10) : String(date).slice(0, 10);

export function summariseDeposits(
  rows: DepositRow[],
  convert: DepositConverter,
  limits?: { merchants?: number; recent?: number },
): DepositSummary {
  const totalsByCurrency: Record<string, number> = {};
  const merchantMap = new Map<string, { merchant: string; amount: number; receiptCount: number }>();
  const receipts: DepositReceipt[] = [];
  let total = 0;
  let receiptCount = 0;
  let unconvertedCount = 0;

  for (const row of rows) {
    const native = Number(row.depositAmount);
    if (!Number.isFinite(native) || native <= 0) continue;

    const currency = row.currencyCode || '';
    if (currency) {
      totalsByCurrency[currency] = (totalsByCurrency[currency] ?? 0) + native;
    }

    const converted = convert(native, currency);
    if (converted == null || !Number.isFinite(converted)) {
      unconvertedCount += 1;
      continue;
    }

    total += converted;
    receiptCount += 1;

    const payee = payeeOf(row);
    if (payee) {
      const entry = merchantMap.get(payee) ?? { merchant: payee, amount: 0, receiptCount: 0 };
      entry.amount += converted;
      entry.receiptCount += 1;
      merchantMap.set(payee, entry);
    }

    receipts.push({ date: isoDay(row.date), merchant: payee, amount: round2(converted) });
  }

  for (const code of Object.keys(totalsByCurrency)) {
    totalsByCurrency[code] = round2(totalsByCurrency[code]);
  }

  return {
    total: round2(total),
    receiptCount,
    totalsByCurrency,
    byMerchant: Array.from(merchantMap.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, limits?.merchants ?? DEPOSIT_TOP_MERCHANTS)
      .map((m) => ({ ...m, amount: round2(m.amount) })),
    recent: receipts
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, limits?.recent ?? DEPOSIT_RECENT_RECEIPTS),
    unconvertedCount,
  };
}
