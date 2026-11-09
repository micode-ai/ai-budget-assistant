import { computeFuelStats } from './fuel-stats.util';

const e = (d: string, odometerKm: number, liters: number, amount: number, isFullTank = true) => ({
  date: new Date(d),
  odometerKm,
  liters,
  amount,
  isFullTank,
});

describe('computeFuelStats', () => {
  it('returns nulls with fewer than two full fills', () => {
    const s = computeFuelStats([e('2026-01-01', 1000, 40, 200)]);
    expect(s.consumptionLPer100Km).toBeNull();
    expect(s.costPerKm).toBeNull();
    expect(s.lastPricePerLiter).toBe(5);
  });

  it('ignores the first fill litres (baseline only)', () => {
    const s = computeFuelStats([e('2026-01-01', 1000, 40, 200), e('2026-01-10', 1500, 35, 175)]);
    expect(s.consumptionLPer100Km).toBe(7);
    expect(s.costPer100Km).toBe(35);
    expect(s.costPerKm).toBe(0.35);
    expect(s.series).toHaveLength(1);
  });

  it('folds partial fills into the next full interval and sorts by odometer', () => {
    const s = computeFuelStats([
      e('2026-01-20', 2000, 30, 150),
      e('2026-01-01', 1000, 40, 200),
      e('2026-01-10', 1400, 10, 50, false),
    ]);
    expect(s.totalKm).toBe(1000);
    expect(s.consumptionLPer100Km).toBe(4);
  });

  it('skips non-positive distance intervals', () => {
    const s = computeFuelStats([e('2026-01-01', 1000, 40, 200), e('2026-01-02', 1000, 30, 150)]);
    expect(s.consumptionLPer100Km).toBeNull();
  });
});
