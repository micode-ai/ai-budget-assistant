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

export interface ResolvedSplit {
  categoryId: string;
  categoryName: string;
  amount: number;
  percentage: number;
  itemIndexes: number[];
}

/**
 * Turns a scan payload into splits an expense create can accept, creating a
 * category for every proposed group. Called on the bots' confirm branch — the
 * point at which the user has explicitly agreed to the receipt — never when the
 * photo arrives.
 *
 * `createCategory` is injected rather than a service dependency so this stays
 * pure enough to unit-test; every caller passes the idempotent
 * `CategoriesService.create`, which returns the existing row on a name clash.
 */
export async function resolveProposedSplits(
  splits: Array<SplitWithLines & { categoryName: string; amount: number; percentage: number }>,
  createCategory: (name: string) => Promise<{ id: string }>,
): Promise<ResolvedSplit[]> {
  const createdByName = new Map<string, string>();
  const resolved: ResolvedSplit[] = [];

  for (const split of splits) {
    let categoryId = split.categoryId;
    if (!categoryId) {
      categoryId =
        createdByName.get(split.categoryName) ?? (await createCategory(split.categoryName)).id;
      createdByName.set(split.categoryName, categoryId);
    }
    resolved.push({
      categoryId,
      categoryName: split.categoryName,
      amount: split.amount,
      percentage: split.percentage,
      itemIndexes: split.itemIndexes,
    });
  }

  return resolved;
}
