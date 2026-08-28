import {
  RECEIPT_RECONCILE_TOLERANCE_PCT,
  betterRead,
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
