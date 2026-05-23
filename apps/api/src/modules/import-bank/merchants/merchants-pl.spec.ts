import { suggestCategoryFromMerchantPL } from './merchants-pl';

describe('suggestCategoryFromMerchantPL', () => {
  it('returns category for known PL merchant', () => {
    expect(suggestCategoryFromMerchantPL('BIEDRONKA 5234 WARSZAWA')).toBe('Groceries');
    expect(suggestCategoryFromMerchantPL('ZABKA Z1234')).toBe('Groceries');
    expect(suggestCategoryFromMerchantPL('ALLEGRO.PL')).toBe('Shopping');
    expect(suggestCategoryFromMerchantPL('ORLEN STACJA 412')).toBe('Transport');
  });

  it('returns undefined for unknown merchant', () => {
    expect(suggestCategoryFromMerchantPL('NIEZNANY SKLEP XYZ')).toBeUndefined();
    expect(suggestCategoryFromMerchantPL('')).toBeUndefined();
  });

  it('is case-insensitive', () => {
    expect(suggestCategoryFromMerchantPL('biedronka warszawa')).toBe('Groceries');
  });
});
