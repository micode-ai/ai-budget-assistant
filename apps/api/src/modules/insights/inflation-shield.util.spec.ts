import { forecastProductTrend, estimateCadenceDays, isStockpileable, recommendStockUp, assembleShield } from './inflation-shield.util';

const D = (iso: string) => iso; // points use ISO date strings

describe('forecastProductTrend', () => {
  const now = new Date('2026-07-15T00:00:00Z');

  it('flags a rising trend when the recent window is pricier than the prior window', () => {
    const points = [
      { date: D('2026-06-05'), price: 5.0 },  // prior window (4-8w ago)
      { date: D('2026-06-12'), price: 5.1 },
      { date: D('2026-07-03'), price: 5.6 },  // recent window (0-4w ago)
      { date: D('2026-07-10'), price: 5.8 },
    ];
    const f = forecastProductTrend(points, now);
    expect(f.direction).toBe('rising');
    expect(f.monthlyChangePct).toBeGreaterThan(5);
  });

  it('returns flat/0 when the observed span is too short (silent on doubt)', () => {
    const points = [
      { date: D('2026-07-10'), price: 5.8 },  // 2 days apart => span < minSpanDays
      { date: D('2026-07-12'), price: 5.9 },
    ];
    const f = forecastProductTrend(points, now);
    expect(f.direction).toBe('flat');
    expect(f.monthlyChangePct).toBe(0);
  });

  it('flags a falling trend', () => {
    const points = [
      { date: D('2026-06-05'), price: 6.0 },
      { date: D('2026-07-10'), price: 5.0 },
    ];
    const f = forecastProductTrend(points, now);
    expect(f.direction).toBe('falling');
    expect(f.monthlyChangePct).toBeLessThan(0);
  });

  it('detects a trend from sparse points that the old two-window rule would drop', () => {
    const now = new Date('2026-07-15T00:00:00Z');
    // Purchases ~70 and ~10 days ago. Under the OLD two-fixed-window rule
    // (recent [Jun 17, Jul 15], prior [May 20, Jun 17)), May 6 falls BEFORE the
    // prior window, leaving it empty → the old rule returned flat (dropped it).
    // The regression spans 60 days (>= minSpanDays) and still detects the slope.
    const points = [
      { date: '2026-05-06', price: 5.0 },
      { date: '2026-07-05', price: 5.9 },
    ];
    const f = forecastProductTrend(points, now);
    expect(f.hasSignal).toBe(true);
    expect(f.direction).toBe('rising');
    expect(f.monthlyChangePct).toBeGreaterThan(0);
  });
});

describe('estimateCadenceDays', () => {
  it('returns the median gap in days for >=3 purchases', () => {
    const dates = [new Date('2026-06-01'), new Date('2026-06-15'), new Date('2026-06-29')];
    expect(estimateCadenceDays(dates)).toBe(14);
  });
  it('returns null below 3 purchases', () => {
    expect(estimateCadenceDays([new Date('2026-06-01'), new Date('2026-06-15')])).toBeNull();
  });
});

describe('isStockpileable', () => {
  it('rejects short-cadence perishables (milk bought every ~6 days)', () => {
    expect(isStockpileable(6).ok).toBe(false);
  });
  it('accepts long-cadence shelf-stable goods and caps the stock weeks', () => {
    const v = isStockpileable(30);
    expect(v.ok).toBe(true);
    expect(v.maxStockWeeks).toBe(8);
  });
  it('is silent when cadence is unknown', () => {
    expect(isStockpileable(null).ok).toBe(false);
  });
});

describe('recommendStockUp', () => {
  it('sizes quantity by consumption over the horizon and computes projected saving', () => {
    // cadence 7d => 1/week; horizon 4 weeks => 4 units; price 5 rising 12%/month
    const r = recommendStockUp({
      cadenceDays: 7,
      monthlyChangePct: 12,
      horizonWeeks: 4,
      currentBestPrice: 5,
      maxStockWeeks: 8,
      maxUnits: 12,
    });
    expect(r.quantity).toBe(4);
    expect(r.projectedPrice).toBeGreaterThan(5);
    expect(r.projectedSaving).toBeGreaterThan(0);
    expect(r.projectedSaving).toBeCloseTo(1.1, 1);
  });

  it('caps quantity at maxUnits', () => {
    const r = recommendStockUp({
      cadenceDays: 1, monthlyChangePct: 10, horizonWeeks: 4,
      currentBestPrice: 2, maxStockWeeks: 8, maxUnits: 12,
    });
    expect(r.quantity).toBe(12);
  });
});

describe('assembleShield', () => {
  const now = new Date('2026-07-15T00:00:00Z');
  // Monthly-ish cadence (median gap ~15d >= 14) AND points in both forecast
  // windows (prior [May 20–Jun 17], recent [Jun 17–Jul 15]) so it is both
  // stockpileable and rising.
  const rising = {
    canonicalName: 'Masło',
    currency: 'PLN',
    points: [
      { date: '2026-05-25', price: 5.0 }, { date: '2026-06-08', price: 5.1 },
      { date: '2026-06-25', price: 5.7 }, { date: '2026-07-10', price: 5.9 },
    ],
    purchaseDates: [new Date('2026-05-25'), new Date('2026-06-08'), new Date('2026-06-25'), new Date('2026-07-10')],
    currentBestPrice: 5.9,
    store: null as string | null,
  };

  it('recommends a rising, stockpileable product', () => {
    const s = assembleShield([rising], 'PLN', null, now);
    expect(s.hasEnoughData).toBe(true);
    expect(s.items).toHaveLength(1);
    expect(s.items[0].canonicalName).toBe('Masło');
    expect(s.items[0].projectedSaving).toBeGreaterThan(0);
    expect(s.totalProjectedSaving).toBeGreaterThan(0);
  });

  it('excludes a short-cadence perishable even if it is rising', () => {
    // Bought every 7 days (median gap 7 < 14) => not stockpileable, yet rising.
    const milk = {
      canonicalName: 'Mleko',
      currency: 'PLN',
      points: [
        { date: '2026-06-10', price: 3.0 }, { date: '2026-06-17', price: 3.0 },
        { date: '2026-06-24', price: 3.4 }, { date: '2026-07-01', price: 3.5 },
        { date: '2026-07-08', price: 3.6 }, { date: '2026-07-15', price: 3.7 },
      ],
      purchaseDates: [new Date('2026-06-10'), new Date('2026-06-17'), new Date('2026-06-24'),
                      new Date('2026-07-01'), new Date('2026-07-08'), new Date('2026-07-15')],
      currentBestPrice: 3.7,
      store: null as string | null,
    };
    const s = assembleShield([milk], 'PLN', null, now);
    expect(s.items).toHaveLength(0); // silent — never bulk-buy milk
  });

  it('hasEnoughData is false with no usable products', () => {
    const s = assembleShield([], 'PLN', null, now);
    expect(s.hasEnoughData).toBe(false);
    expect(s.items).toHaveLength(0);
  });

  it('flags fxApproximate and converts when the product currency differs from base', () => {
    const s = assembleShield([rising], 'USD', { PLN: 4 }, now); // 1 USD = 4 PLN
    expect(s.fxApproximate).toBe(true);
    // 5.9 PLN / 4 ≈ 1.48 USD
    expect(s.items[0].currentPrice).toBeCloseTo(1.48, 1);
  });

  it('excludes a product whose currency is missing from the rates map (fxApproximate)', () => {
    const s = assembleShield([rising], 'USD', { EUR: 0.9 } /* no PLN key */, now);
    expect(s.fxApproximate).toBe(true);
    expect(s.items).toHaveLength(0);
  });
});
