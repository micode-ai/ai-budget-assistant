import { isDiscountLine, extractReceiptDiscounts } from './receipt-discount';

describe('receipt-discount util', () => {
  describe('isDiscountLine', () => {
    it('flags a negative line with a discount label', () => {
      expect(isDiscountLine({ description: 'OPUST PIWO HEINEKEN 0,5l-A', totalPrice: -8 })).toBe(true);
      expect(isDiscountLine({ description: 'Mielone Z Łop 500g Rabat', totalPrice: -5.5 })).toBe(true);
      expect(isDiscountLine({ description: 'Lidl Plus kupon', totalPrice: -6.87 })).toBe(true);
      expect(isDiscountLine({ description: 'Rabat', totalPrice: -7.5 })).toBe(true);
    });

    it('does NOT flag a positive product even if its name contains a label-like stem', () => {
      // positive price → never a discount line, regardless of text
      expect(isDiscountLine({ description: 'Bonduelle Kukurydza', totalPrice: 4.99 })).toBe(false);
      expect(isDiscountLine({ description: 'Rabatte Zupa', totalPrice: 3.2 })).toBe(false);
    });

    it('does NOT flag a negative line without a discount label (e.g. a deposit return)', () => {
      expect(isDiscountLine({ description: 'Kaucja zwrot butelki', totalPrice: -0.5 })).toBe(false);
    });
  });

  describe('extractReceiptDiscounts', () => {
    const items = [
      { description: 'PIWO HEINEKEN 0,5B', totalPrice: 49.9 },
      { description: 'OPUST PIWO HEINEKEN 0,5l-A', totalPrice: -8 },
      { description: 'Mleko Łaciate', totalPrice: 4.99 },
      { description: 'Lidl Plus kupon', totalPrice: -6.87 },
    ];

    it('removes discount lines from the item list and keeps only products', () => {
      const r = extractReceiptDiscounts(items, null);
      expect(r.items.map((i) => i.description)).toEqual(['PIWO HEINEKEN 0,5B', 'Mleko Łaciate']);
      expect(r.removedCount).toBe(2);
    });

    it('derives the discount from the pulled lines when the model set none', () => {
      const r = extractReceiptDiscounts(items, null);
      expect(r.discount).toBe(14.87); // 8 + 6.87
    });

    it('keeps the existing discount when it already covers the lines (no double count)', () => {
      const r = extractReceiptDiscounts(items, 14.87);
      expect(r.discount).toBe(14.87);
    });

    it('uses the larger value when the existing discount is smaller than the lines', () => {
      const r = extractReceiptDiscounts(items, 8);
      expect(r.discount).toBe(14.87);
    });

    it('leaves items and discount untouched when there are no discount lines', () => {
      const clean = [
        { description: 'PIWO HEINEKEN', totalPrice: 49.9 },
        { description: 'Mleko', totalPrice: 4.99 },
      ];
      const r = extractReceiptDiscounts(clean, 5);
      expect(r.items).toHaveLength(2);
      expect(r.discount).toBe(5);
      expect(r.removedCount).toBe(0);
    });

    it('never mutates the paid total — it only returns items + discount', () => {
      // sanity: the util has no access to `amount`; product prices are unchanged
      const r = extractReceiptDiscounts(items, null);
      expect(r.items.map((i) => i.totalPrice)).toEqual([49.9, 4.99]);
    });
  });
});
