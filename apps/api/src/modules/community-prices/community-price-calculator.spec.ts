import {
  aggregateCommunityPrices,
  aggregateCommunityMap,
  bucketContributorCount,
  evaluateCommunityCell,
  CommunityObservationRow,
  CommunityMapRow,
  CommunityAggOptions,
  DEFAULT_K_ANONYMITY,
  DEFAULT_MIN_TRUSTED,
} from './community-price-calculator';

function opts(over: Partial<CommunityAggOptions> = {}): Partial<CommunityAggOptions> {
  // Tests that are not about gate (b) switch it off; the ones that are say so.
  return { minTrusted: 0, ...over };
}

function row(over: Partial<CommunityObservationRow> = {}): CommunityObservationRow {
  return {
    merchantNormalized: 'biedronka',
    price: 3.5,
    currencyCode: 'PLN',
    contributorKey: 'k1',
    trusted: true,
    ...over,
  };
}

// N rows at one store, each from a distinct contributor (all trusted unless said otherwise).
function storeRows(
  merchant: string,
  prices: number[],
  over: Partial<CommunityObservationRow> = {},
): CommunityObservationRow[] {
  return prices.map((price, i) =>
    row({ merchantNormalized: merchant, price, contributorKey: `${merchant}-c${i}`, ...over }),
  );
}

describe('defaults', () => {
  it('K is 5 and two trusted clusters are required', () => {
    expect(DEFAULT_K_ANONYMITY).toBe(5);
    expect(DEFAULT_MIN_TRUSTED).toBe(2);
  });
});

describe('bucketContributorCount', () => {
  it.each([
    [5, 5],
    [7, 5],
    [10, 10],
    [19, 10],
    [20, 20],
    [49, 20],
    [50, 50],
    [400, 50],
    [3, 3],
  ])('%i clusters is shown as %i', (n, bucket) => {
    expect(bucketContributorCount(n)).toBe(bucket);
  });
});

describe('aggregateCommunityPrices', () => {
  it('returns empty for no rows', () => {
    expect(aggregateCommunityPrices([])).toEqual({ currency: '', stores: [] });
  });

  it('drops a store below the k-anonymity threshold, keeps one at/above it', () => {
    const rows = [...storeRows('biedronka', [3.4, 3.5, 3.6]), ...storeRows('zabka', [4.9, 5.0])];
    const { stores } = aggregateCommunityPrices(rows, opts({ k: 3 }));
    expect(stores.map((s) => s.merchantName)).toEqual(['Biedronka']);
  });

  it('never exposes a single user (default K)', () => {
    const rows = storeRows('biedronka', [3.5, 3.6, 3.7, 3.8]); // 4 < 5
    expect(aggregateCommunityPrices(rows).stores).toHaveLength(0);
  });

  it('does NOT count the same contributor twice toward the K-gate', () => {
    const rows = [
      row({ merchantNormalized: 'lidl', price: 3.0, contributorKey: 'same', weekStart: '2026-07-06' }),
      row({ merchantNormalized: 'lidl', price: 3.1, contributorKey: 'same', weekStart: '2026-07-13' }),
      row({ merchantNormalized: 'lidl', price: 3.2, contributorKey: 'same', weekStart: '2026-07-20' }),
    ];
    expect(aggregateCommunityPrices(rows, opts({ k: 3 })).stores).toHaveLength(0);
  });

  it('takes ONE value per cluster: a contributor with four weekly rows is one vote, not four', () => {
    // c0 posted 4 weeks of an extreme-but-in-band price; the median is of 5 cluster
    // values, so c0 moves it by exactly one position.
    const rows = [
      ...['2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27'].map((w) =>
        row({ contributorKey: 'c0', price: 3.9, weekStart: w }),
      ),
      row({ contributorKey: 'c1', price: 3.0, weekStart: '2026-07-27' }),
      row({ contributorKey: 'c2', price: 3.1, weekStart: '2026-07-27' }),
      row({ contributorKey: 'c3', price: 3.2, weekStart: '2026-07-27' }),
      row({ contributorKey: 'c4', price: 3.3, weekStart: '2026-07-27' }),
    ];
    const { stores } = aggregateCommunityPrices(rows, opts({ displayFromWeek: '2026-07-06' }));
    // Cluster values: 3.0 3.1 3.2 3.3 3.9 -> median 3.2 (a row-wise median would be 3.9).
    expect(stores[0].medianPrice).toBe(3.2);
  });

  it('collapses a clustered ring into one value and one cluster for the K-gate', () => {
    const clusterMap = new Map([
      ['r1', 'ring'],
      ['r2', 'ring'],
      ['r3', 'ring'],
    ]);
    const rows = [
      ...['r1', 'r2', 'r3'].map((k) => row({ contributorKey: k, price: 2.9 })),
      row({ contributorKey: 'h1', price: 3.0 }),
      row({ contributorKey: 'h2', price: 3.1 }),
    ];
    // 5 raw contributors, only 3 clusters.
    expect(aggregateCommunityPrices(rows, opts({ clusterMap })).stores).toHaveLength(0);
    expect(aggregateCommunityPrices(rows, opts({ clusterMap, k: 3 })).stores).toHaveLength(1);
  });

  describe('MAD outlier filter', () => {
    it('drops a poisoned outlier cluster value and counts k AFTER the filter', () => {
      const rows = storeRows('biedronka', [3.0, 3.1, 3.2, 3.3, 9.0]);
      // The 9.0 is rejected, leaving 4 clusters: below K=5 the cell is not exposed.
      expect(aggregateCommunityPrices(rows, opts()).stores).toHaveLength(0);
      const six = storeRows('biedronka', [3.0, 3.1, 3.2, 3.3, 3.4, 9.0]);
      const { stores } = aggregateCommunityPrices(six, opts());
      expect(stores).toHaveLength(1);
      expect(stores[0].medianPrice).toBe(3.2);
    });

    it('MAD = 0 with the 5% floor: a one-cent change is not rejected', () => {
      const rows = storeRows('biedronka', [3.0, 3.0, 3.0, 3.0, 3.01, 3.0]);
      const { stores } = aggregateCommunityPrices(rows, opts());
      expect(stores).toHaveLength(1);
      expect(stores[0].contributorCount).toBe(5);
    });

    it('MAD = 0 still rejects a value far outside the floor band', () => {
      const rows = storeRows('biedronka', [3.0, 3.0, 3.0, 3.0, 3.0, 4.0]);
      const { stores } = aggregateCommunityPrices(rows, opts());
      expect(stores).toHaveLength(1);
      expect(stores[0].medianPrice).toBe(3.0);
      expect(stores[0].contributorCount).toBe(5); // 6 -> 5 after the filter
    });
  });

  describe('hole-2 regression: the displayed price is backed by K in the display window', () => {
    it('a store with 5 lookback contributors but ONE in-window contributor is NOT exposed', () => {
      const old = ['c0', 'c1', 'c2', 'c3'].map((k) => row({ contributorKey: k, price: 3.0, weekStart: '2026-06-22' }));
      const rows = [...old, row({ contributorKey: 'attacker', price: 0.5, weekStart: '2026-07-27' })];
      const { stores } = aggregateCommunityPrices(rows, opts({ displayFromWeek: '2026-07-27' }));
      expect(stores).toEqual([]);
    });

    it('one malicious account cannot set a price: with four honest clusters it is only a fifth vote among K', () => {
      const honest = ['h0', 'h1', 'h2', 'h3'].map((k, i) =>
        row({ contributorKey: k, price: 3.0 + i * 0.1, weekStart: '2026-07-27' }),
      );
      const rows = [...honest, row({ contributorKey: 'evil', price: 0.4, weekStart: '2026-07-27' })];
      const { stores } = aggregateCommunityPrices(rows, opts({ displayFromWeek: '2026-07-27' }));
      // The fake low is a MAD outlier -> dropped -> only 4 clusters remain -> no cell.
      expect(stores).toEqual([]);
    });
  });

  describe('gate (b): trusted clusters', () => {
    it('five fresh (untrusted) clusters are NOT exposed', () => {
      const rows = storeRows('biedronka', [3.0, 3.1, 3.2, 3.3, 3.4], { trusted: false });
      expect(aggregateCommunityPrices(rows).stores).toEqual([]);
    });

    it('one trusted cluster is not enough, two are', () => {
      const prices = [3.0, 3.1, 3.2, 3.3, 3.4];
      const one = prices.map((price, i) =>
        row({ contributorKey: `c${i}`, price, trusted: i === 0 }),
      );
      const two = prices.map((price, i) =>
        row({ contributorKey: `c${i}`, price, trusted: i < 2 }),
      );
      expect(aggregateCommunityPrices(one).stores).toEqual([]);
      expect(aggregateCommunityPrices(two).stores).toHaveLength(1);
    });

    it('a cluster is trusted when any member is', () => {
      const clusterMap = new Map([
        ['a', 'ring'],
        ['b', 'ring'],
      ]);
      const rows = [
        row({ contributorKey: 'a', price: 3.0, trusted: false }),
        row({ contributorKey: 'b', price: 3.0, trusted: true }),
        row({ contributorKey: 'c', price: 3.1, trusted: true }),
        row({ contributorKey: 'd', price: 3.2, trusted: false }),
        row({ contributorKey: 'e', price: 3.3, trusted: false }),
        row({ contributorKey: 'f', price: 3.4, trusted: false }),
      ];
      expect(aggregateCommunityPrices(rows, { clusterMap }).stores).toHaveLength(1);
    });
  });

  describe('persistence gate', () => {
    it('needs data in at least minWeeks distinct weeks over the lookback', () => {
      const oneWeek = storeRows('biedronka', [3.0, 3.1, 3.2, 3.3, 3.4], { weekStart: '2026-07-27' });
      expect(aggregateCommunityPrices(oneWeek, opts({ minWeeks: 2, displayFromWeek: '2026-07-27' })).stores).toEqual([]);
      const twoWeeks = oneWeek.map((r, i) => (i === 0 ? { ...r, weekStart: '2026-07-20' } : r));
      // c0 has moved to the older week: still 5 in-window clusters needed -> 4 -> no cell
      expect(aggregateCommunityPrices(twoWeeks, opts({ minWeeks: 2, displayFromWeek: '2026-07-27' })).stores).toEqual([]);
      const sixPlusOld = [...oneWeek, row({ contributorKey: 'c0', price: 3.0, weekStart: '2026-07-20' })];
      expect(aggregateCommunityPrices(sixPlusOld, opts({ minWeeks: 2, displayFromWeek: '2026-07-27' })).stores).toHaveLength(1);
    });
  });

  describe('cheapest badge stability', () => {
    function twoStoreRows(drop: number) {
      const prior = (merchant: string, price: number) =>
        [0, 1, 2, 3].map((i) =>
          row({ merchantNormalized: merchant, contributorKey: `${merchant}-p${i}`, price, weekStart: '2026-06-29' }),
        );
      const current = (merchant: string, price: number) =>
        [0, 1, 2, 3, 4].map((i) =>
          row({ merchantNormalized: merchant, contributorKey: `${merchant}-n${i}`, price, weekStart: '2026-07-27' }),
        );
      return [...prior('lidl', 10), ...current('lidl', 10 * (1 - drop)), ...prior('zabka', 11), ...current('zabka', 11)];
    }

    it('a 35% sudden drop shows the price but earns no badge (and no runner-up gets one)', () => {
      const { stores } = aggregateCommunityPrices(twoStoreRows(0.35), opts({ displayFromWeek: '2026-07-27' }));
      expect(stores.map((s) => s.merchantName)).toEqual(['Lidl', 'Zabka']);
      expect(stores[0].medianPrice).toBe(6.5);
      expect(stores.some((s) => s.isCheapest)).toBe(false);
    });

    it('a 20% real promotion keeps the badge', () => {
      const { stores } = aggregateCommunityPrices(twoStoreRows(0.2), opts({ displayFromWeek: '2026-07-27' }));
      expect(stores[0].merchantName).toBe('Lidl');
      expect(stores[0].isCheapest).toBe(true);
    });

    it('without enough prior history (< 3 clusters) the rule cannot fire', () => {
      const rows = storeRows('lidl', [1, 1.1, 1.2, 1.3, 1.4], { weekStart: '2026-07-27' });
      const { stores } = aggregateCommunityPrices(rows, opts({ displayFromWeek: '2026-07-27' }));
      expect(stores[0].isCheapest).toBe(true);
    });
  });

  it('computes the median, marks the cheapest and sorts cheapest-first', () => {
    const rows = [
      ...storeRows('biedronka', [3.0, 3.2, 3.4, 3.6, 3.8]),
      ...storeRows('lidl', [3.6, 3.8, 4.0, 4.2, 4.4]),
    ];
    const { stores } = aggregateCommunityPrices(rows, opts());
    expect(stores.map((s) => s.merchantName)).toEqual(['Biedronka', 'Lidl']);
    expect(stores[0].medianPrice).toBe(3.4);
    expect(stores[0].isCheapest).toBe(true);
    expect(stores[1].isCheapest).toBe(false);
  });

  it('no store object carries a minPrice (it was one contributor\'s exact value)', () => {
    const { stores } = aggregateCommunityPrices(storeRows('biedronka', [3.0, 3.1, 3.2, 3.3, 3.4]), opts());
    expect(stores).toHaveLength(1);
    expect('minPrice' in stores[0]).toBe(false);
    expect(Object.keys(stores[0]).sort()).toEqual(
      ['contributorCount', 'currencyCode', 'isCheapest', 'medianPrice', 'merchantName', 'receiptCount'].sort(),
    );
  });

  it('buckets contributorCount: 7 clusters -> 5', () => {
    const rows = storeRows('biedronka', [3.0, 3.05, 3.1, 3.15, 3.2, 3.25, 3.3]);
    expect(aggregateCommunityPrices(rows, opts()).stores[0].contributorCount).toBe(5);
  });

  it('uses the majority currency and never mixes currencies', () => {
    const rows = [
      ...storeRows('biedronka', [3.0, 3.1, 3.2, 3.3, 3.4, 3.5]),
      row({ contributorKey: 'eur', price: 1, currencyCode: 'EUR' }),
    ];
    const { currency, stores } = aggregateCommunityPrices(rows, opts());
    expect(currency).toBe('PLN');
    expect(stores[0].currencyCode).toBe('PLN');
  });
});

describe('aggregateCommunityMap', () => {
  const mapRow = (over: Partial<CommunityMapRow> = {}): CommunityMapRow => ({
    ...row(),
    region: 'warszawa',
    ...over,
  });
  const cell = (merchant: string, region: string, prices: number[]): CommunityMapRow[] =>
    prices.map((price, i) => mapRow({ merchantNormalized: merchant, region, price, contributorKey: `${merchant}-${region}-${i}` }));

  it('aggregates per (store, region) and gates each cell on its own', () => {
    const rows = [
      ...cell('biedronka', 'warszawa', [3.0, 3.1, 3.2, 3.3, 3.4]),
      ...cell('biedronka', 'krakow', [3.5, 3.6]),
    ];
    const out = aggregateCommunityMap(rows, opts());
    expect(out.map((o) => `${o.merchantNormalized}|${o.region}`)).toEqual(['biedronka|warszawa']);
  });

  it('flags badge eligibility per cell and never sends minPrice or contributor data', () => {
    const out = aggregateCommunityMap(cell('lidl', 'warszawa', [3.0, 3.1, 3.2, 3.3, 3.4]), opts());
    expect(out).toHaveLength(1);
    expect(out[0].badgeEligible).toBe(true);
    expect(Object.keys(out[0]).some((k) => /contributor|min/i.test(k))).toBe(false);
  });

  it('applies the trusted-cluster gate (five untrusted -> not exposed)', () => {
    const rows = cell('lidl', 'warszawa', [3.0, 3.1, 3.2, 3.3, 3.4]).map((r) => ({ ...r, trusted: false }));
    expect(aggregateCommunityMap(rows)).toEqual([]);
  });
});

describe('evaluateCommunityCell', () => {
  it('returns null for an empty group', () => {
    expect(evaluateCommunityCell([], { ...opts(), k: 5, minWeeks: 1, minTrusted: 0, cheapestMaxDropPct: 30 })).toBeNull();
  });
});

describe('ABA-642 audit: persistence on ingest weeks across >= 2 clusters', () => {
  const r = (contributorKey: string, price: number, over: Record<string, unknown> = {}) => ({
    merchantNormalized: 'biedronka',
    price,
    currencyCode: 'PLN',
    contributorKey,
    weekStart: '2026-07-27',
    trusted: true,
    ...over,
  });
  const five = (over: Record<string, unknown> = {}) =>
    ['c0', 'c1', 'c2', 'c3', 'c4'].map((k, i) => r(k, 3 + i * 0.1, over));
  const opts = { k: 5, minTrusted: 2, minWeeks: 2, cheapestMaxDropPct: 0 };

  it('counts INGEST weeks: back-dated receipts ingested in one week are not persistence', () => {
    const rows = [
      ...five({ ingestWeek: '2026-07-27' }),
      r('c0', 3.0, { weekStart: '2026-07-13', ingestWeek: '2026-07-27' }), // old receipt, same ingest week
    ];
    expect(aggregateCommunityPrices(rows, opts).stores).toEqual([]);
    const spread = [...five({ ingestWeek: '2026-07-27' }), r('c0', 3.0, { weekStart: '2026-07-13', ingestWeek: '2026-07-20' })];
    expect(aggregateCommunityPrices(spread, opts).stores).toHaveLength(1);
  });

  it('two weeks supplied by ONE cluster (a ring collapsed by correlation) is not persistence', () => {
    const clusterMap = new Map(['c0', 'c1', 'c2', 'c3', 'c4'].map((k) => [k, 'ring']));
    const rows = [...five({ ingestWeek: '2026-07-27' }), r('c0', 3.0, { weekStart: '2026-07-13', ingestWeek: '2026-07-20' })];
    const cell = evaluateCommunityCell(rows, { ...opts, k: 1, minTrusted: 0, clusterMap });
    expect(cell).toBeNull();
  });

  it('publishes receiptCount as a bucket and caps one cluster weight at 3 rows', () => {
    const heavy = Array.from({ length: 30 }, () => r('c0', 3.0, { ingestWeek: '2026-07-20' }));
    const rows = [...five({ ingestWeek: '2026-07-27' }), ...heavy];
    const cell = evaluateCommunityCell(rows, { ...opts, minWeeks: 2 });
    expect(cell).not.toBeNull();
    expect(cell!.receiptCount).toBe(3 + 4); // c0 capped at 3, four others at 1
    const store = aggregateCommunityPrices(rows, opts).stores[0];
    expect(store.receiptCount).toBe(5); // bucket of 7, not 7 and never 34
    expect(store.medianPrice).toBe(Math.round(store.medianPrice * 100) / 100);
  });
});
