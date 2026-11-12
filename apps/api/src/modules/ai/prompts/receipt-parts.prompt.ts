/**
 * Appended to the per-request receipt prompt when one long receipt arrives as
 * several photos (2–4 parts, top to bottom). The static system prompt stays
 * byte-identical to a single scan so its cached prefix is shared.
 */
export const RECEIPT_PARTS_INSTRUCTIONS = `MULTIPLE PHOTOS OF ONE RECEIPT:
- The images that follow are consecutive sections of ONE receipt, in top-to-bottom order (part 1 is the top). Neighbouring parts may overlap.
- Return a single receipt: output each purchased line once.
- Where the end of part N and the start of part N+1 show the same lines, that is the overlap between the photos: keep one copy of those lines and drop the duplicate.
- But keep genuinely repeated items: the same product printed as separate lines in regions that do not overlap, or printed once with a quantity, is a real repeat — never merge it away.
- Take the header from the first part, totals from the last: store name, address, date and time come from part 1; subtotal, discount, deposit, tax, total and payment method come from the last part.`;
