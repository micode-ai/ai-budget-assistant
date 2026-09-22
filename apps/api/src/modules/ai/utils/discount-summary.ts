/**
 * How much the user has been given in discounts on their purchases.
 *
 * A discount is money already taken off a receipt's basket before it was
 * paid — "rabat"/"zniżka"/"opust" (PL), "Rabatt" (DE), "korting" (NL),
 * "réduction"/"remise" (FR), "descuento" (ES), "скидка" (RU), "знижка" (UA),
 * "зніжка" (BE). `Expense.discountAmount` is where the OCR-extracted figure
 * lands (folded from per-item "OPUST"/"RABAT" lines plus any basket-wide
 * coupon — see `extractReceiptDiscounts`), and it is the ONLY place it always
 * lands: like the deposit figure it survives even when the receipt's category
 * split is refused, so a chat answer built on categories alone is silent for
 * exactly the shopping trips where the discount is the whole question.
 *
 * Reading the column also makes the answer language-independent by
 * construction: a number carries no language, so the same tool answers a
 * Polish "rabat" question and a German "Rabatt" one without matching either
 * word.
 *
 * All arithmetic lives here, out of the IO layer, because this states an
 * amount of the user's money back to them. Mirrors `deposit-summary.ts`
 * deliberately — same shape, same reasoning, different column.
 */

/** Display cap for the "where did it come from" list. Not a filter — the total counts every row. */
export const DISCOUNT_TOP_MERCHANTS = 5;
/** Display cap for the recent-receipts list. Not a filter either. */
export const DISCOUNT_RECENT_RECEIPTS = 5;

export interface DiscountRow {
  /**
   * The expense's server PK, so a caller (the `/analytics/savings-detail`
   * REST read) can tap a receipt through to its detail screen. Optional
   * because the AI tool's own unit tests build rows without one — see
   * `DiscountReceipt.expenseId`.
   */
  id?: string;
  /** `Expense.date` is `@db.Date`, so a Date here is midnight UTC. */
  date: Date | string;
  merchant?: string | null;
  description?: string | null;
  /** Prisma `Decimal(12,2)`, so a string at runtime. */
  discountAmount: unknown;
  currencyCode?: string | null;
}

export interface DiscountMerchantTotal {
  merchant: string;
  amount: number;
  receiptCount: number;
}

export interface DiscountReceipt {
  /** `YYYY-MM-DD`. */
  date: string;
  /** Null when the receipt named neither a merchant nor a description. */
  merchant: string | null;
  amount: number;
  /**
   * Carried through from `DiscountRow.id` when present. Left `undefined`
   * (not `null`) rather than defaulted, so existing `toEqual` fixtures with
   * no `id` on their rows keep matching unchanged — Jest's `toEqual` ignores
   * `undefined`-valued keys.
   */
  expenseId?: string;
}

export interface DiscountSummary {
  /** In the display currency. Counts only rows `convert` could handle. */
  total: number;
  /** Receipts counted toward `total`. */
  receiptCount: number;
  /** Native per-currency totals over EVERY row, convertible or not. */
  totalsByCurrency: Record<string, number>;
  byMerchant: DiscountMerchantTotal[];
  recent: DiscountReceipt[];
  /** Rows dropped from `total` for want of an exchange rate. */
  unconvertedCount: number;
}

/**
 * Returns the converted amount, or `null` when no rate is available for
 * `from` — in which case the row is excluded from every converted figure
 * rather than added in the wrong currency (the fat-finder/wrapped rule).
 */
export type DiscountConverter = (amount: number, from: string) => number | null;

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** The payee to report a discount under, mirroring `expensePayee()` in the duplicate detector. */
const payeeOf = (row: DiscountRow): string | null =>
  row.merchant?.trim() || row.description?.trim() || null;

const isoDay = (date: Date | string): string =>
  date instanceof Date ? date.toISOString().slice(0, 10) : String(date).slice(0, 10);

export function summariseDiscounts(
  rows: DiscountRow[],
  convert: DiscountConverter,
  limits?: { merchants?: number; recent?: number },
): DiscountSummary {
  const totalsByCurrency: Record<string, number> = {};
  const merchantMap = new Map<string, { merchant: string; amount: number; receiptCount: number }>();
  const receipts: DiscountReceipt[] = [];
  let total = 0;
  let receiptCount = 0;
  let unconvertedCount = 0;

  for (const row of rows) {
    const native = Number(row.discountAmount);
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

    receipts.push({ date: isoDay(row.date), merchant: payee, amount: round2(converted), expenseId: row.id });
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
      .slice(0, limits?.merchants ?? DISCOUNT_TOP_MERCHANTS)
      .map((m) => ({ ...m, amount: round2(m.amount) })),
    recent: receipts
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, limits?.recent ?? DISCOUNT_RECENT_RECEIPTS),
    unconvertedCount,
  };
}
