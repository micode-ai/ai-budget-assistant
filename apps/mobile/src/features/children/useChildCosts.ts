import { useMemo } from 'react';
import type { Child, ChildBenefitCoverage, ChildCostSummary } from '@budget/shared-types';
import { computeChildCosts, computeChildMonthTotals } from './childCosts';
import { useChildCostSources } from './useChildCostSources';

export interface ChildCostsState {
  /** Null while loading, on error, or when the child is not (yet) known. */
  summary: ChildCostSummary | null;
  /** Null when the child has no 800+ income this year (the line is then not shown). */
  coverage: ChildBenefitCoverage | null;
  loading: boolean;
  error: boolean;
  retry: () => void;
  /** The child, archived ones included; null when not found once loaded. */
  child: Child | null;
  /** Loaded, and no child with this id in the account. */
  notFound: boolean;
  /** The currency every amount is in. */
  currency: string;
}

/**
 * One child's costs for the Child costs screen. Called ONCE, in the
 * `ChildCostsView` parent above the 1024 split, and passed down — never inside
 * a platform child, where a resize across 1024 would remount it and recompute.
 *
 * An archived child keeps its attributions, so it has a summary like any other.
 * `now` is for tests; the screen omits it.
 */
export function useChildCosts(childId: string, now?: Date): ChildCostsState {
  const { sources, children, loading, error, retry, displayCurrency } = useChildCostSources({ now });
  const child = children.find((c) => c.id === childId) ?? null;

  const computed = useMemo(
    () => (sources && child ? computeChildCosts(child.id, sources) : null),
    [sources, child],
  );

  return {
    summary: computed?.summary ?? null,
    coverage: computed?.coverage ?? null,
    loading,
    error,
    retry,
    child,
    notFound: !loading && !error && !child,
    currency: displayCurrency,
  };
}

export interface ChildMonthRow {
  child: Child;
  /** Null while loading. */
  monthTotal: number | null;
  fxApproximate: boolean;
}

/**
 * This month's total for every child of the account (archived last), for the
 * Analytics "Children" section and the children list. Rows are listed, never
 * ranked: they stay in name order whatever the amounts.
 */
export function useChildrenMonthTotals({ activeOnly = false }: { activeOnly?: boolean } = {}): {
  active: ChildMonthRow[];
  archived: ChildMonthRow[];
  loading: boolean;
  error: boolean;
  retry: () => void;
  currency: string;
  childrenLoaded: boolean;
} {
  const { sources, children, childrenLoaded, loading, error, retry, displayCurrency } = useChildCostSources({
    activeOnly,
  });
  // Only the children the caller shows; none means nothing is computed at all.
  const ids = useMemo(
    () => children.filter((c) => !activeOnly || !c.archivedAt).map((c) => c.id),
    [children, activeOnly],
  );
  const totals = useMemo(
    () => (sources && ids.length > 0 ? computeChildMonthTotals(ids, sources) : null),
    [sources, ids],
  );
  const rows = children.map((child) => ({
    child,
    monthTotal: totals?.get(child.id)?.monthTotal ?? null,
    fxApproximate: totals?.get(child.id)?.fxApproximate ?? false,
  }));
  return {
    active: rows.filter((r) => !r.child.archivedAt),
    archived: rows.filter((r) => !!r.child.archivedAt),
    loading,
    error,
    retry,
    currency: displayCurrency,
    childrenLoaded,
  };
}
