import { buildMonthlyBars } from '../monthlyBars';

const id = (a: number) => a;

describe('buildMonthlyBars', () => {
  it('separates the correction from the net value', () => {
    const [b] = buildMonthlyBars(
      [{ month: '2026-10', deltas: { USD: 100 }, adjustments: { USD: 40 } }],
      id,
      (m) => m,
    );
    expect(b.value).toBe(100);
    expect(b.adjustment).toBe(40);
  });

  it('treats a missing adjustments field as zero', () => {
    const [b] = buildMonthlyBars([{ month: '2026-10', deltas: { USD: -5 } }], id, (m) => m);
    expect(b.adjustment).toBe(0);
  });

  it('converts each currency before summing', () => {
    const [b] = buildMonthlyBars(
      [{ month: '2026-10', deltas: { EUR: 10, USD: 10 }, adjustments: { EUR: 10 } }],
      (a, c) => (c === 'EUR' ? a * 2 : a),
      (m) => m,
    );
    expect(b.value).toBe(30);
    expect(b.adjustment).toBe(20);
  });
});
