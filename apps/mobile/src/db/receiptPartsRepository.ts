import type { ReceiptImagePart } from '@budget/shared-types';
import { executeSql, withTransaction } from './client';

/**
 * Parts 2..N of a multi-photo receipt (part 1 stays in `expenses.receipt_image`,
 * as on the server). Stored under `idx` 2..4 in `expense_receipt_parts`.
 * On web `executeSql` is a no-op, so these read as "no parts" there.
 */
const MAX_EXTRA_PARTS = 3;

/** Replaces the stored parts of `expenseId` with `parts` (2..N, top to bottom). */
export async function saveReceiptPartsLocally(expenseId: string, parts: ReceiptImagePart[]): Promise<void> {
  await withTransaction(async () => {
    await executeSql('DELETE FROM expense_receipt_parts WHERE expense_id = ?', [expenseId]);
    const extra = parts.slice(0, MAX_EXTRA_PARTS);
    for (let i = 0; i < extra.length; i++) {
      await executeSql(
        'INSERT INTO expense_receipt_parts (expense_id, idx, image, mime) VALUES (?, ?, ?, ?)',
        [expenseId, i + 2, extra[i].imageBase64, extra[i].mimeType || 'image/jpeg'],
      );
    }
  });
}

/**
 * Parts 2..N in order; a failed read THROWS. The sync path must use this one:
 * reading a failure as "no parts" would send part 1 alone, which deletes the
 * parts stored on the server.
 */
export async function readReceiptPartsStrict(expenseId: string): Promise<ReceiptImagePart[]> {
  const rows = await executeSql<{ idx: number; image: string; mime: string | null }>(
    'SELECT idx, image, mime FROM expense_receipt_parts WHERE expense_id = ? ORDER BY idx',
    [expenseId],
  );
  return rows.map((r) => ({ imageBase64: r.image, mimeType: r.mime || 'image/jpeg' }));
}

/** Parts 2..N in order for display; `[]` when there are none or the read fails. Never for a push. */
export async function getReceiptPartsFromDb(expenseId: string): Promise<ReceiptImagePart[]> {
  try {
    return await readReceiptPartsStrict(expenseId);
  } catch (e) {
    console.warn('[receiptParts] local read failed:', e instanceof Error ? e.message : String(e));
    return [];
  }
}

export async function deleteReceiptPartsLocally(expenseId: string): Promise<void> {
  await executeSql('DELETE FROM expense_receipt_parts WHERE expense_id = ?', [expenseId]);
}
