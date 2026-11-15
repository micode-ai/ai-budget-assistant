import { buildMonthlyBars, monthAwareConverter } from '../monthlyBars';

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

describe('monthAwareConverter (ABA-771)', () => {
  // EUR-based closing rates for September; today 1 EUR = 4 PLN = 1.2 USD.
  const monthEndRates = { '2026-09': { EUR: 1, PLN: 4.5, USD: 1.1 } };
  const today = (amount: number, currency: string) =>
    currency === 'USD' ? (amount / 1.2) * 4 : currency === 'EUR' ? amount * 4 : amount * 10;
  const convert = monthAwareConverter(monthEndRates, 'PLN', today);

  it("converts a past month at that month's closing rate", () => {
    expect(convert(110, 'USD', '2026-09')).toBeCloseTo(450); // 110 USD = 100 EUR = 450 PLN
  });

  it("falls back to today's rate for the current month and uncovered currencies", () => {
    expect(convert(120, 'USD', '2026-11')).toBeCloseTo(400);
    expect(convert(1, 'UAH', '2026-09')).toBe(10);
  });

  it('leaves the display currency untouched', () => {
    expect(convert(50, 'PLN', '2026-09')).toBe(50);
  });

  it('feeds the month into buildMonthlyBars', () => {
    const bars = buildMonthlyBars(
      [
        { month: '2026-09', deltas: { USD: 110 } },
        { month: '2026-11', deltas: { USD: 120 } },
      ],
      convert,
      (m) => m,
    );
    expect(bars.map((b) => Math.round(b.value))).toEqual([450, 400]);
  });
});
