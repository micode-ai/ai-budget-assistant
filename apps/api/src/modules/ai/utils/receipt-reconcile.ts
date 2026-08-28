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

/**
 * True when the model reported a discount its own line values have already had
 * taken off.
 *
 * Grounded in production (2026-08-27). A Sinsay receipt prints lines 2,09 and
 * 13,99 against `SUMA PLN 16,08`, and the model returned those two lines plus a
 * `discount` of 3,01 — which is the receipt's `Podatek PTU 3,01`, the VAT, not a
 * discount at all. A Rossmann receipt prints two `Uwzgl. opust: -5,00` lines
 * ("uwzględniony" = already applied) and the model returned all five gross-looking
 * lines summing to the 46,85 total plus a discount of 10,00. In both the lines
 * already make the total, so subtracting the discount a second time puts the
 * arithmetic 19% and 21% out and the category split refuses to run.
 *
 * The test is not "is this discount plausible" — it is the much narrower
 * "do the lines reconcile WITHOUT it and fail WITH it". A real discount off
 * gross lines fails that test by construction, so a genuine `OPUSTY ŁĄCZNIE`
 * is never touched.
 *
 * Distinct from the rejected `Σlines − total` derivation this file warns about:
 * that INVENTS a discount and makes every reading reconcile. This one only ever
 * DROPS a discount the lines contradict, and only when dropping it makes the
 * receipt add up. It cannot manufacture agreement out of a bad reading — when
 * neither form reconciles, it says nothing and leaves the re-read to decide.
 */
export function isDiscountAlreadyInLines(receipt: ReconcilableReceipt, tolerancePct: number): boolean {
  if (!positive(receipt.discount)) return false;

  const withDiscount = reconciliationGapPct(receipt);
  // Unmeasurable, or already reconciling — either way there is nothing to doubt.
  if (withDiscount === null || withDiscount <= tolerancePct) return false;

  const withoutDiscount = reconciliationGapPct({ ...receipt, discount: null });
  if (withoutDiscount === null) return false;

  return withoutDiscount <= tolerancePct;
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
 * while its items contradicted all of them.
 *
 * So the note states the arithmetic that failed, quotes the model's own
 * subtotal back at it when it has one, and points at the column that is
 * actually wrong — rather than repeating the original instructions louder.
 *
 * Which column that is depends on the SIGN of the gap, and getting it from the
 * evidence rather than from a constant matters: the note originally always
 * blamed the quantity column, because the reading it was written against had
 * over-read. A day later two Biedronka receipts failed the other way — every
 * quantity correct, seven of fifteen unit prices misread — and that wording
 * would have sent the second pass to re-check the one column already right.
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

  // Which column to point at is decided by the SIGN of the gap, not by a fixed
  // guess. The two failure modes push the sum in opposite directions, so the
  // direction identifies the mode:
  //
  //   too high — a pack size printed inside the product NAME was taken for a
  //     quantity ("chust Dada 3x72szt" priced 1 x 10.49 came back as 10 x 10.49).
  //     A multiplier can only ever inflate.
  //   too low — a price was misread. Seen in production on 2026-08-27: a
  //     leading digit dropped (14,69 -> 4,69; 16,99 -> 6,99) and a value taken
  //     from the `OPUST` row printed beneath the line instead of the line's own
  //     (JajaSciol 2 x 10,49 came back as 2 x 5,27, which is that line's OPUST).
  //     Every quantity on that receipt was correct, so telling the model to
  //     re-check the Ilosc column sends it to look at the one column that was
  //     already right.
  const expected = linesTotal - positive(receipt.discount) + positive(receipt.deposit);
  if (expected > positive(receipt.total)) {
    parts.push(
      'Your line values came out too high. The error is almost always in the quantity column (Ilość), not in the prices: a pack size printed inside the product NAME ("3x72szt", "4x130G") is NOT a quantity, and a line bought once must have quantity 1 even when its name contains a multiplier.',
      'Re-read every quantity from the Ilość column and every line value from the value column (Wartość).',
    );
  } else {
    parts.push(
      'Your line values came out too low, so this is NOT a quantity error — a pack multiplier can only make a sum too large. Re-read the price and value columns.',
      "Two misreads produce exactly this: a dropped leading digit (14,69 read as 4,69; 16,99 as 6,99), and taking the number from the OPUST / discount row printed BENEATH a line instead of the line's own value (2 x 10,49 = 20,98 read as 2 x 5,27, where 5,27 was that line's OPUST).",
      "Each product line's value is on the product line itself; a discount row (OPUST, RABAT, СКИДКА, ЗНИЖКА, DISCOUNT) belongs to the line above it and is never a line of its own.",
    );
  }

  parts.push('Do not change the total, the discount or the deposit — re-read only the line items.');

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
