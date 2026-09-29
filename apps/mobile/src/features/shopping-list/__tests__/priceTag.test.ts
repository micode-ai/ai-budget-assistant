import type { ScanPriceTagResponse } from '@budget/shared-types';
import { isEmptyPriceTag, priceTagToFields, type PriceTagNoteLabels } from '../priceTag';

const labels: PriceTagNoteLabels = {
  regular: (p) => `regular ${p}`,
  promoUntil: (d) => `promo until ${d}`,
  loyaltyCard: 'with loyalty card',
  foreignPrice: (p) => `on tag ${p}`,
};
const fmt = (n: number, c: string) => `${n.toFixed(2)} ${c}`;

const base: ScanPriceTagResponse = {
  productName: 'Mleko UHT',
  price: 3.49,
  currencyCode: 'PLN',
  size: null,
  unitPriceText: null,
  regularPrice: null,
  promoUntil: null,
  requiresLoyaltyCard: false,
};

describe('priceTagToFields', () => {
  it('takes name and price, no note when there are no extras', () => {
    expect(priceTagToFields(base, 'PLN', labels, fmt)).toEqual({
      name: 'Mleko UHT',
      unitPrice: 3.49,
      note: null,
    });
  });

  it('joins the extras into the note in a fixed order', () => {
    const r = priceTagToFields(
      { ...base, size: '1 l', unitPriceText: '3,49 zł/l', regularPrice: 4.29, promoUntil: '05.10', requiresLoyaltyCard: true },
      'PLN',
      labels,
      fmt,
    );
    expect(r.note).toBe('1 l · 3,49 zł/l · regular 4.29 PLN · promo until 05.10 · with loyalty card');
  });

  it('never uses a price in another currency as the item price', () => {
    const r = priceTagToFields({ ...base, currencyCode: 'EUR', price: 2.99 }, 'PLN', labels, fmt);
    expect(r.unitPrice).toBeNull();
    expect(r.note).toBe('on tag 2.99 EUR');
  });

  it('treats a tag with no currency as the list currency', () => {
    expect(priceTagToFields({ ...base, currencyCode: null }, 'PLN', labels, fmt).unitPrice).toBe(3.49);
  });
});

describe('isEmptyPriceTag', () => {
  it('is true only when nothing usable was read', () => {
    expect(isEmptyPriceTag({ ...base, productName: null, price: null })).toBe(true);
    expect(isEmptyPriceTag({ ...base, productName: null })).toBe(false);
  });
});
