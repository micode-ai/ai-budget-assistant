import { isPromoConfirmed, promoKey } from './community-promo.util';

const row = (contributorKey: string, trusted = false, isAdmin = false) => ({ contributorKey, trusted, isAdmin });

describe('isPromoConfirmed', () => {
  it('3 contributors with 2 trusted → confirmed', () => {
    expect(isPromoConfirmed([row('a', true), row('b', true), row('c')], 3, 2)).toBe(true);
  });

  it('3 contributors with 1 trusted → not confirmed', () => {
    expect(isPromoConfirmed([row('a', true), row('b'), row('c')], 3, 2)).toBe(false);
  });

  it('1 admin row → confirmed', () => {
    expect(isPromoConfirmed([row('admin', true, true)], 3, 2)).toBe(true);
  });

  it('the same contributor twice counts once', () => {
    expect(isPromoConfirmed([row('a', true), row('a', true), row('b', true)], 3, 2)).toBe(false);
    expect(isPromoConfirmed([row('a', true), row('a', true), row('b', true), row('c')], 3, 2)).toBe(true);
  });

  it('a contributor counts as trusted when any of their rows is trusted', () => {
    expect(isPromoConfirmed([row('a'), row('a', true), row('b', true), row('c')], 3, 2)).toBe(true);
  });

  it('no rows → not confirmed', () => {
    expect(isPromoConfirmed([], 3, 2)).toBe(false);
  });
});

describe('promoKey', () => {
  const base = {
    chain: 'biedronka',
    canonicalName: 'Masło Łaciate 200g',
    promoPrice: 4.99,
    currencyCode: 'PLN',
    validFrom: '2026-11-10',
    validTo: '2026-11-16',
  };

  it('is stable across Date / string dates and number / string prices', () => {
    const fromDates = promoKey({
      ...base,
      promoPrice: '4.990',
      validFrom: new Date('2026-11-10T00:00:00.000Z'),
      validTo: new Date('2026-11-16T00:00:00.000Z'),
    });
    expect(fromDates).toBe(promoKey(base));
  });

  it('differs when any part of the promo differs', () => {
    const k = promoKey(base);
    expect(promoKey({ ...base, chain: 'lidl' })).not.toBe(k);
    expect(promoKey({ ...base, canonicalName: 'Masło 200g' })).not.toBe(k);
    expect(promoKey({ ...base, promoPrice: 5.49 })).not.toBe(k);
    expect(promoKey({ ...base, currencyCode: 'EUR' })).not.toBe(k);
    expect(promoKey({ ...base, validFrom: '2026-11-11' })).not.toBe(k);
    expect(promoKey({ ...base, validTo: '2026-11-17' })).not.toBe(k);
  });

  it('cannot be forged by moving a separator between fields', () => {
    expect(promoKey({ ...base, chain: 'a|b', canonicalName: 'c' })).not.toBe(
      promoKey({ ...base, chain: 'a', canonicalName: 'b|c' }),
    );
  });
});
