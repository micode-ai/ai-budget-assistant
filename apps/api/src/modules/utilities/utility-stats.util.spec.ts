import { computeUtilityStats, UtilityEntry } from './utility-stats.util';

const e = (month: string, consumption: number, cost: number | null, kind: UtilityEntry['kind'] = 'electricity'): UtilityEntry => ({
  date: new Date(`${month}-10T00:00:00Z`),
  kind,
  unit: 'kwh',
  consumption,
  cost,
});

describe('computeUtilityStats', () => {
  it('buckets by month and derives the unit price', () => {
    const [s] = computeUtilityStats([e('2026-01', 100, 50), e('2026-01', 100, 70), e('2026-02', 100, 60)]);
    expect(s.months).toEqual([
      { month: '2026-01', consumption: 200, cost: 120, unitPrice: 0.6 },
      { month: '2026-02', consumption: 100, cost: 60, unitPrice: 0.6 },
    ]);
  });

  it('ignores non-positive consumption and keeps kinds apart', () => {
    const out = computeUtilityStats([e('2026-01', 0, 10), e('2026-01', 10, 5, 'water')]);
    expect(out.map((s) => s.kind)).toEqual(['water']);
  });

  it('excludes an unknown-rate cost from the unit price', () => {
    const [s] = computeUtilityStats([e('2026-01', 100, 50), e('2026-01', 100, null)]);
    expect(s.months[0]).toMatchObject({ consumption: 200, cost: 50, unitPrice: 0.5 });
  });

  it('nudges only above 10% over the 3-month mean', () => {
    const base = [e('2026-01', 100, 50), e('2026-02', 100, 50), e('2026-03', 100, 50)];
    expect(computeUtilityStats([...base, e('2026-04', 100, 55)])[0].priceNudge).toBeNull();
    const nudge = computeUtilityStats([...base, e('2026-04', 100, 60)])[0].priceNudge;
    expect(nudge).toMatchObject({ month: '2026-04', risePct: 20 });
  });

  it('needs two earlier priced months for a nudge', () => {
    expect(computeUtilityStats([e('2026-01', 100, 50), e('2026-02', 100, 90)])[0].priceNudge).toBeNull();
  });

  it('gives year-over-year only with 12+ months', () => {
    const months = Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, '0')}`);
    const entries = months.map((m) => e(m, 100, 50));
    expect(computeUtilityStats(entries)[0].yearOverYear).toBeNull();
    const out = computeUtilityStats([...entries, e('2026-01', 50, 30)])[0];
    expect(out.yearOverYear).toEqual({
      month: '2026-01',
      previousMonth: '2025-01',
      unitPriceChangePct: 20,
      consumptionChangePct: -50,
    });
  });
});
