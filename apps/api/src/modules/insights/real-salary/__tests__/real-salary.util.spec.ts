import { computePersonalInflation, realChange, round1, RECEIPT_MIN_PRODUCTS } from '../real-salary.util';

const PL = { TOTAL: 3.5, CP01: -0.8, CP04: 5.1, CP07: 5.4, CP11: 4.1 } as const;

describe('computePersonalInflation', () => {
  it('weights official division rates by the account spend', () => {
    const r = computePersonalInflation({
      spend: [{ division: 'CP04', amount: 3000 }, { division: 'CP07', amount: 1000 }],
      officialRates: PL, receiptIndexPct: null, receiptProductCount: 0,
    })!;
    // (3000*5.1 + 1000*5.4) / 4000 = 5.175
    expect(r.inflationPct).toBe(5.2);
    expect(r.breakdown).toEqual([
      { division: 'CP04', weight: 0.75, ratePct: 5.1, source: 'official' },
      { division: 'CP07', weight: 0.25, ratePct: 5.4, source: 'official' },
    ]);
    expect(r.topDrivers).toEqual(['CP04', 'CP07']);
  });

  it('merges repeated divisions before weighting', () => {
    const r = computePersonalInflation({
      spend: [{ division: 'CP07', amount: 100 }, { division: 'CP07', amount: 300 }],
      officialRates: PL, receiptIndexPct: null, receiptProductCount: 0,
    })!;
    expect(r.breakdown).toEqual([{ division: 'CP07', weight: 1, ratePct: 5.4, source: 'official' }]);
  });

  it(`uses the receipt index for CP01 only from ${RECEIPT_MIN_PRODUCTS} products`, () => {
    const base = { spend: [{ division: 'CP01' as const, amount: 1000 }], officialRates: PL, receiptIndexPct: 8.3 };
    expect(computePersonalInflation({ ...base, receiptProductCount: RECEIPT_MIN_PRODUCTS })!.breakdown[0])
      .toEqual({ division: 'CP01', weight: 1, ratePct: 8.3, source: 'receipts' });
    expect(computePersonalInflation({ ...base, receiptProductCount: RECEIPT_MIN_PRODUCTS - 1 })!.breakdown[0])
      .toEqual({ division: 'CP01', weight: 1, ratePct: -0.8, source: 'official' });
  });

  it('missing division rate falls back to TOTAL', () => {
    const r = computePersonalInflation({
      spend: [{ division: 'CP13', amount: 500 }], officialRates: PL, receiptIndexPct: null, receiptProductCount: 0,
    })!;
    expect(r.breakdown[0]).toEqual({ division: 'CP13', weight: 1, ratePct: 3.5, source: 'official' });
  });

  it('all uncategorized → national total', () => {
    const r = computePersonalInflation({
      spend: [{ division: 'TOTAL', amount: 2000 }], officialRates: PL, receiptIndexPct: null, receiptProductCount: 0,
    })!;
    expect(r.inflationPct).toBe(3.5);
  });

  it('receipts-only when there is no official data: only CP01 spend is weighted', () => {
    const r = computePersonalInflation({
      spend: [{ division: 'CP01', amount: 600 }, { division: 'CP04', amount: 400 }],
      officialRates: {}, receiptIndexPct: 6, receiptProductCount: 25,
    })!;
    expect(r.inflationPct).toBe(6);
    expect(r.breakdown).toEqual([{ division: 'CP01', weight: 1, ratePct: 6, source: 'receipts' }]);
  });

  it('non-EU and thin receipts → no_inflation_source (null)', () => {
    expect(computePersonalInflation({
      spend: [{ division: 'CP01', amount: 600 }], officialRates: {}, receiptIndexPct: 6, receiptProductCount: 3,
    })).toBeNull();
  });

  it('no spend → null', () => {
    expect(computePersonalInflation({ spend: [], officialRates: PL, receiptIndexPct: null, receiptProductCount: 0 })).toBeNull();
  });

  it('topDrivers keeps at most three positive contributors, highest first', () => {
    const r = computePersonalInflation({
      spend: [
        { division: 'CP01', amount: 1000 }, { division: 'CP04', amount: 1000 },
        { division: 'CP07', amount: 1000 }, { division: 'CP11', amount: 1000 }, { division: 'TOTAL', amount: 1000 },
      ],
      officialRates: PL, receiptIndexPct: null, receiptProductCount: 0,
    })!;
    expect(r.topDrivers).toEqual(['CP07', 'CP04', 'CP11']);
  });
});

describe('realChange', () => {
  it('divides rather than subtracts', () => {
    // (1.05 / 1.083) - 1 = -3.047 %; required (1.083/1.05) - 1 = 3.14 %
    expect(realChange(5, 8.3)).toEqual({ realChangePct: -3, requiredRaisePct: 3.1 });
  });
  it('zero/zero gives clean zeros', () => {
    const r = realChange(0, 0);
    expect(Object.is(r.realChangePct, -0)).toBe(false);
    expect(r).toEqual({ realChangePct: 0, requiredRaisePct: 0 });
  });
  it('ahead of inflation gives a negative required raise', () => {
    expect(realChange(10, 4).requiredRaisePct).toBeLessThan(0);
  });
});

describe('round1', () => {
  it('rounds to one decimal and never returns -0', () => {
    expect(round1(3.14159)).toBe(3.1);
    expect(Object.is(round1(-0.04), -0)).toBe(false);
  });
});
