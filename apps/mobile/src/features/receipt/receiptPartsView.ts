import type { ReceiptImagePart } from '@budget/shared-types';
import { MAX_RECEIPT_PARTS } from './receiptParts';

/** A stored receipt part with its 1-based position (part 1 = `receiptImage`). */
export interface IndexedReceiptPart extends ReceiptImagePart {
  index: number;
}

const inRange = (index: number) => index >= 1 && index <= MAX_RECEIPT_PARTS;

/** Local parts 2..N (stored in order, no index column exposed) numbered by position. */
export function localExtraParts(local: ReceiptImagePart[]): IndexedReceiptPart[] {
  return local.slice(0, MAX_RECEIPT_PARTS - 1).map((part, i) => ({ ...part, index: i + 2 }));
}

/**
 * Local parts win (the device may hold edits the server has not seen yet);
 * server parts fill the gaps; result sorted top to bottom.
 */
export function mergeReceiptParts(
  local: IndexedReceiptPart[],
  server: IndexedReceiptPart[],
): IndexedReceiptPart[] {
  const byIndex = new Map<number, IndexedReceiptPart>();
  for (const part of server) if (inRange(part.index)) byIndex.set(part.index, part);
  for (const part of local) if (inRange(part.index)) byIndex.set(part.index, part);
  return [...byIndex.values()].sort((a, b) => a.index - b.index);
}

/** Parts 2..N of a full GET result (which carries part 1 as index 1). */
export function extraPartsOf(all: IndexedReceiptPart[]): IndexedReceiptPart[] {
  return all.filter((p) => p.index >= 2 && p.index <= MAX_RECEIPT_PARTS).sort((a, b) => a.index - b.index);
}
