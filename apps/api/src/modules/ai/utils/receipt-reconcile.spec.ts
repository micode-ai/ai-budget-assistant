import {
  RECEIPT_RECONCILE_TOLERANCE_PCT,
  betterRead,
  isDiscountAlreadyInLines,
  needsReread,
  reconciliationGapPct,
} from './receipt-reconcile';

const receipt = (lines: number[], over: { discount?: number | null; deposit?: number | null; total?: number } = {}) => ({
  items: lines.map((totalPrice) => ({ totalPrice })),
  discount: over.discount ?? null,
  deposit: over.deposit ?? null,
  total: over.total ?? 100,
});

describe('reconciliationGapPct', () => {
  it('measures the lines against the total, allowing for discount and deposit', () => {
    // 200 of goods, 20 off, 5 of bottle deposit, so 185 is due.
    expect(reconciliationGapPct(receipt([120, 80], { discount: 20, deposit: 5, total: 185 }))).toBe(0);
  });

  it('reports the shortfall as a percentage of the total', () => {
    // Lines are 10 short of a 100 total.
    expect(reconciliationGapPct(receipt([90], { total: 100 }))).toBe(10);
  });

  it('is unsigned — over-reading and under-reading are both discrepancies', () => {
    expect(reconciliationGapPct(receipt([110], { total: 100 }))).toBe(10);
  });

  it('cannot be measured without usable lines or a usable total', () => {
    expect(reconciliationGapPct({ items: [], discount: null, deposit: null, total: 100 })).toBeNull();
    expect(reconciliationGapPct(receipt([50], { total: 0 }))).toBeNull();
    expect(reconciliationGapPct({ items: null, discount: null, deposit: null, total: 100 })).toBeNull();
    expect(reconciliationGapPct(receipt([Number.NaN], { total: 100 }))).toBeNull();
  });
});

describe('needsReread', () => {
  it('accepts a read whose lines describe the receipt', () => {
    expect(needsReread(receipt([98], { total: 100 }), RECEIPT_RECONCILE_TOLERANCE_PCT)).toBe(false);
  });

  it('asks for another read when they do not', () => {
    expect(needsReread(receipt([140], { total: 100 }), RECEIPT_RECONCILE_TOLERANCE_PCT)).toBe(true);
  });

  it('does not ask when the gap cannot be measured, since a re-read cannot fix that', () => {
    expect(needsReread({ items: [], discount: null, deposit: null, total: 100 }, 5)).toBe(false);
  });
});

describe('betterRead', () => {
  // The three real scans of one Biedronka receipt: the model read the same PDF
  // three times and disagreed with itself about both the lines and the printed
  // discount total. Picking the read that reconciles is the point.
  const scanOne = receipt([345.16], { discount: 70.34, deposit: 4.5, total: 233.98 });
  const scanTwo = receipt([294.28], { discount: 70.34, deposit: 4.5, total: 233.98 });
  const scanThree = receipt([311.97], { discount: 18.97, deposit: 4.5, total: 233.98 });

  it('keeps whichever read describes the receipt more closely', () => {
    expect(betterRead(scanThree, scanTwo)).toBe(scanTwo);
    expect(betterRead(scanTwo, scanThree)).toBe(scanTwo);
    expect(betterRead(scanOne, scanTwo)).toBe(scanTwo);
  });

  it('keeps the first read when the second is no better, so a re-read cannot make things worse', () => {
    expect(betterRead(scanTwo, scanTwo)).toBe(scanTwo);
    expect(betterRead(scanTwo, scanOne)).toBe(scanTwo);
  });

  it('keeps the first read when the second cannot be measured at all', () => {
    const unmeasurable = { items: [], discount: null, deposit: null, total: 233.98 };
    expect(betterRead(scanThree, unmeasurable)).toBe(scanThree);
  });
});

describe('isDiscountAlreadyInLines', () => {
  const TOL = RECEIPT_RECONCILE_TOLERANCE_PCT;

  it('detects a discount whose value the line items already have taken off', () => {
    // Sinsay, 2026-08-14: printed lines are 2,09 and 13,99, SUMA PLN 16,08.
    // The model reported the receipt's `Podatek PTU 3,01` — the VAT — as a
    // discount. Subtracting it a second time is what refuses the split.
    expect(isDiscountAlreadyInLines(receipt([2.09, 13.99], { discount: 3.01, total: 16.08 }), TOL)).toBe(true);
  });

  it('detects it through an already-included per-item discount too', () => {
    // Rossmann, 2026-08-14: two `Uwzgl. opust: -5,00` lines — "uwzględniony"
    // means already applied — against lines summing to the 46,85 total.
    expect(isDiscountAlreadyInLines(receipt([10.99, 10.99, 14.49, 5.59, 4.79], { discount: 10, total: 46.85 }), TOL)).toBe(
      true,
    );
  });

  it('leaves a real discount alone: gross lines less the discount are what make the total', () => {
    // Biedronka, 2026-08-14: 152,20 of goods, OPUSTY ŁĄCZNIE -55,05, 1,00 of
    // bottle deposit, DO ZAPŁATY 98,15.
    expect(isDiscountAlreadyInLines(receipt([152.2], { discount: 55.05, deposit: 1, total: 98.15 }), TOL)).toBe(false);
  });

  it('has nothing to say when no discount was reported', () => {
    expect(isDiscountAlreadyInLines(receipt([16.08], { discount: null, total: 16.08 }), TOL)).toBe(false);
    expect(isDiscountAlreadyInLines(receipt([16.08], { discount: 0, total: 16.08 }), TOL)).toBe(false);
  });

  it('has nothing to say when the lines reconcile neither way — that is a misread, not a spurious discount', () => {
    // Yesterday's Biedronka read: lines 14.29 short even with the real
    // discount. Clearing the discount would make it 39.76 short instead.
    expect(isDiscountAlreadyInLines(receipt([137.91], { discount: 55.05, deposit: 1, total: 98.15 }), TOL)).toBe(false);
  });

  it('has nothing to say when the question cannot be asked', () => {
    expect(isDiscountAlreadyInLines({ items: [], discount: 5, deposit: null, total: 100 }, TOL)).toBe(false);
    expect(isDiscountAlreadyInLines(receipt([50], { discount: 5, total: 0 }), TOL)).toBe(false);
  });
});
