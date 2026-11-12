/**
 * Child cost attribution: which children an expense's money belongs to, and
 * how much to each.
 *
 * Two mutually exclusive attribution modes per expense: WHOLE (`ExpenseChild`
 * links with a `share` each) and LINES (`ExpenseItem.childId`). When both
 * exist, lines win over leftover links. Receipt-level discounts are folded
 * proportionally over all lines, with the rounding remainder on the largest
 * share — the same rule as `buildCategorySplits` in
 * `receipt-category-split.ts`.
 *
 * Spend predicate: an expense that is a split receivable (`isSplitReceivable`)
 * or planned (`isPlanned`) contributes nothing — the same predicate as the
 * Analytics tab. Never filter on `isDebt`.
 *
 * Pure: no I/O, no clock (callers pass `now`), no Prisma. Mirrored for the
 * mobile client in `packages/shared-utils/src/formatting/child-attribution.ts`
 * — change one, change the other. It cannot be a single shared import: the API
 * has no build step for workspace packages.
 */
import type { ChildBenefitCoverage, ChildCostSummary, ExpenseChildLink } from '@budget/shared-types';

export type AttributionMode = 'none' | 'whole' | 'lines';

export interface AttribExpense {
  id: string;
  amount: number;
  currencyCode: string;
  /** YYYY-MM-DD */
  date: string;
  categoryId: string | null;
  discountAmount?: number | null;
  isSplitReceivable?: boolean | null;
  isPlanned?: boolean | null;
}

export interface AttribItem {
  expenseId: string;
  totalPrice: number;
  lineDiscount?: number | null;
  childId: string | null;
  categoryId: string | null;
  canonicalName?: string | null;
}

const toCents = (amount: number): number => Math.round(amount * 100);
const fromCents = (cents: number): number => Math.round(cents) / 100;
const positive = (n: number | null | undefined): number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;

export function resolveAttributionMode(links: ExpenseChildLink[], items: AttribItem[]): AttributionMode {
  if (items.some((i) => i.childId)) return 'lines';
  if (links.length > 0) return 'whole';
  return 'none';
}

export function childAmounts(
  expense: AttribExpense,
  links: ExpenseChildLink[],
  items: AttribItem[],
): Array<{ childId: string; categoryId: string | null; amount: number }> {
  if (expense.isSplitReceivable || expense.isPlanned) return [];
  if (!Number.isFinite(expense.amount) || expense.amount <= 0) return [];

  const myLinks = links.filter((l) => l.expenseId === expense.id);
  const myItems = items.filter((i) => i.expenseId === expense.id);
  const mode = resolveAttributionMode(myLinks, myItems);

  if (mode === 'none') return [];

  if (mode === 'whole') {
    const shares = myLinks.filter((l) => Number.isFinite(l.share) && l.share > 0);
    if (shares.length === 0) return [];
    const sumShare = shares.reduce((s, l) => s + l.share, 0);
    // Shares sum to 1 by contract; if they sum to less, only that part is attributed.
    const totalCents = toCents(expense.amount * Math.min(sumShare, 1));
    const rows = shares
      .map((l) => ({ childId: l.childId, cents: toCents(expense.amount * l.share) }))
      .sort((a, b) => b.cents - a.cents || a.childId.localeCompare(b.childId));
    // Rounding remainder lands on the largest share.
    rows[0].cents += totalCents - rows.reduce((s, r) => s + r.cents, 0);
    return rows
      .filter((r) => r.cents > 0)
      .map((r) => ({ childId: r.childId, categoryId: expense.categoryId, amount: fromCents(r.cents) }));
  }

  // Lines: group every line (attributed or not) by (child, category) so the
  // receipt discount is spread over the whole basket, as buildCategorySplits does.
  const groups = new Map<string, { childId: string | null; categoryId: string | null; cents: number }>();
  let netTotal = 0;
  for (const line of myItems) {
    if (!Number.isFinite(line.totalPrice) || line.totalPrice <= 0) continue;
    const net = Math.max(0, toCents(line.totalPrice) - toCents(positive(line.lineDiscount)));
    const categoryId = line.categoryId ?? expense.categoryId;
    const key = `${line.childId ?? ''}\u0000${categoryId ?? ''}`;
    const g = groups.get(key) ?? { childId: line.childId, categoryId, cents: 0 };
    g.cents += net;
    groups.set(key, g);
    netTotal += net;
  }

  const ordered = Array.from(groups.entries())
    .map(([key, g]) => ({ key, ...g }))
    // Ties broken by key so the output is deterministic for a given input.
    .sort((a, b) => b.cents - a.cents || a.key.localeCompare(b.key));
  if (ordered.length === 0) return [];

  const discountCents = toCents(positive(expense.discountAmount));
  if (discountCents > 0 && netTotal > discountCents) {
    let spread = 0;
    for (const g of ordered) {
      const cut = Math.round((g.cents / netTotal) * discountCents);
      g.cents -= cut;
      spread += cut;
    }
    // Rounding remainder lands on the largest share.
    ordered[0].cents -= discountCents - spread;
  }

  return ordered
    .filter((g) => g.childId && g.cents > 0)
    .map((g) => ({ childId: g.childId as string, categoryId: g.categoryId, amount: fromCents(g.cents) }));
}

const monthKey = (date: string): string => date.slice(0, 7);

function shiftMonth(year: number, month0: number, delta: number): string {
  const d = new Date(Date.UTC(year, month0 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Totals for one child. `byCategory` covers the current calendar year (the same
 * window as `yearTotal`); `averagePerMonth` is all attributed spend divided by
 * the months from the first attributed month to `now`, inclusive.
 */
export function childCostSummary(input: {
  childId: string;
  expenses: AttribExpense[];
  links: ExpenseChildLink[];
  items: AttribItem[];
  convert: (amount: number, currency: string) => number | null;
  now: Date;
}): ChildCostSummary {
  const { childId, expenses, links, items, convert, now } = input;
  const nowYear = now.getFullYear();
  const nowMonth0 = now.getMonth();
  const nowKey = shiftMonth(nowYear, nowMonth0, 0);
  const yearPrefix = `${nowYear}-`;

  let fxApproximate = false;
  let total = 0;
  let yearTotal = 0;
  let firstMonth: string | null = null;
  const byMonth = new Map<string, number>();
  const byCategory = new Map<string, { categoryId: string | null; amount: number }>();

  for (const expense of expenses) {
    for (const part of childAmounts(expense, links, items)) {
      if (part.childId !== childId) continue;
      const converted = convert(part.amount, expense.currencyCode);
      if (converted === null || !Number.isFinite(converted)) {
        fxApproximate = true;
        continue;
      }
      const m = monthKey(expense.date);
      byMonth.set(m, (byMonth.get(m) ?? 0) + converted);
      total += converted;
      if (firstMonth === null || m < firstMonth) firstMonth = m;
      if (m.startsWith(yearPrefix)) {
        yearTotal += converted;
        const ck = part.categoryId ?? '';
        const row = byCategory.get(ck) ?? { categoryId: part.categoryId, amount: 0 };
        row.amount += converted;
        byCategory.set(ck, row);
      }
    }
  }

  let averagePerMonth = 0;
  if (firstMonth !== null) {
    const [fy, fm] = firstMonth.split('-').map(Number);
    const span = Math.max(1, (nowYear - fy) * 12 + (nowMonth0 + 1 - fm) + 1);
    averagePerMonth = total / span;
  }

  const months: Array<{ month: string; amount: number }> = [];
  for (let i = 11; i >= 0; i--) {
    const m = shiftMonth(nowYear, nowMonth0, -i);
    months.push({ month: m, amount: fromCents(toCents(byMonth.get(m) ?? 0)) });
  }

  return {
    monthTotal: fromCents(toCents(byMonth.get(nowKey) ?? 0)),
    yearTotal: fromCents(toCents(yearTotal)),
    averagePerMonth: fromCents(toCents(averagePerMonth)),
    byCategory: Array.from(byCategory.values())
      .map((r) => ({ categoryId: r.categoryId, amount: fromCents(toCents(r.amount)) }))
      .sort((a, b) => b.amount - a.amount),
    months,
    fxApproximate,
  };
}

/** Benefit received vs spending in [from, to] (YYYY-MM-DD, inclusive); one payment per month counts. */
export function benefitCoverage(input: {
  childId: string;
  incomes: Array<{
    amount: number;
    currencyCode: string;
    date: string;
    childBenefitChildId: string | null;
    isSplitReceivable?: boolean | null;
  }>;
  spending: number;
  from: string;
  to: string;
  convert: (amount: number, currency: string) => number | null;
}): ChildBenefitCoverage {
  const { childId, incomes, spending, from, to, convert } = input;
  const largestByMonth = new Map<string, number>();
  for (const inc of incomes) {
    if (inc.childBenefitChildId !== childId || inc.isSplitReceivable) continue;
    const day = inc.date.slice(0, 10);
    if (day < from || day > to) continue;
    const converted = convert(inc.amount, inc.currencyCode);
    if (converted === null || !Number.isFinite(converted) || converted <= 0) continue;
    const m = monthKey(day);
    largestByMonth.set(m, Math.max(largestByMonth.get(m) ?? 0, converted));
  }
  let benefit = 0;
  for (const v of largestByMonth.values()) benefit += v;
  return {
    benefit: fromCents(toCents(benefit)),
    spending,
    percent: spending > 0 ? Math.round((benefit / spending) * 1000) / 10 : null,
  };
}

const fold = (s: string): string =>
  s
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Case- and diacritics-insensitive: `800+`, `800 plus`, `rodzina 800`, `świadczenie wychowawcze`. */
export function isChildBenefitDescription(description: string | null | undefined): boolean {
  if (!description) return false;
  const d = fold(description);
  return (
    /(^|[^\d])800\s*(\+|plus)/.test(d) ||
    /rodzina\s+800(?!\d)/.test(d) ||
    /swiadczenie\s+wychowawcze/.test(d)
  );
}

/**
 * Carries a child attribution from an expense's old receipt lines onto its
 * regenerated ones, keyed on the normalized product name. Each old attributed
 * line can be matched once; `lost` counts old attributed lines left unmatched.
 */
export function carryChildAttribution(
  oldItems: Array<{ canonicalName?: string | null; description: string; childId: string | null }>,
  newItems: Array<{ canonicalName?: string | null; description: string }>,
  normalize: (s: string) => string,
): { childIds: Array<string | null>; lost: number } {
  const pool = new Map<string, string[]>();
  let attributed = 0;
  for (const old of oldItems) {
    if (!old.childId) continue;
    attributed++;
    const key = normalize(old.canonicalName ?? old.description);
    const list = pool.get(key) ?? [];
    list.push(old.childId);
    pool.set(key, list);
  }
  let matched = 0;
  const childIds = newItems.map((n) => {
    const hit = pool.get(normalize(n.canonicalName ?? n.description))?.shift();
    if (hit) {
      matched++;
      return hit;
    }
    return null;
  });
  return { childIds, lost: attributed - matched };
}

/**
 * Identical to `normalizeProductName` in
 * `modules/merchant-rules/product-rules.service.ts` (the learned product-rule
 * key); duplicated so the shared-utils mirror and the device can compute it.
 * A parity spec pins the two together.
 */
export function normalizeProductKey(name: string): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}
