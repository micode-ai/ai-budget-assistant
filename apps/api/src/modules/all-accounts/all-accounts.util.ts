import type { AllAccountsCategoryRow, AllAccountsMoney, AllAccountsMonth } from '@budget/shared-types';
import { catalogName } from '../../common/utils/category-catalog';
import { normalizeCategoryName } from '../../common/utils/category-key.util';
import type { LedgerRow, MergedCategory } from './all-accounts.types';

interface CatNode {
  name: string;
  systemKey: string | null;
  nameCustomized: boolean;
  type: 'expense' | 'income';
}
export type MergeableCategory = CatNode & { parent: CatNode | null };

/**
 * Cross-account category identity: roll up to the parent, then use the localized
 * catalog name (uncustomized keyed) or the category's own normalized name.
 * When names are unreadable (encrypted accounts) only keyed categories merge.
 */
export function mergedCategory(
  cat: MergeableCategory | null,
  opts: { language: string; namesReadable: boolean },
  fallbackType: 'expense' | 'income' = 'expense',
): MergedCategory {
  const other = (t: 'expense' | 'income'): MergedCategory => ({ key: `${t}:__other`, name: '', systemKey: null });
  if (!cat) return other(fallbackType);
  const c: CatNode = cat.parent ?? cat;
  if (!c.nameCustomized && c.systemKey) {
    const name = catalogName(c.systemKey, c.type, opts.language) ?? c.name;
    return { key: `${c.type}:${normalizeCategoryName(name)}`, name, systemKey: c.systemKey };
  }
  if (!opts.namesReadable) return other(c.type);
  const norm = normalizeCategoryName(c.name);
  if (!norm) return other(c.type);
  return { key: `${c.type}:${norm}`, name: c.name.trim(), systemKey: c.systemKey };
}

const DAY = 86400000;
const toMs = (d: string): number => {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day);
};
const fmt = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export function monthsBetween(start: string, end: string): string[] {
  let y = Number(start.slice(0, 4));
  let m = Number(start.slice(5, 7));
  const ey = Number(end.slice(0, 4));
  const em = Number(end.slice(5, 7));
  const out: string[] = [];
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** Same day count as [start, end], ending the day before `start`. */
export function previousPeriod(start: string, end: string): { start: string; end: string } {
  const s = toMs(start);
  const days = Math.round((toMs(end) - s) / DAY) + 1;
  return { start: fmt(s - days * DAY), end: fmt(s - DAY) };
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

export function aggregateLedger(
  rows: LedgerRow[],
  accountIds: string[],
  start: string,
  end: string,
): {
  totals: AllAccountsMoney;
  perAccount: Record<string, AllAccountsMoney>;
  months: AllAccountsMonth[];
  expenseCategories: AllAccountsCategoryRow[];
  incomeCategories: AllAccountsCategoryRow[];
  fxApproximate: boolean;
} {
  const perAccount: Record<string, AllAccountsMoney> = {};
  for (const id of accountIds) perAccount[id] = { spent: 0, income: 0, net: 0 };
  const monthMap = new Map<string, AllAccountsMonth>();
  for (const m of monthsBetween(start, end)) {
    const pa: AllAccountsMonth['perAccount'] = {};
    for (const id of accountIds) pa[id] = { spent: 0, income: 0 };
    monthMap.set(m, { month: m, perAccount: pa });
  }
  const cats = {
    expense: new Map<string, AllAccountsCategoryRow>(),
    income: new Map<string, AllAccountsCategoryRow>(),
  };
  let spent = 0;
  let income = 0;
  let fxApproximate = false;

  for (const r of rows) {
    if (r.note !== null) continue;
    if (r.amountBase === null) {
      fxApproximate = true;
      continue;
    }
    const acc = perAccount[r.accountId];
    if (!acc) continue;
    const v = r.amountBase;
    const field = r.kind === 'expense' ? 'spent' : 'income';
    acc[field] += v;
    if (field === 'spent') spent += v;
    else income += v;
    const mo = monthMap.get(r.date.slice(0, 7));
    if (mo) mo.perAccount[r.accountId][field] += v;
    const map = cats[r.kind];
    let row = map.get(r.category.key);
    if (!row) {
      row = { key: r.category.key, name: r.category.name, systemKey: r.category.systemKey, total: 0, perAccount: {} };
      map.set(r.category.key, row);
    }
    row.total += v;
    row.perAccount[r.accountId] = (row.perAccount[r.accountId] ?? 0) + v;
  }

  for (const a of Object.values(perAccount)) {
    a.spent = r2(a.spent);
    a.income = r2(a.income);
    a.net = r2(a.income - a.spent);
  }
  const months = [...monthMap.values()];
  for (const m of months) {
    for (const a of Object.values(m.perAccount)) {
      a.spent = r2(a.spent);
      a.income = r2(a.income);
    }
  }
  const finish = (map: Map<string, AllAccountsCategoryRow>): AllAccountsCategoryRow[] =>
    [...map.values()]
      .map((c) => ({
        ...c,
        total: r2(c.total),
        perAccount: Object.fromEntries(Object.entries(c.perAccount).map(([k, v]) => [k, r2(v)])),
      }))
      .sort((a, b) => b.total - a.total);

  return {
    totals: { spent: r2(spent), income: r2(income), net: r2(income - spent) },
    perAccount,
    months,
    expenseCategories: finish(cats.expense),
    incomeCategories: finish(cats.income),
    fxApproximate,
  };
}
