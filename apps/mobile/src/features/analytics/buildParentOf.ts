type CategoryRow = { id: string; name: string; parentId?: string | null; isDeleted?: boolean };

/**
 * Builds the `parentOf` lookup for `rollUpCategoryTotals`. The child lookup sees
 * every row the store holds (a deleted child still rolls into its live parent),
 * but a parent id is returned only when that parent row is live, top-level and
 * not the row itself. A key the store does not hold, a parent that is
 * deleted/unknown, or a malformed tree (3 levels, self-parent) stays top-level
 * (null), so no spend can fall out of the roll-up.
 * Keys may be a category id or, for legacy rows, a category name.
 */
export function buildParentOf(categories: CategoryRow[]): (categoryId: string) => string | null {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const byName = new Map(categories.map((c) => [c.name, c]));
  return (categoryId) => {
    const row = byId.get(categoryId) ?? byName.get(categoryId);
    if (!row?.parentId) return null;
    const parent = byId.get(row.parentId);
    if (!parent || parent.isDeleted || parent.parentId || parent.id === row.id) return null;
    return parent.id;
  };
}

/**
 * Re-keys legacy name-keyed totals to the category id when the name resolves
 * to a known category (an id key always wins over a name match), summing into
 * any id-keyed entry. Without this a parent's legacy name-keyed spend becomes a
 * second top-level slice with the same label. Totals are unchanged.
 */
export function normalizeCategoryKeys(
  totals: Map<string | null, number>,
  categories: CategoryRow[],
): Map<string | null, number> {
  const ids = new Set(categories.map((c) => c.id));
  const byName = new Map(categories.map((c) => [c.name, c.id]));
  const out = new Map<string | null, number>();
  for (const [key, value] of totals) {
    const k = key === null || ids.has(key) ? key : (byName.get(key) ?? key);
    out.set(k, (out.get(k) ?? 0) + value);
  }
  return out;
}
