/**
 * Pure roll-up of per-category totals into a two-level tree (parent -> children).
 * No store imports: the caller supplies `parentOf`, which must return a parent id
 * only when that parent is a known live category (otherwise null, keeping the
 * spend top-level exactly as before the hierarchy existed).
 */

export interface RollupChild {
  categoryId: string | null;
  /** True for the synthetic "(no subcategory)" slice carrying the parent's own spend. */
  isParentSelf: boolean;
  amount: number;
  trailing: number[];
}

export interface RollupNode {
  categoryId: string | null;
  amount: number;
  trailing: number[];
  children: RollupChild[];
}

export function rollUpCategoryTotals(
  current: Map<string | null, number>,
  trailing: Map<string | null, number>[],
  parentOf: (categoryId: string) => string | null,
): RollupNode[] {
  // Defensive against a malformed `parentOf` (self-parent, three levels): a key
  // rolls into a parent only when that parent is itself top-level, so every key
  // lands either at the top or under a top-level node and no spend is dropped.
  const isTop = (key: string): boolean => {
    const p = parentOf(key);
    return p === null || p === key;
  };
  const parentKey = (key: string | null): string | null => {
    if (key === null) return null;
    const p = parentOf(key);
    if (p === null || p === key || !isTop(p)) return null;
    return p;
  };
  const trailAt = (key: string | null): number[] => trailing.map((m) => m.get(key) ?? 0);

  // Children present now, grouped by parent id.
  const childrenByParent = new Map<string, string[]>();
  const topKeys: (string | null)[] = [];
  for (const key of current.keys()) {
    const p = parentKey(key);
    if (p === null) {
      topKeys.push(key);
    } else {
      const list = childrenByParent.get(p) ?? [];
      list.push(key as string);
      childrenByParent.set(p, list);
    }
  }
  // Parents that only have children now (no own entry in `current`) still need a node.
  for (const p of childrenByParent.keys()) {
    if (!current.has(p)) topKeys.push(p);
  }

  const nodes: RollupNode[] = topKeys.map((key) => {
    const own = current.get(key) ?? 0;
    const kids = key === null ? [] : (childrenByParent.get(key) ?? []);
    const children: RollupChild[] = kids
      .map((k) => ({
        categoryId: k as string | null,
        isParentSelf: false,
        amount: current.get(k) ?? 0,
        trailing: trailAt(k),
      }))
      .sort((a, b) => b.amount - a.amount);
    if (children.length > 0 && own > 0) {
      children.push({ categoryId: key, isParentSelf: true, amount: own, trailing: trailAt(key) });
    }
    const amount = own + children.filter((c) => !c.isParentSelf).reduce((s, c) => s + c.amount, 0);

    // Trailing: own + every child of this parent per month, including children absent now.
    const nodeTrailing = trailing.map((m) => {
      let sum = m.get(key) ?? 0;
      if (key !== null) {
        for (const [k, v] of m) if (k !== null && k !== key && parentKey(k) === key) sum += v;
      }
      return sum;
    });
    return { categoryId: key, amount, trailing: nodeTrailing, children };
  });

  return nodes.sort((a, b) => b.amount - a.amount);
}
