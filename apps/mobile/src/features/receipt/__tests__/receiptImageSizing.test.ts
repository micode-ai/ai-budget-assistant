import {
  resolveResizeWidth,
  RECEIPT_OCR_MAX_WIDTH,
  RECEIPT_STORED_MAX_WIDTH,
} from '../receiptImageSizing';

describe('resolveResizeWidth', () => {
  it('resizes a photo wider than the cap down to the cap', () => {
    expect(resolveResizeWidth(4032, RECEIPT_OCR_MAX_WIDTH)).toBe(RECEIPT_OCR_MAX_WIDTH);
  });

  it('leaves an image narrower than the cap untouched so it is never upscaled', () => {
    expect(resolveResizeWidth(1024, RECEIPT_OCR_MAX_WIDTH)).toBeNull();
  });

  it('leaves an image exactly at the cap untouched', () => {
    expect(resolveResizeWidth(RECEIPT_OCR_MAX_WIDTH, RECEIPT_OCR_MAX_WIDTH)).toBeNull();
  });

  it('resizes when the source width is unknown, since an unbounded photo is the memory risk', () => {
    expect(resolveResizeWidth(undefined, RECEIPT_OCR_MAX_WIDTH)).toBe(RECEIPT_OCR_MAX_WIDTH);
  });

  it('treats a zero or NaN width as unknown', () => {
    expect(resolveResizeWidth(0, RECEIPT_OCR_MAX_WIDTH)).toBe(RECEIPT_OCR_MAX_WIDTH);
    expect(resolveResizeWidth(NaN, RECEIPT_OCR_MAX_WIDTH)).toBe(RECEIPT_OCR_MAX_WIDTH);
  });

  it('applies the same rule to the smaller stored-image cap', () => {
    expect(resolveResizeWidth(1600, RECEIPT_STORED_MAX_WIDTH)).toBe(RECEIPT_STORED_MAX_WIDTH);
    expect(resolveResizeWidth(640, RECEIPT_STORED_MAX_WIDTH)).toBeNull();
  });

  it('caps the stored image tighter than the OCR image', () => {
    expect(RECEIPT_STORED_MAX_WIDTH).toBeLessThan(RECEIPT_OCR_MAX_WIDTH);
  });
});
