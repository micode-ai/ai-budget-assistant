import {
  aggregateCommunityPrices,
  aggregateCommunityMap,
  CommunityObservationRow,
  CommunityMapRow,
  DEFAULT_K_ANONYMITY,
} from './community-price-calculator';

function row(over: Partial<CommunityObservationRow> = {}): CommunityObservationRow {
  return {
    merchantNormalized: 'biedronka',
    price: 3.5,
    currencyCode: 'PLN',
    contributorKey: 'k1',
    ...over,
  };
}

// Helper: N rows at one store, each from a distinct contributor.
function storeRows(merchant: string, prices: number[], currency = 'PLN'): CommunityObservationRow[] {
  return prices.map((price, i) =>
    row({ merchantNormalized: merchant, price, currencyCode: currency, contributorKey: `${merchant}-c${i}` }),
  );
}

describe('aggregateCommunityPrices', () => {
  it('returns empty for no rows', () => {
    expect(aggregateCommunityPrices([])).toEqual({ currency: '', stores: [] });
  });

  it('drops a store below the k-anonymity threshold, keeps one at/above it', () => {
    const rows = [
      ...storeRows('biedronka', [3.4, 3.5, 3.6]), // 3 distinct contributors
      ...storeRows('zabka', [4.9, 5.0]), // only 2 — must be dropped
    ];
    const { stores } = aggregateCommunityPrices(rows, 3);
    expect(stores.map((s) => s.merchantName)).toEqual(['Biedronka']);
    expect(stores[0].contributorCount).toBe(3);
  });

  it('never exposes a single user (default K)', () => {
    const rows = storeRows('biedronka', [3.5, 3.6, 3.7, 3.8]); // 4 < DEFAULT_K (5)
    expect(DEFAULT_K_ANONYMITY).toBe(5);
    expect(aggregateCommunityPrices(rows).stores).toHaveLength(0);
  });

  it('does NOT count the same contributor twice toward the K-gate', () => {
    // Same contributor across 4 weeks (allowed — one row per week) is still ONE account.
    const rows = [
      row({ merchantNormalized: 'lidl', price: 3.0, contributorKey: 'same' }),
      row({ merchantNormalized: 'lidl', price: 3.1, contributorKey: 'same' }),
      row({ merchantNormalized: 'lidl', price: 3.2, contributorKey: 'same' }),
    ];
    // 3 rows but only 1 distinct contributor → fails K=3.
    expect(aggregateCommunityPrices(rows, 3).stores).toHaveLength(0);
  });

  it('computes median + min and marks the cheapest store, cheapest-first', () => {
    const rows = [
      ...storeRows('biedronka', [3.0, 4.0, 5.0]), // median 4.0, min 3.0
      ...storeRows('lidl', [2.0, 3.0, 4.0]), // median 3.0, min 2.0 → cheapest
    ];
    const { stores } = aggregateCommunityPrices(rows, 3);
    expect(stores.map((s) => s.merchantName)).toEqual(['Lidl', 'Biedronka']);
    expect(stores[0]).toMatchObject({ merchantName: 'Lidl', medianPrice: 3.0, minPrice: 2.0, isCheapest: true });
    expect(stores[1]).toMatchObject({ merchantName: 'Biedronka', medianPrice: 4.0, isCheapest: false });
  });

  it('filters out extreme outliers before computing the median', () => {
    // One malicious/fat-fingered 100.0 among sane ~3.5 prices must not drag the median.
    const rows = storeRows('biedronka', [3.4, 3.5, 3.6, 3.5, 100.0]); // 5 distinct contributors
    const { stores } = aggregateCommunityPrices(rows, 3);
    expect(stores).toHaveLength(1);
    expect(stores[0].medianPrice).toBeCloseTo(3.5, 2); // outlier excluded from the median
    expect(stores[0].receiptCount).toBe(5); // receiptCount = total observations backing the store
    expect(stores[0].contributorCount).toBe(5); // K-gate counts the full distinct set
  });

  it('picks the majority currency and ignores the rest', () => {
    const rows = [
      ...storeRows('biedronka', [3.4, 3.5, 3.6], 'PLN'), // 3 PLN
      ...storeRows('biedronka-eu', [1.0, 1.1], 'EUR'), // 2 EUR (minority, dropped)
    ];
    const { currency, stores } = aggregateCommunityPrices(rows, 3);
    expect(currency).toBe('PLN');
    expect(stores).toHaveLength(1);
    expect(stores[0].currencyCode).toBe('PLN');
  });
});

describe('aggregateCommunityMap', () => {
  function mrow(over: Partial<CommunityMapRow> = {}): CommunityMapRow {
    return {
      merchantNormalized: 'biedronka',
      region: 'krakow',
      price: 3.5,
      currencyCode: 'PLN',
      contributorKey: 'k1',
      ...over,
    };
  }
  function cell(merchant: string, region: string, prices: number[]): CommunityMapRow[] {
    return prices.map((price, i) => mrow({ merchantNormalized: merchant, region, price, contributorKey: `${merchant}-${region}-c${i}` }));
  }

  it('returns empty for no rows', () => {
    expect(aggregateCommunityMap([])).toEqual([]);
  });

  it('aggregates per (store, region) and gates each cell by K', () => {
    const rows = [
      ...cell('biedronka', 'krakow', [3.4, 3.5, 3.6]), // 3 contributors → passes K=3
      ...cell('biedronka', 'warsaw', [4.0, 4.1]), // 2 contributors → dropped
      ...cell('lidl', 'krakow', [2.0, 2.1, 2.2]), // 3 → passes
    ];
    const aggs = aggregateCommunityMap(rows, 3);
    // krakow biedronka + krakow lidl survive; warsaw biedronka dropped
    expect(aggs).toHaveLength(2);
    const keys = aggs.map((a) => `${a.merchantName}/${a.region}`).sort();
    expect(keys).toEqual(['Biedronka/krakow', 'Lidl/krakow']);
  });

  it('keeps the same store in two regions as two separate cells', () => {
    const rows = [
      ...cell('biedronka', 'krakow', [3.4, 3.5, 3.6]),
      ...cell('biedronka', 'warsaw', [3.9, 4.0, 4.1]),
    ];
    const aggs = aggregateCommunityMap(rows, 3);
    expect(aggs).toHaveLength(2);
    expect(aggs.every((a) => a.merchantName === 'Biedronka')).toBe(true);
    expect(aggs.map((a) => a.region).sort()).toEqual(['krakow', 'warsaw']);
  });

  it('marks the cheapest cell (lowest median)', () => {
    const rows = [
      ...cell('biedronka', 'krakow', [4.0, 4.0, 4.0]),
      ...cell('lidl', 'krakow', [3.0, 3.0, 3.0]),
    ];
    const aggs = aggregateCommunityMap(rows, 3);
    const cheapest = aggs.find((a) => a.isCheapest);
    expect(cheapest?.merchantName).toBe('Lidl');
    expect(aggs.filter((a) => a.isCheapest)).toHaveLength(1);
  });
});
