import { computeVehicleHistory, windowStart, type HistoryCostInput, type HistoryFuelInput } from './vehicle-history.util';

const NOW = new Date(Date.UTC(2026, 10, 17)); // 2026-11-17

const fill = (day: string, km: number, liters: number, amount: number, extra: Partial<HistoryFuelInput> = {}): HistoryFuelInput => ({
  expenseId: `f-${day}`,
  clientId: null,
  date: new Date(`${day}T00:00:00Z`),
  amount,
  currencyCode: 'PLN',
  amountBase: amount,
  merchant: null,
  description: null,
  liters,
  odometerKm: km,
  isFullTank: true,
  ...extra,
});

const cost = (day: string, kind: string, amount: number, extra: Partial<HistoryCostInput> = {}): HistoryCostInput => ({
  expenseId: `c-${day}-${kind}`,
  clientId: null,
  date: new Date(`${day}T00:00:00Z`),
  amount,
  currencyCode: 'PLN',
  amountBase: amount,
  merchant: null,
  description: null,
  kind,
  ...extra,
});

describe('computeVehicleHistory (ABA-811)', () => {
  it('starts a window on the first day of the earliest calendar month', () => {
    expect(windowStart(NOW, 12).toISOString().slice(0, 10)).toBe('2025-12-01');
    expect(windowStart(NOW, 3).toISOString().slice(0, 10)).toBe('2026-09-01');
  });

  it('buckets every cost by calendar month and kind, empty months included', () => {
    const h = computeVehicleHistory(
      [fill('2026-09-05', 10000, 40, 200), fill('2026-11-02', 10600, 36, 180)],
      [cost('2026-10-10', 'service', 500), cost('2026-11-03', 'parking', 20)],
      3,
      NOW,
    );
    expect(h.monthly.map((m) => m.month)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(h.monthly.map((m) => m.total)).toEqual([200, 500, 200]);
    expect(h.monthly[2].byKind).toMatchObject({ fuel: 180, parking: 20 });
    expect(h.total).toBe(900);
    expect(h.perMonth).toBe(300);
    expect(h.byKind).toMatchObject({ fuel: 380, service: 500, parking: 20, insurance: 0 });
    expect(h.km).toBe(600);
    expect(h.costPerKm).toBe(1.5);
  });

  it('leaves out what predates the window, but still uses a fill-up before it as a segment baseline', () => {
    const h = computeVehicleHistory(
      [fill('2026-07-01', 10000, 40, 200), fill('2026-10-01', 10500, 30, 150)],
      [cost('2026-05-01', 'insurance', 1200)],
      3,
      NOW,
    );
    expect(h.total).toBe(150);
    expect(h.byKind.insurance).toBe(0);
    expect(h.items.map((i) => i.date)).toEqual(['2026-10-01']);
    expect(h.consumption).toEqual([{ date: '2026-10-01', lPer100Km: 6, costPer100Km: 30 }]);
    expect(h.consumptionLPer100Km).toBe(6);
  });

  it('weights the period consumption by distance, not by averaging segments', () => {
    const h = computeVehicleHistory(
      [fill('2026-09-01', 10000, 40, 200), fill('2026-09-20', 10100, 10, 50), fill('2026-10-20', 11000, 45, 220)],
      [],
      12,
      NOW,
    );
    // 55 l over 1000 km, not the mean of 10 and 5.
    expect(h.consumptionLPer100Km).toBe(5.5);
  });

  it('lists an amount with no known rate but keeps it out of every total', () => {
    const h = computeVehicleHistory([], [cost('2026-11-01', 'tax', 50, { currencyCode: 'XYZ', amountBase: null })], 12, NOW);
    expect(h.items).toHaveLength(1);
    expect(h.total).toBe(0);
  });

  it('starts all-time at the first record, and is empty with none', () => {
    const h = computeVehicleHistory([], [cost('2025-03-15', 'tax', 100)], 0, NOW);
    expect(h.from).toBe('2025-03-01');
    expect(h.monthly).toHaveLength(21);
    const none = computeVehicleHistory([], [], 0, NOW);
    expect(none.from).toBeNull();
    expect(none.monthly).toEqual([]);
    expect(none.perMonth).toBe(0);
  });

  it('lists items newest first with the fill-up details', () => {
    const h = computeVehicleHistory([fill('2026-10-01', 10500, 30, 150)], [cost('2026-11-01', 'other', 5)], 12, NOW);
    expect(h.items[0].kind).toBe('other');
    expect(h.items[1]).toMatchObject({ kind: 'fuel', liters: 30, odometerKm: 10500, isFullTank: true });
  });
});
