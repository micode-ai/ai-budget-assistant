import { buildStoreMapPoints } from '../buildStoreMapPoints';

describe('buildStoreMapPoints', () => {
  it('maps stores with coords to points and skips those without / null-island', () => {
    const { points } = buildStoreMapPoints([
      { merchantName: 'Lidl', estimatedTotal: 12.5, lat: 52.2, lng: 21.0, coveredItems: 3, totalItems: 3, missingItems: [], hasStale: false, isCheapest: true },
      { merchantName: 'NoGeo', estimatedTotal: 9, coveredItems: 2, totalItems: 3, missingItems: [], hasStale: false, isCheapest: false },
      { merchantName: 'Null', estimatedTotal: 5, lat: 0, lng: 0, coveredItems: 1, totalItems: 3, missingItems: [], hasStale: false, isCheapest: false },
    ] as any, 'PLN');
    expect(points.map((p) => p.id)).toEqual(['Lidl']);
    expect(points[0].title).toBe('Lidl');
    // formatCurrency uses the pl-PL locale for PLN (comma decimal separator),
    // so this checks the formatted PLN amount rather than the brief's literal
    // '12.5' (which assumes a dot-decimal locale).
    expect(points[0].amountLabel).toContain('12,50');
  });

  it('counts stores without coords or at null-island as missing', () => {
    const { missingCount } = buildStoreMapPoints([
      { merchantName: 'NoGeo', estimatedTotal: 9, coveredItems: 2, totalItems: 3, missingItems: [], hasStale: false, isCheapest: false },
      { merchantName: 'Null', estimatedTotal: 5, lat: 0, lng: 0, coveredItems: 1, totalItems: 3, missingItems: [], hasStale: false, isCheapest: false },
    ] as any, 'PLN');
    expect(missingCount).toBe(2);
  });

  it('appends the distance in km when present', () => {
    const { points } = buildStoreMapPoints([
      { merchantName: 'Biedronka', estimatedTotal: 20, lat: 52.2, lng: 21.0, distanceKm: 1.4, coveredItems: 3, totalItems: 3, missingItems: [], hasStale: false, isCheapest: false },
    ] as any, 'PLN');
    expect(points[0].amountLabel).toContain('1.4');
    expect(points[0].amountLabel).toContain('km');
  });
});
