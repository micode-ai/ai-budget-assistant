import type { Expense } from '@budget/shared-types';
import { expensesToVisits } from '../expensesToVisits';

const base = {
  id: 'e1',
  accountId: 'a1',
  amount: 10,
  currencyCode: 'PLN',
  date: '2026-08-14',
  source: 'ocr',
} as unknown as Expense;

describe('expensesToVisits', () => {
  it('reads the nested location shape', () => {
    const visits = expensesToVisits([
      { ...base, merchant: 'Biedronka', location: { lat: 52.0, lng: 21.0 } } as Expense,
    ]);

    expect(visits).toEqual([{ merchant: 'Biedronka', lat: 52.0, lng: 21.0, source: 'ocr' }]);
  });

  it('reads the flat column shape the API sends', () => {
    const visits = expensesToVisits([
      { ...base, merchant: 'Lidl', locationLat: 52.5, locationLng: 21.5 } as unknown as Expense,
    ]);

    expect(visits).toEqual([{ merchant: 'Lidl', lat: 52.5, lng: 21.5, source: 'ocr' }]);
  });

  it('skips expenses with no merchant, and trims the ones it keeps', () => {
    const visits = expensesToVisits([
      { ...base, merchant: '   ', location: { lat: 52.0, lng: 21.0 } } as Expense,
      { ...base, merchant: '  Zabka ', location: { lat: 52.0, lng: 21.0 } } as Expense,
    ]);

    expect(visits.map((v) => v.merchant)).toEqual(['Zabka']);
  });

  it('skips expenses with no usable coordinate, including Decimal strings from the API', () => {
    const visits = expensesToVisits([
      { ...base, merchant: 'Biedronka' } as Expense,
      { ...base, merchant: 'Lidl', locationLat: '52.5', locationLng: '21.5' } as unknown as Expense,
    ]);

    expect(visits).toEqual([]);
  });

  it('carries source through untouched, so the matcher can filter on it', () => {
    const visits = expensesToVisits([
      { ...base, merchant: 'Netflix', source: 'manual', location: { lat: 52.0, lng: 21.0 } } as Expense,
    ]);

    expect(visits[0].source).toBe('manual');
  });
});
