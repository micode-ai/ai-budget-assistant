/** Pure drill-down selection over rolled-up rows. */
export function drillView<T extends { categoryId: string | null; children?: T[] }>(
  rows: T[],
  drillParentId: string | null,
): { rows: T[]; parent: T | null } {
  if (drillParentId === null) return { rows, parent: null };
  const parent = rows.find((r) => r.categoryId === drillParentId);
  if (!parent || !parent.children || parent.children.length === 0) return { rows, parent: null };
  return { rows: parent.children, parent };
}
