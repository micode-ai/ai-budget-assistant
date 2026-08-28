/**
 * Deciding whether a receipt reading describes the receipt, and which of two
 * readings describes it better.
 *
 * Why this exists: the model is not reproducible. The same Biedronka PDF, the
 * same prompt, three scans — the line total came back as 345.16, then 294.28,
 * then 311.97 against a true 299.82, and the printed `OPUSTY ŁĄCZNIE: -70,34`
 * came back as 70.34 twice and 18.97 once. Two of the three refused to split,
 * for two unrelated reasons. Tightening prompt wording addressed one class of
 * error (ABA-440) and left the variance untouched.
 *
 * So instead of asking the model to be right every time, ask twice when the
 * arithmetic says it was wrong, and keep the reading that reconciles. The
 * receipt's own footer — total, discount total, deposit total — is printed
 * plainly and is the thing the line columns must agree with.
 *
 * Deliberately NOT the alternative: deriving the discount from
 * `Σlines − total`. That makes every reading reconcile by construction,
 * including the one that over-read the basket by 45, and so destroys the only
 * signal that a reading is bad.
 *
 * Pure: no I/O, no clock. The service does the calling; this does the deciding.
 */

/**
 * Matches `RECEIPT_SPLIT_DEFAULTS.tolerancePct` in
 * `common/utils/receipt-category-split.ts` on purpose: the point of a re-read
 * is to rescue a scan the split gate would otherwise refuse, so re-reading at a
 * different threshold would either waste calls or leave refusals on the table.
 */
export const RECEIPT_RECONCILE_TOLERANCE_PCT = 5;

export interface ReconcilableReceipt {
  items?: Array<{ totalPrice?: number | null }> | null;
  discount?: number | null;
  deposit?: number | null;
  total?: number | null;
}

const positive = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

/**
 * How far the line items are from the amount due, as a percentage of it.
 *
 * `null` means the question cannot be asked — no usable lines, or no usable
 * total — and a caller must NOT read that as "fine" or as "broken". A re-read
 * cannot fix a receipt that has no line items to reconcile.
 */
export function reconciliationGapPct(receipt: ReconcilableReceipt): number | null {
  const total = positive(receipt.total);
  if (!total) return null;

  const lines = receipt.items ?? [];
  if (lines.length === 0) return null;
  // One unusable price makes the sum meaningless rather than merely smaller, so
  // this is measured as unmeasurable instead of quietly reconciling on the rest.
  if (lines.some((line) => !Number.isFinite(Number(line?.totalPrice)))) return null;

  const linesTotal = lines.reduce((sum, line) => sum + Number(line?.totalPrice ?? 0), 0);
  if (linesTotal <= 0) return null;

  // Lines are gross: a discount comes off them, a deposit is added on top.
  const expected = linesTotal - positive(receipt.discount) + positive(receipt.deposit);
  return (Math.abs(expected - total) / total) * 100;
}

/** True when another reading is worth paying for. */
export function needsReread(receipt: ReconcilableReceipt, tolerancePct: number): boolean {
  const gap = reconciliationGapPct(receipt);
  return gap !== null && gap > tolerancePct;
}

/**
 * The reading whose lines describe the receipt more closely.
 *
 * Ties, and a second reading that cannot be measured, both keep the first: a
 * re-read is allowed to rescue a scan, never to degrade one.
 */
export function betterRead<T extends ReconcilableReceipt>(first: T, second: T): T {
  const firstGap = reconciliationGapPct(first);
  const secondGap = reconciliationGapPct(second);
  if (secondGap === null) return first;
  if (firstGap === null) return second;
  return secondGap < firstGap ? second : first;
}
