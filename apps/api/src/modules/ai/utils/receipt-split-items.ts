/**
 * Helpers shared by the three bot photo handlers for turning a receipt's
 * category splits into the per-line data an expense create needs.
 *
 * Pure: no I/O, no Prisma, no Nest. Lives in `ai/utils` because the payload
 * shape it consumes is produced by `OcrService`, which every bot already
 * imports its receipt types from.
 */

export interface SplitWithLines {
  /** `null` while the category is only proposed and does not exist yet. */
  categoryId: string | null;
  itemIndexes: number[];
}

/**
 * Receipt-line index → category id. Lines belonging to a split with no id yet
 * are absent rather than mapped to a placeholder: the consumer writes this into
 * `expense_items.category_id`, an FK, so an invented value would fail at the
 * database instead of at the boundary.
 */
export function buildItemCategoryMap(splits: SplitWithLines[] | undefined): Map<number, string> {
  const map = new Map<number, string>();
  for (const split of splits ?? []) {
    if (!split.categoryId) continue;
    for (const index of split.itemIndexes) {
      map.set(index, split.categoryId);
    }
  }
  return map;
}
