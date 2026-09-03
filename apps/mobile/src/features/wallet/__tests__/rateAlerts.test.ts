import { partitionRateAlerts } from '../rateAlerts';
import type { ExchangeRateWatch } from '@budget/shared-types';

/**
 * `exchangeRateWatchStore` puts the API response into state untouched, so at
 * runtime `createdAt`/`triggeredAt` are ISO **strings** even though the entity
 * type says `Date`. Every fixture here is built the way the API actually
 * delivers it, because that is what the sorting has to survive.
 */
function watch(over: Partial<ExchangeRateWatch> & { id: string }): ExchangeRateWatch {
  return {
    userId: 'u1',
    fromCurrency: 'EUR',
    toCurrency: 'PLN',
    targetRate: 4.35,
    direction: 'above',
    isActive: true,
    createdAt: '2026-09-01T10:00:00.000Z' as unknown as Date,
    triggeredAt: null,
    triggeredRate: null,
    ...over,
  } as ExchangeRateWatch;
}

describe('partitionRateAlerts', () => {
  it('separates the alerts still waiting from the ones that already fired', () => {
    const groups = partitionRateAlerts([
      watch({ id: 'a' }),
      watch({ id: 'b', isActive: false, triggeredAt: '2026-09-02T10:00:00.000Z' as unknown as Date }),
    ]);

    expect(groups.active.map((w) => w.id)).toEqual(['a']);
    expect(groups.triggered.map((w) => w.id)).toEqual(['b']);
  });

  it('puts the newest waiting alert first', () => {
    const groups = partitionRateAlerts([
      watch({ id: 'older', createdAt: '2026-08-01T10:00:00.000Z' as unknown as Date }),
      watch({ id: 'newer', createdAt: '2026-09-01T10:00:00.000Z' as unknown as Date }),
    ]);

    expect(groups.active.map((w) => w.id)).toEqual(['newer', 'older']);
  });

  it('puts the most recently fired alert first', () => {
    const fired = (id: string, at: string) =>
      watch({ id, isActive: false, triggeredAt: at as unknown as Date });
    const groups = partitionRateAlerts([
      fired('first', '2026-08-20T10:00:00.000Z'),
      fired('last', '2026-09-02T10:00:00.000Z'),
    ]);

    expect(groups.triggered.map((w) => w.id)).toEqual(['last', 'first']);
  });

  it('sorts a fired alert with no timestamp last instead of throwing', () => {
    // triggeredAt is nullable on the entity, so a row can arrive without one.
    const groups = partitionRateAlerts([
      watch({ id: 'no-date', isActive: false, triggeredAt: null }),
      watch({ id: 'dated', isActive: false, triggeredAt: '2026-09-02T10:00:00.000Z' as unknown as Date }),
    ]);

    expect(groups.triggered.map((w) => w.id)).toEqual(['dated', 'no-date']);
  });

  it('caps the fired history, since the server returns every alert ever', () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      watch({
        id: `t${i}`,
        isActive: false,
        triggeredAt: `2026-08-${String(i + 1).padStart(2, '0')}T10:00:00.000Z` as unknown as Date,
      }),
    );

    expect(partitionRateAlerts(many).triggered).toHaveLength(10);
    expect(partitionRateAlerts(many, { maxTriggered: 3 }).triggered).toHaveLength(3);
  });

  it('never caps the waiting alerts — the user has to be able to delete every one', () => {
    const many = Array.from({ length: 20 }, (_, i) => watch({ id: `a${i}` }));

    expect(partitionRateAlerts(many).active).toHaveLength(20);
  });

  it('returns empty groups for an empty list', () => {
    expect(partitionRateAlerts([])).toEqual({ active: [], triggered: [] });
  });
});
