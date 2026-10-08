import type { InboundReceiptDetail } from '@budget/shared-types';
import { inboundScannerState, mapInboundToScanned } from '../seedFromInbound';

function detail(over: Partial<InboundReceiptDetail> = {}): InboundReceiptDetail {
  return {
    id: 'r1',
    status: 'pending',
    kind: 'receipt',
    fromAddress: 'paragony@biedronka.pl',
    fromDomain: 'biedronka.pl',
    subject: 'Twoj paragon',
    total: 45.2,
    currencyCode: 'PLN',
    merchant: 'Biedronka',
    date: '2026-10-02',
    documentKind: 'image',
    errorCode: null,
    verificationCode: null,
    createdAt: '2026-10-02T10:00:00Z',
    expiresAt: '2026-10-09T10:00:00Z',
    extraction: {
      amount: 45.2,
      discountAmount: 3,
      depositAmount: null,
      currencyCode: 'PLN',
      description: 'Zakupy spozywcze',
      categoryId: null,
      categorySuggestion: 'Groceries',
      merchant: 'BIEDRONKA',
      date: '2026-10-02',
      confidence: 0.92,
      receiptItems: [{ description: 'Mleko', totalPrice: 4.5 }],
      location: null,
      categorySplits: [],
      fingerprint: 'fp-123',
    },
    possibleDuplicate: null,
    hasDocument: true,
    documentMimeType: 'image/jpeg',
    expenseId: null,
    senderVerified: true,
    ...over,
  };
}

describe('mapInboundToScanned', () => {
  // Catches: dropping `fingerprint`, which useReceiptSave hands to addExpense as
  // receiptFingerprint - without it a later re-upload of the same file is not caught
  // before OCR (ABA-603) and the e-mail copy is invisible to dedup.
  it('carries the extraction, including the fingerprint, onto the scanner shape', () => {
    const s = mapInboundToScanned(detail())!;
    expect(s.amount).toBe(45.2);
    expect(s.discountAmount).toBe(3);
    expect(s.currencyCode).toBe('PLN');
    expect(s.merchant).toBe('BIEDRONKA');
    expect(s.categorySuggestion).toBe('Groceries');
    expect(s.receiptItems).toHaveLength(1);
    expect(s.fingerprint).toBe('fp-123');
  });

  // Catches: reading the duplicate from the stored JSON. The server recomputes it at
  // read time (no AI) and that is the only copy that sees expenses saved since.
  it('takes possibleDuplicate from the detail, not from the stored extraction', () => {
    const match = { expenseId: 'e1', kind: 'likely' } as unknown as InboundReceiptDetail['possibleDuplicate'];
    const d = detail({ possibleDuplicate: match });
    (d.extraction as Record<string, unknown>).possibleDuplicate = { expenseId: 'stale' };
    expect(mapInboundToScanned(d)!.possibleDuplicate).toBe(match);
    expect(mapInboundToScanned(detail())!.possibleDuplicate).toBeNull();
  });

  // Catches: an empty confirm card for an item with no readable total - saving it would
  // create a zero-amount expense.
  it('returns null without a positive total', () => {
    expect(mapInboundToScanned(detail({ extraction: null }))).toBeNull();
    expect(mapInboundToScanned(detail({ extraction: { amount: 0 }, total: 0 }))).toBeNull();
  });

  // Catches: a stringly-typed JSON amount reaching addExpense as a string.
  it('coerces numeric strings and falls back to list fields', () => {
    const s = mapInboundToScanned(detail({ extraction: { amount: '19.99' }, currencyCode: 'EUR' }))!;
    expect(s.amount).toBe(19.99);
    expect(s.currencyCode).toBe('EUR');
    expect(s.merchant).toBe('Biedronka');
  });
});

describe('inboundScannerState', () => {
  // Catches: showing the image preview and the "save image" checkbox for a PDF or a
  // text body, where there is no image to store (useReceiptSave attaches no PDF).
  it('shows an image only for a downloaded image document', () => {
    expect(inboundScannerState(detail(), 'file:///x.jpg')).toMatchObject({ imageUri: 'file:///x.jpg', isPdf: false });
    expect(inboundScannerState(detail(), null)).toMatchObject({ imageUri: null, isPdf: true });
    expect(inboundScannerState(detail({ documentKind: 'pdf' }), null)).toMatchObject({ imageUri: null, isPdf: true });
    expect(inboundScannerState(detail({ documentKind: 'text' }), 'file:///x.jpg')).toMatchObject({ imageUri: null, isPdf: true });
  });
});
