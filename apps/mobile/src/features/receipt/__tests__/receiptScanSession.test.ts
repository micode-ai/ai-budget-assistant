import {
  RECEIPT_SESSION_CHECKPOINT_INTERVAL,
  isReceiptSessionCheckpoint,
} from '../receiptScanSession';

describe('isReceiptSessionCheckpoint', () => {
  it('is never a checkpoint at zero or negative counts', () => {
    expect(isReceiptSessionCheckpoint(0)).toBe(false);
    expect(isReceiptSessionCheckpoint(-1)).toBe(false);
  });

  it('is not a checkpoint for counts below the interval', () => {
    for (let n = 1; n < RECEIPT_SESSION_CHECKPOINT_INTERVAL; n++) {
      expect(isReceiptSessionCheckpoint(n)).toBe(false);
    }
  });

  it('fires on the interval', () => {
    expect(isReceiptSessionCheckpoint(RECEIPT_SESSION_CHECKPOINT_INTERVAL)).toBe(true);
  });

  it('fires again on every subsequent multiple, not just once', () => {
    expect(isReceiptSessionCheckpoint(RECEIPT_SESSION_CHECKPOINT_INTERVAL * 2)).toBe(true);
    expect(isReceiptSessionCheckpoint(RECEIPT_SESSION_CHECKPOINT_INTERVAL * 3)).toBe(true);
  });

  it('does not fire on counts adjacent to a multiple', () => {
    expect(isReceiptSessionCheckpoint(RECEIPT_SESSION_CHECKPOINT_INTERVAL - 1)).toBe(false);
    expect(isReceiptSessionCheckpoint(RECEIPT_SESSION_CHECKPOINT_INTERVAL + 1)).toBe(false);
  });
});
