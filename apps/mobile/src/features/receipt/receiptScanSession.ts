export const RECEIPT_SESSION_CHECKPOINT_INTERVAL = 15;

/**
 * True when `count` lands exactly on a checkpoint (15, 30, 45, ...) inside a
 * single continuous receipt-scanning session — a natural point to nudge the
 * user to review what they've saved or take a break, without ever blocking
 * them from continuing the loop.
 */
export function isReceiptSessionCheckpoint(count: number): boolean {
  return count > 0 && count % RECEIPT_SESSION_CHECKPOINT_INTERVAL === 0;
}
