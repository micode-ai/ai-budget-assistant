import { applyReduction, computeReductionBaseline } from '../reductionTarget';

const now = new Date(2026, 10, 15); // Nov 2026
// An old expense in another category proves the loaded window reaches back far enough.
const old = { date: new Date(2025, 0, 1), amount: 1, categoryId: 'zzz' };
const e = (y: number, m: number, amount: number, categoryId: string | null, extra = {}) => ({
  date: new Date(y, m, 10),
  amount,
  categoryId,
  ...extra,
});

describe('computeReductionBaseline', () => {
  it('lastMonth ignores the current month and other categories', () => {
    const xs = [old, e(2026, 9, 100, 'a'), e(2026, 9, 50, 'b'), e(2026, 10, 999, 'a')];
    expect(computeReductionBaseline(xs, 'a', 'lastMonth', now)).toBe(100);
  });
  it('avg3Months counts empty months', () => {
    const xs = [old, e(2026, 9, 300, 'a'), e(2026, 7, 300, 'a')]; // Oct + Aug, Sep empty
    expect(computeReductionBaseline(xs, 'a', 'avg3Months', now)).toBe(200);
  });
  it('lastYearSameMonth', () => {
    expect(computeReductionBaseline([old, e(2025, 10, 80, 'a')], 'a', 'lastYearSameMonth', now)).toBe(80);
  });
  it('is split-aware: splits decide, own category ignored', () => {
    const x = e(2026, 9, 100, 'a', { splits: [{ categoryId: 'b', amount: 100 }] });
    expect(computeReductionBaseline([old, x], 'a', 'lastMonth', now)).toBe(0);
    expect(computeReductionBaseline([old, x], 'b', 'lastMonth', now)).toBe(100);
  });
  it('skips deleted and planned', () => {
    const xs = [old, e(2026, 9, 100, 'a', { isDeleted: true }), e(2026, 9, 100, 'a', { isPlanned: true })];
    expect(computeReductionBaseline(xs, 'a', 'lastMonth', now)).toBe(0);
  });
  it('counts only expenses in the budget currency', () => {
    const xs = [
      old,
      e(2026, 9, 100, 'a', { currencyCode: 'PLN' }),
      e(2026, 9, 500, 'a', { currencyCode: 'EUR' }),
    ];
    expect(computeReductionBaseline(xs, 'a', 'lastMonth', now, 'PLN')).toBe(100);
    expect(computeReductionBaseline(xs, 'a', 'lastMonth', now, 'EUR')).toBe(500);
  });
  it('returns null when the loaded expenses do not reach the baseline period', () => {
    const xs = [e(2026, 9, 100, 'a')]; // earliest is mid-October
    expect(computeReductionBaseline(xs, 'a', 'lastMonth', now)).toBeNull();
    expect(computeReductionBaseline([old], 'a', 'avg3Months', now)).toBe(0);
    expect(computeReductionBaseline([e(2026, 8, 5, 'a')], 'a', 'lastYearSameMonth', now)).toBeNull();
    expect(computeReductionBaseline([], 'a', 'lastMonth', now)).toBeNull();
  });
});

describe('applyReduction', () => {
  it('reduces by percent', () => expect(applyReduction(480, 20)).toBe(384));
  it('returns 0 without a baseline or for a bad percent', () => {
    expect(applyReduction(0, 20)).toBe(0);
    expect(applyReduction(100, 100)).toBe(0);
  });
});
