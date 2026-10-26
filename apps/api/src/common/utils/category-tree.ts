/**
 * Two-level category hierarchy helpers (`Category.parentId`).
 *
 * A budget allocation on a parent category covers the parent's own spend plus
 * every live child's, so an expense filed under a child still counts against
 * the parent's limit. Only ONE level of children is followed — the hierarchy is
 * two-level by invariant, so nothing here recurses.
 *
 * Keep this file in step with its mirror at
 * `packages/shared-utils/src/formatting/category-tree.ts` (function bodies are
 * identical) — the mobile client computes budget progress locally and must
 * reach the same number as the server. The API cannot import the mirror at
 * runtime, hence the duplicate; `categoryTreeParity.test.ts` guards drift.
 */

export interface TreeCategory {
  id: string;
  parentId?: string | null;
  isDeleted?: boolean;
  name?: string;
}

export interface AllocationRollUp {
  /** Own spend plus the spend of every live child. */
  spent: number;
  ownSpent: number;
  /** Children with non-zero spend, largest first. */
  children: Array<{ categoryId: string; spent: number }>;
}

function liveChildrenByParent(
  categories: readonly TreeCategory[],
): Map<string, TreeCategory[]> {
  const byParent = new Map<string, TreeCategory[]>();
  for (const c of categories) {
    if (c.isDeleted || !c.parentId) continue;
    const list = byParent.get(c.parentId);
    if (list) list.push(c);
    else byParent.set(c.parentId, [c]);
  }
  return byParent;
}

/** Allocated ids plus the live children of every allocated parent. */
export function expandAllocatedCategoryIds(
  allocatedIds: Iterable<string>,
  categories: readonly TreeCategory[],
): Set<string> {
  const childrenOf = liveChildrenByParent(categories);
  const out = new Set<string>();
  for (const id of allocatedIds) {
    out.add(id);
    for (const child of childrenOf.get(id) ?? []) out.add(child.id);
  }
  return out;
}

/**
 * Per allocated category: its spend rolled up over live children. A child that
 * is also allocated on its own still counts under its parent.
 */
export function rollUpAllocationSpend(
  byCategory: ReadonlyMap<string, number>,
  allocatedIds: Iterable<string>,
  categories: readonly TreeCategory[],
): Map<string, AllocationRollUp> {
  const childrenOf = liveChildrenByParent(categories);
  const out = new Map<string, AllocationRollUp>();
  for (const id of allocatedIds) {
    const ownSpent = byCategory.get(id) ?? 0;
    const children: Array<{ categoryId: string; spent: number }> = [];
    let spent = ownSpent;
    for (const child of childrenOf.get(id) ?? []) {
      const childSpent = byCategory.get(child.id) ?? 0;
      if (childSpent === 0) continue;
      children.push({ categoryId: child.id, spent: childSpent });
      spent += childSpent;
    }
    children.sort((a, b) => b.spent - a.spent);
    out.set(id, { spent, ownSpent, children });
  }
  return out;
}

/**
 * Flatten for a picker: each live child directly after its parent (depth 1),
 * top-levels in input order. An orphan (parent missing or deleted) is depth 0.
 * Deleted categories are not emitted.
 */
export function sortCategoriesAsTree<T extends TreeCategory>(
  categories: readonly T[],
): Array<{ category: T; depth: 0 | 1 }> {
  const live = categories.filter((c) => !c.isDeleted);
  const liveIds = new Set(live.map((c) => c.id));
  const childrenOf = new Map<string, T[]>();
  const tops: T[] = [];
  for (const c of live) {
    if (c.parentId && liveIds.has(c.parentId)) {
      const list = childrenOf.get(c.parentId);
      if (list) list.push(c);
      else childrenOf.set(c.parentId, [c]);
    } else {
      tops.push(c);
    }
  }
  const out: Array<{ category: T; depth: 0 | 1 }> = [];
  for (const top of tops) {
    out.push({ category: top, depth: 0 });
    for (const child of childrenOf.get(top.id) ?? []) {
      out.push({ category: child, depth: 1 });
    }
  }
  return out;
}
