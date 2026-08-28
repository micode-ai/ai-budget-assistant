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
  /**
   * The receipt's own pre-discount goods total, when the model reported one.
   * Not used by the gate — only by `buildCorrectionNote`, which quotes it back
   * as the figure the model's own line items contradict.
   */
  subtotal?: number | null;
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

/**
 * What to tell the model when its own line items contradict the receipt's
 * footer.
 *
 * Grounded in a real failure. Six readings of one Biedronka receipt produced
 * line sums of 345.16, 294.28, 311.97, 306.05, 385.14 and 416.63 against a
 * true 299.82; only two reconciled, so resampling the identical question is a
 * poor use of a second vision call. But the failing readings are not uniformly
 * wrong: the 416.63 one reported `subtotal` 299.82, `discount` 70.34,
 * `deposit` 4.50 and `total` 233.98 — every footer figure exactly right —
 * while its items contradicted all of them. The error is concentrated in the
 * quantity column, and usually comes from reading the pack notation printed
 * inside the product NAME ("chust Dada 3x72szt" priced 1 x 10.49 came back as
 * 10 x 10.49).
 *
 * So the note states the arithmetic that failed, quotes the model's own
 * subtotal back at it when it has one, and points at the column that is
 * actually wrong — rather than repeating the original instructions louder.
 */
export function buildCorrectionNote(receipt: ReconcilableReceipt, gapPct: number): string {
  const lines = receipt.items ?? [];
  const linesTotal = lines.reduce((sum, line) => sum + Number(line?.totalPrice ?? 0), 0);
  const money = (value: number): string => value.toFixed(2);

  const parts: string[] = [
    'RE-READ REQUIRED — your previous answer did not add up.',
    `The line items you returned sum to ${money(linesTotal)}, but the receipt says: total ${money(positive(receipt.total))}, discounts ${money(positive(receipt.discount))}, returnable-packaging deposit ${money(positive(receipt.deposit))}.`,
    `Sum(line values) - discounts + deposit must equal the total; yours is off by ${gapPct.toFixed(1)}%.`,
  ];

  if (positive(receipt.subtotal) > 0) {
    parts.push(
      `You also reported a subtotal of ${money(positive(receipt.subtotal))} — that figure is printed on the receipt and your own line items contradict it. Make the lines match it.`,
    );
  }

  parts.push(
    'The error is almost always in the quantity column (Ilość), not in the prices: a pack size printed inside the product NAME ("3x72szt", "4x130G") is NOT a quantity, and a line bought once must have quantity 1 even when its name contains a multiplier.',
    'Re-read every line value from the value column (Wartość) and every quantity from the Ilość column. Do not change the total, the discount or the deposit — those were correct.',
  );

  return parts.join(' ');
}

/**
 * The same request with the correction note appended to its text.
 *
 * Returns a new object; the caller's request is never mutated, because the
 * first reading's request is still the baseline the retry is compared against.
 * Handles both message shapes this service builds: a plain string (the
 * text-PDF path) and a content array whose first text part carries the prompt
 * (the image and PDF-as-file paths). A request with no text part to correct is
 * returned unchanged rather than guessed at.
 */
export function withCorrection<T>(request: T, note: string): T {
  const req = request as any;
  const message = req?.messages?.[0];
  if (!message) return request;

  if (typeof message.content === 'string') {
    return {
      ...req,
      messages: [{ ...message, content: `${message.content}\n\n${note}` }, ...req.messages.slice(1)],
    } as T;
  }

  if (Array.isArray(message.content)) {
    const index = message.content.findIndex((part: any) => part?.type === 'text' && typeof part.text === 'string');
    if (index === -1) return request;
    const content = message.content.map((part: any, i: number) =>
      i === index ? { ...part, text: `${part.text}\n\n${note}` } : part,
    );
    return { ...req, messages: [{ ...message, content }, ...req.messages.slice(1)] } as T;
  }

  return request;
}
