import { normalizePriceTag } from './price-tag.service';

describe('normalizePriceTag', () => {
  it('keeps a well-formed promo reading', () => {
    expect(
      normalizePriceTag({
        productName: '  Mleko   UHT 3,2% ',
        price: 3.49,
        currencyCode: 'pln',
        size: '1 l',
        unitPriceText: '3,49 zł/l',
        regularPrice: '4,29',
        promoUntil: '05.10',
        requiresLoyaltyCard: true,
      }),
    ).toEqual({
      productName: 'Mleko UHT 3,2%',
      price: 3.49,
      currencyCode: 'PLN',
      size: '1 l',
      unitPriceText: '3,49 zł/l',
      regularPrice: 4.29,
      promoUntil: '05.10',
      requiresLoyaltyCard: true,
    });
  });

  it('accepts a comma-decimal price string', () => {
    expect(normalizePriceTag({ price: '12,99' }).price).toBe(12.99);
  });

  it('drops a regular price that is not higher than the current one', () => {
    expect(normalizePriceTag({ price: 5, regularPrice: 5 }).regularPrice).toBeNull();
    expect(normalizePriceTag({ regularPrice: 9 }).regularPrice).toBeNull();
  });

  it('rejects absurd or missing values instead of guessing', () => {
    const r = normalizePriceTag({ price: -1, currencyCode: 'złoty', productName: 42, requiresLoyaltyCard: 'yes' });
    expect(r.price).toBeNull();
    expect(r.currencyCode).toBeNull();
    expect(r.productName).toBeNull();
    expect(r.requiresLoyaltyCard).toBe(false);
  });

  it('returns an all-empty reading for a non-object', () => {
    expect(normalizePriceTag(null).productName).toBeNull();
    expect(normalizePriceTag('text').price).toBeNull();
  });
});
