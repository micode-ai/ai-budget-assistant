import { buildReceiptPrefill } from '../receiptPrefill';
import type { ScannedReceipt } from '@/features/receipt/useReceiptScanner';

function receipt(over: Partial<ScannedReceipt> = {}): ScannedReceipt {
  return {
    amount: 233.98,
    discountAmount: null,
    depositAmount: null,
    currencyCode: 'PLN',
    description: 'Biedronka',
    categoryId: null,
    categorySuggestion: null,
    merchant: 'BIEDRONKA 1234',
    date: '2026-09-06',
    confidence: 0.9,
    receiptItems: [],
    location: null,
    ...over,
  };
}

/**
 * The production changes these catch, named before writing:
 *  - dropping the `categorySuggestion` -> local-id fallback, so a scan whose
 *    category the model named (rather than resolved) opens the form with no
 *    category at all;
 *  - preferring the suggestion over an already-resolved `categoryId`;
 *  - dropping `merchant.trim()`, which puts a trailing space into the merchant
 *    column and mints a second, near-identical merchant in the Merchants screen;
 *  - passing the user's corrected merchant vs. the raw OCR read — the two
 *    differ exactly when the user fixed a misread.
 */
describe('buildReceiptPrefill', () => {
  const never = () => {
    throw new Error('should not be consulted');
  };

  it('uses an already-resolved category id and never consults the lookup', () => {
    const out = buildReceiptPrefill({
      receipt: receipt({ categoryId: 'cat-1', categorySuggestion: 'Groceries' }),
      merchant: 'Biedronka',
      resolveCategoryByName: never,
    });
    expect(out.categoryId).toBe('cat-1');
  });

  it('falls back to resolving the suggested category name', () => {
    const out = buildReceiptPrefill({
      receipt: receipt({ categorySuggestion: 'Groceries' }),
      merchant: 'Biedronka',
      resolveCategoryByName: (name) => (name === 'Groceries' ? 'cat-9' : undefined),
    });
    expect(out.categoryId).toBe('cat-9');
  });

  it('leaves the category empty when the suggested name matches nothing local', () => {
    const out = buildReceiptPrefill({
      receipt: receipt({ categorySuggestion: 'Kaucja' }),
      merchant: 'Biedronka',
      resolveCategoryByName: () => undefined,
    });
    expect(out.categoryId).toBe('');
  });

  it('leaves the category empty when the scan suggested nothing', () => {
    const out = buildReceiptPrefill({
      receipt: receipt(),
      merchant: 'Biedronka',
      resolveCategoryByName: never,
    });
    expect(out.categoryId).toBe('');
  });

  it("carries the user's corrected merchant, trimmed, not the raw OCR read", () => {
    const out = buildReceiptPrefill({
      receipt: receipt({ merchant: 'BIEDRONKA 1234 WARSZAWA' }),
      merchant: '  Biedronka  ',
      resolveCategoryByName: never,
    });
    expect(out.merchant).toBe('Biedronka');
  });

  it('carries amount as a string, plus description and currency', () => {
    const out = buildReceiptPrefill({
      receipt: receipt({ amount: 12, currencyCode: 'EUR', description: 'Lidl' }),
      merchant: 'Lidl',
      resolveCategoryByName: never,
    });
    expect(out).toMatchObject({ amount: '12', currencyCode: 'EUR', description: 'Lidl' });
  });
});
