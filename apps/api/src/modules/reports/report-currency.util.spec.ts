import {
  buildCategoryTotals,
  convertRowsToBase,
  needsConversion,
} from './report-currency.util';

// `1 base = rates[X] X`, so amount_in_PLN = amount / rates[from].
const RATES_PLN = { PLN: 1, EUR: 0.25, USD: 0.27 };

type Row = { amount: unknown; currencyCode: string; category?: { name: string } | null };

describe('needsConversion', () => {
  it('is false for a single-currency report, so no rate call is made', () => {
    expect(
      needsConversion([{ amount: 10, currencyCode: 'PLN' }, { amount: 20, currencyCode: 'PLN' }], 'PLN'),
    ).toBe(false);
  });

  it('is true as soon as one row differs', () => {
    expect(
      needsConversion([{ amount: 10, currencyCode: 'PLN' }, { amount: 12, currencyCode: 'EUR' }], 'PLN'),
    ).toBe(true);
  });
});

describe('convertRowsToBase', () => {
  it('does not add 12 EUR to a PLN total as 12 zloty', () => {
    // The exact shape of the reported bug: a Hetzner EUR charge inside a PLN report.
    const result = convertRowsToBase<Row>(
      [
        { amount: 100, currencyCode: 'PLN' },
        { amount: 12, currencyCode: 'EUR' },
      ],
      'PLN',
      RATES_PLN,
    );
    expect(result.total).toBe(148); // 100 + 12/0.25
    expect(result.fxConverted).toBe(true);
    expect(result.fxApproximate).toBe(false);
  });

  it('leaves a single-currency report untouched and never flags it', () => {
    const result = convertRowsToBase<Row>(
      [
        { amount: 10.5, currencyCode: 'PLN' },
        { amount: 20.25, currencyCode: 'PLN' },
      ],
      'PLN',
      null,
    );
    expect(result.total).toBe(30.75);
    expect(result.fxConverted).toBe(false);
    expect(result.fxApproximate).toBe(false);
    expect(result.rows).toHaveLength(2);
  });

  it('EXCLUDES an amount whose rate is unknown rather than mislabelling it', () => {
    const result = convertRowsToBase<Row>(
      [
        { amount: 100, currencyCode: 'PLN' },
        { amount: 50, currencyCode: 'GBP' },
      ],
      'PLN',
      RATES_PLN,
    );
    expect(result.total).toBe(100);
    expect(result.rows).toHaveLength(1);
    expect(result.fxApproximate).toBe(true);
  });

  it('excludes every foreign amount when the rate provider is down', () => {
    const result = convertRowsToBase<Row>(
      [
        { amount: 100, currencyCode: 'PLN' },
        { amount: 12, currencyCode: 'EUR' },
      ],
      'PLN',
      null,
    );
    expect(result.total).toBe(100);
    expect(result.fxApproximate).toBe(true);
    expect(result.fxConverted).toBe(false);
  });

  it('accepts Prisma Decimal-ish values that stringify to a number', () => {
    const result = convertRowsToBase<Row>(
      [{ amount: '19.99' as unknown, currencyCode: 'PLN' }],
      'PLN',
      null,
    );
    expect(result.total).toBe(19.99);
  });

  it('flags a non-numeric amount instead of summing NaN', () => {
    const result = convertRowsToBase<Row>(
      [
        { amount: 10, currencyCode: 'PLN' },
        { amount: 'not a number' as unknown, currencyCode: 'PLN' },
      ],
      'PLN',
      null,
    );
    expect(result.total).toBe(10);
    expect(result.fxApproximate).toBe(true);
  });

  it('handles an empty report', () => {
    const result = convertRowsToBase<Row>([], 'PLN', null);
    expect(result).toEqual({ rows: [], total: 0, fxConverted: false, fxApproximate: false });
  });
});

describe('buildCategoryTotals', () => {
  const nameOf = (r: Row) => r.category?.name || '';

  it('groups converted amounts, sorts by size and derives percentages from the converted total', () => {
    const converted = convertRowsToBase<Row>(
      [
        { amount: 100, currencyCode: 'PLN', category: { name: 'Groceries' } },
        { amount: 12, currencyCode: 'EUR', category: { name: 'Bills' } }, // -> 48 PLN
        { amount: 52, currencyCode: 'PLN', category: { name: 'Groceries' } },
      ],
      'PLN',
      RATES_PLN,
    );

    const cats = buildCategoryTotals(converted.rows, nameOf, converted.total);

    expect(converted.total).toBe(200);
    expect(cats).toEqual([
      { name: 'Groceries', amount: 152, percentage: 76 },
      { name: 'Bills', amount: 48, percentage: 24 },
    ]);
  });

  it('labels rows without a category', () => {
    const converted = convertRowsToBase<Row>(
      [{ amount: 10, currencyCode: 'PLN', category: null }],
      'PLN',
      null,
    );
    expect(buildCategoryTotals(converted.rows, nameOf, converted.total)[0].name).toBe(
      'Uncategorized',
    );
  });

  it('does not divide by zero on an empty total', () => {
    expect(buildCategoryTotals([], nameOf, 0)).toEqual([]);
  });
});
