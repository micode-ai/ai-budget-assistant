import { suggestCategoryFromMerchantPL, normalizeMerchantPL } from './merchants-pl';

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

describe('normalizeMerchantPL', () => {
  it('collapses store-variant names to the canonical brand', () => {
    expect(normalizeMerchantPL('BIEDRONKA 1234 WARSZAWA')).toBe('Biedronka');
    expect(normalizeMerchantPL('BIEDRONKA 5678 KRAKOW')).toBe('Biedronka');
  });
  it('matches case-insensitively and handles diacritic brands', () => {
    expect(normalizeMerchantPL('zabka z5351')).toBe('Żabka');
    expect(normalizeMerchantPL('ŻABKA NANO 99')).toBe('Żabka');
  });
  it('handles multi-word brand keys', () => {
    expect(normalizeMerchantPL('PŁATNOŚĆ MEDIA MARKT GALERIA')).toBe('Media Markt');
  });
  it('returns the original name unchanged for unknown merchants', () => {
    expect(normalizeMerchantPL('Sklep U Janka')).toBe('Sklep U Janka');
  });
  it('passes through undefined', () => {
    expect(normalizeMerchantPL(undefined)).toBeUndefined();
  });
  it('is idempotent on an already-canonical name', () => {
    expect(normalizeMerchantPL('Biedronka')).toBe('Biedronka');
  });
});
