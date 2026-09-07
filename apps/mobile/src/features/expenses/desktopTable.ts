import type { Expense, Income } from '@budget/shared-types';

/**
 * Pure table logic for the desktop transactions screen. It lives apart from the
 * components because nothing in this repo renders a component in CI — so this
 * file is the only place a mistake here can be caught before a human sees it.
 */

export type LedgerRow =
  | { kind: 'expense'; expense: Expense }
  | { kind: 'income'; income: Income };

export interface DayGroup {
  /** ISO calendar day, `YYYY-MM-DD`. A stable key, deliberately NOT a display
   *  string — formatting it for a locale belongs to the component, and a
   *  `label` field here would either duplicate that or quietly ship the ISO
   *  string to the screen. */
  day: string;
  rows: LedgerRow[];
  /** Expenses only, and split receivables excluded. See the two notes below. */
  expenseSubtotal: number;
}

export type FacetGroup = 'categoryId' | 'accountId' | 'merchant';
export interface ActiveFacets {
  categoryId: string[];
  accountId: string[];
  merchant: string[];
}

const rowDate = (r: LedgerRow): Date => (r.kind === 'expense' ? r.expense.date : r.income.date);
export const rowId = (r: LedgerRow): string => (r.kind === 'expense' ? r.expense.id : r.income.id);
const rowCurrency = (r: LedgerRow): string =>
  r.kind === 'expense' ? r.expense.currencyCode : r.income.currencyCode;

/**
 * A split receivable is one row per friend written when a bill is split. The
 * money already left as the original receipt, so counting it again would
 * inflate spend — the same rule `src/utils/consumption.ts` applies on seven
 * other surfaces. The row is still SHOWN: it is a real debt the user tracks.
 */
const isSpend = (r: LedgerRow): boolean =>
  // `!r.expense.isSplitReceivable`, never `=== false`: the field is optional and
  // the entity's own doc comment prescribes this form, because comparing to
  // `false` would wrongly drop every row written before the column existed.
  r.kind === 'expense' && !r.expense.isSplitReceivable;

const isoDay = (d: Date): string => {
  // Local calendar day, never toISOString(): that routes through UTC and shifts
  // the day for any non-zero offset, which is the bug `utils/dateInput.ts` and
  // `features/reports/reportDateRange.ts` both exist to avoid.
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export function groupByDay(rows: LedgerRow[]): DayGroup[] {
  const groups = new Map<string, LedgerRow[]>();
  for (const r of rows) {
    const key = isoDay(rowDate(r));
    const bucket = groups.get(key);
    if (bucket) bucket.push(r);
    else groups.set(key, [r]);
  }
  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([day, dayRows]) => ({
      day,
      rows: dayRows,
      expenseSubtotal: dayRows.reduce(
        (sum, r) => (isSpend(r) ? sum + (r as { expense: Expense }).expense.amount : sum),
        0,
      ),
    }));
}

/**
 * The value one row contributes to a given facet's bucketing — the single
 * place that decides "what does Income have vs. what does Expense have" for
 * `facetCounts`/`countsForFacet` below AND for the desktop screen's own
 * row-level filter (`ExpensesDesktop.tsx`'s `matchesDynamicFacet`, which
 * imports this). A previous version of this file had `facetCounts` skip
 * EVERY income row for EVERY key, on the claim that income "carries neither
 * a merchant nor an expense category" — only half true. `Income.categoryId`
 * and `Income.accountId` both exist (`packages/shared-types/src/entities/income.ts`)
 * and `TransactionTable`'s own `rowCategoryId` already reads and renders
 * `income.categoryId`. `merchant` is the ONE field genuinely absent from
 * `Income` — callers must gate that case themselves (see the
 * `key === 'merchant' && row.kind !== 'expense'` checks beside every call
 * site below) rather than trusting this function to return `undefined` and
 * letting that fall into the empty-string bucket, which would wrongly count
 * an income row as "no merchant" instead of omitting it from that facet
 * entirely.
 */
export function facetValue(row: LedgerRow, key: FacetGroup): string | undefined {
  if (key === 'merchant') return row.kind === 'expense' ? row.expense.merchant : undefined;
  return row.kind === 'expense'
    ? (row.expense as unknown as Pick<Expense, 'categoryId' | 'accountId'>)[key]
    : (row.income as unknown as Pick<Income, 'categoryId' | 'accountId'>)[key];
}

/**
 * Counts per facet value. `merchant` skips income rows entirely (that field
 * doesn't exist on `Income` — see `facetValue` above); `categoryId`/`accountId`
 * count an income row exactly like an expense row, reading its own field.
 */
export function facetCounts(
  rows: LedgerRow[],
  key: 'categoryId' | 'accountId' | 'merchant',
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (key === 'merchant' && r.kind !== 'expense') continue;
    const value = facetValue(r, key);
    const bucket = typeof value === 'string' && value.length > 0 ? value : '';
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return counts;
}

/**
 * The count to show beside one facet value: how many rows you would get if you
 * picked it, given every OTHER group's active facets. Its own group is excluded
 * on purpose — with Продукты selected, the Хозтовары count must still say what
 * switching to it would give, or the user can never see where else to go.
 * Union within a group, intersection across groups — no kind is exempt from a
 * group: an income row narrows on `categoryId`/`accountId` exactly like an
 * expense row, and only ever fails a `merchant` constraint (never satisfies
 * one, since it has no merchant to match).
 */
export function countsForFacet(
  rows: LedgerRow[],
  active: ActiveFacets,
  group: FacetGroup,
): Map<string, number> {
  const others = (Object.keys(active) as FacetGroup[]).filter((g) => g !== group);
  const narrowed = rows.filter((r) => {
    return others.every((g) => {
      const chosen = active[g];
      if (chosen.length === 0) return true;
      if (g === 'merchant' && r.kind !== 'expense') return false;
      const value = facetValue(r, g);
      return typeof value === 'string' && chosen.includes(value);
    });
  });
  return facetCounts(narrowed, group);
}

export function summarise(rows: LedgerRow[]): {
  spentByCurrency: Map<string, number>;
  earnedByCurrency: Map<string, number>;
  count: number;
} {
  // Per currency, never blended: this app has no FX in a ledger total, and a
  // single "spent" figure across currencies would be a number that is true of
  // nothing. The same rule the receipt price check follows.
  const spentByCurrency = new Map<string, number>();
  const earnedByCurrency = new Map<string, number>();
  for (const r of rows) {
    const cur = rowCurrency(r);
    if (r.kind === 'income') {
      earnedByCurrency.set(cur, (earnedByCurrency.get(cur) ?? 0) + r.income.amount);
    } else if (isSpend(r)) {
      spentByCurrency.set(cur, (spentByCurrency.get(cur) ?? 0) + r.expense.amount);
    }
  }
  return { spentByCurrency, earnedByCurrency, count: rows.length };
}

/**
 * Shift-click range. Returns nothing when either end is not in the visible,
 * filtered order — a bulk action over money rows must never include a row the
 * user cannot see.
 */
export function rangeBetween(anchorId: string, targetId: string, visibleIds: string[]): string[] {
  const from = visibleIds.indexOf(anchorId);
  const to = visibleIds.indexOf(targetId);
  if (from === -1 || to === -1) return [];
  return visibleIds.slice(Math.min(from, to), Math.max(from, to) + 1);
}
