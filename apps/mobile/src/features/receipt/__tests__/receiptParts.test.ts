import {
  MAX_RECEIPT_PARTS,
  addPart,
  addParts,
  removePart,
  canScan,
  remainingParts,
  scanEncodedParts,
  partsFingerprintInput,
  buildReceiptImageFields,
  retakeState,
  partsTotalsMismatch,
  type ScanPart,
} from '../receiptParts';

const part = (n: number): ScanPart => ({ uri: `file:///part-${n}.jpg` });

describe('receipt parts state', () => {
  it('addPart caps at 4', () => {
    let parts: ScanPart[] = [];
    for (let i = 1; i <= 6; i++) parts = addPart(parts, part(i));
    expect(MAX_RECEIPT_PARTS).toBe(4);
    expect(parts.map((p) => p.uri)).toEqual([1, 2, 3, 4].map((n) => part(n).uri));
  });

  it('addPart returns the same array when full, so a no-op does not re-render', () => {
    const full = [part(1), part(2), part(3), part(4)];
    expect(addPart(full, part(5))).toBe(full);
  });

  it('addParts keeps order and drops what does not fit', () => {
    const parts = addParts([part(1), part(2)], [part(3), part(4), part(5)]);
    expect(parts.map((p) => p.uri)).toEqual([part(1), part(2), part(3), part(4)].map((p) => p.uri));
  });

  it('removePart removes by index and ignores an index out of range', () => {
    const parts = [part(1), part(2), part(3)];
    expect(removePart(parts, 1).map((p) => p.uri)).toEqual([part(1).uri, part(3).uri]);
    expect(removePart(parts, 7)).toBe(parts);
    expect(removePart(parts, -1)).toBe(parts);
  });

  it('canScan needs at least one part; remainingParts counts down to 0', () => {
    expect(canScan([])).toBe(false);
    expect(canScan([part(1)])).toBe(true);
    expect(remainingParts([])).toBe(4);
    expect(remainingParts([part(1), part(2), part(3), part(4)])).toBe(0);
  });

  it('retakeParts clears parts and result', () => {
    const cleared = retakeState();
    expect(cleared.parts).toEqual([]);
    expect(cleared.scannedReceipt).toBeNull();
    expect(cleared.imageUri).toBeNull();
    expect(cleared.error).toBeNull();
    expect(cleared.errorStatus).toBeNull();
    expect(cleared.isProcessing).toBe(false);
    expect(cleared.isPdf).toBe(false);
  });
});

describe('scanEncodedParts', () => {
  const deps = () => ({
    scanReceipt: jest.fn().mockResolvedValue({ amount: 1 }),
    scanReceiptParts: jest.fn().mockResolvedValue({ amount: 2 }),
  });

  it('with one part calls scanReceipt, exactly as a single photo today', async () => {
    const d = deps();
    const r = await scanEncodedParts(['AAA'], 'note', d);
    expect(d.scanReceipt).toHaveBeenCalledWith('AAA', 'note');
    expect(d.scanReceiptParts).not.toHaveBeenCalled();
    expect(r).toEqual({ amount: 1 });
  });

  it('with two calls scanReceiptParts once, parts in order', async () => {
    const d = deps();
    await scanEncodedParts(['TOP', 'BOTTOM'], undefined, d);
    expect(d.scanReceipt).not.toHaveBeenCalled();
    expect(d.scanReceiptParts).toHaveBeenCalledTimes(1);
    expect(d.scanReceiptParts).toHaveBeenCalledWith(
      [
        { imageBase64: 'TOP', mimeType: 'image/jpeg' },
        { imageBase64: 'BOTTOM', mimeType: 'image/jpeg' },
      ],
      undefined,
    );
  });

  it('refuses zero parts and more than 4', async () => {
    const d = deps();
    await expect(scanEncodedParts([], undefined, d)).rejects.toThrow();
    await expect(scanEncodedParts(['a', 'b', 'c', 'd', 'e'], undefined, d)).rejects.toThrow();
    expect(d.scanReceipt).not.toHaveBeenCalled();
    expect(d.scanReceiptParts).not.toHaveBeenCalled();
  });

  it('fingerprints a multi-part scan over all parts concatenated in order (as the API does)', () => {
    expect(partsFingerprintInput(['TOP', 'BOTTOM'])).toBe('TOPBOTTOM');
    expect(partsFingerprintInput(['ONLY'])).toBe('ONLY');
  });
});

describe('buildReceiptImageFields — parts always travel with part 1', () => {
  const p2 = { imageBase64: 'P2', mimeType: 'image/jpeg' };

  it('no image: sends nothing, never parts on their own', () => {
    expect(buildReceiptImageFields(undefined, [p2])).toEqual({});
    expect(buildReceiptImageFields(undefined, undefined)).toEqual({});
  });

  it('a single image sends only part 1, as today', () => {
    expect(buildReceiptImageFields('P1', undefined)).toEqual({ receiptImageBase64: 'P1' });
    expect(buildReceiptImageFields('P1', [])).toEqual({ receiptImageBase64: 'P1' });
  });

  it('several parts send part 1 together with parts 2..N', () => {
    expect(buildReceiptImageFields('P1', [p2])).toEqual({ receiptImageBase64: 'P1', receiptImageParts: [p2] });
  });

  it('never sends more than 3 extra parts', () => {
    const many = [p2, p2, p2, p2, p2];
    expect(buildReceiptImageFields('P1', many).receiptImageParts).toHaveLength(MAX_RECEIPT_PARTS - 1);
  });
});

describe('partsTotalsMismatch — the multi-part reconciliation warning', () => {
  const receipt = (over: Record<string, unknown> = {}) => ({
    amount: 30,
    discountAmount: null,
    depositAmount: null,
    receiptItems: [{ totalPrice: 10 }, { totalPrice: 20 }],
    ...over,
  });

  it('a reconciled multi-part scan raises no warning', () => {
    expect(partsTotalsMismatch(2, receipt())).toBe(false);
  });

  it('a multi-part scan whose lines do not add up is flagged', () => {
    expect(partsTotalsMismatch(2, receipt({ amount: 55 }))).toBe(true);
  });

  it('counts discounts, deposits and per-line discounts like the server does', () => {
    expect(partsTotalsMismatch(3, receipt({ amount: 27, discountAmount: 3 }))).toBe(false);
    expect(partsTotalsMismatch(2, receipt({ amount: 31, depositAmount: 1 }))).toBe(false);
    expect(
      partsTotalsMismatch(2, receipt({ amount: 28, receiptItems: [{ totalPrice: 10, lineDiscount: 2 }, { totalPrice: 20 }] })),
    ).toBe(false);
  });

  it('a single photo is never flagged, whatever its totals', () => {
    expect(partsTotalsMismatch(1, receipt({ amount: 55 }))).toBe(false);
    expect(partsTotalsMismatch(0, receipt({ amount: 55 }))).toBe(false);
  });

  it('no result, no warning', () => {
    expect(partsTotalsMismatch(2, null)).toBe(false);
  });
});

describe('buildReceiptImageFields — mime type of part 1', () => {
  it('carries receiptMimeType with part 1 when given', () => {
    expect(buildReceiptImageFields('P1', [], 'image/png')).toEqual({ receiptImageBase64: 'P1', receiptMimeType: 'image/png' });
  });

  it('never sends a mime type without part 1', () => {
    expect(buildReceiptImageFields(undefined, [], 'image/png')).toEqual({});
  });
});
