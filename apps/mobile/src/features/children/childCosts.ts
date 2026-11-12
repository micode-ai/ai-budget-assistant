import {
  attributeToCategories,
  benefitCoverage,
  childCostSummary,
  resolveAttributionMode,
  type AttribExpense,
  type AttribItem,
} from '@budget/shared-utils';
import type {
  ChildBenefitCoverage,
  ChildCostSummary,
  Expense,
  ExpenseChildLink,
  ExpenseItem,
  Income,
} from '@budget/shared-types';
import { filterConsumption, filterIncomeConsumption } from '@/utils/consumption';
import { toDateInputValue } from '@/utils/dateInput';

/**
 * Child costs on the device: the pure half of `useChildCosts`.
 *
 * Everything here is computed from what the stores already hold — the same
 * data the Analytics tab reads — through the shared-utils mirror of the API's
 * attribution core (`childCostSummary`, `benefitCoverage`), so the screen, the
 * statement and Analytics agree.
 *
 * - Spend predicate: `filterConsumption` (split receivables out, the Analytics
 *   rule) and planned expenses out (ruling R1: a planned expense is never
 *   spend). Never `isDebt`.
 * - Currency: every amount in the display currency; an amount whose currency
 *   has no rate is left out and the summary carries `fxApproximate`.
 * - Categories are split-aware, as in the rest of Analytics: an expense
 *   attributed as a whole that has category splits contributes each split's
 *   share to that split's category (`attributeToCategories` — splits decide).
 *   Per-line attribution uses each line's own category when the line carries
 *   one, else the expense's.
 *
 * Child names never pass through here; only ids and amounts.
 */

export interface ChildCostSources {
  expenses: Expense[];
  incomes: Income[];
  /** Receipt lines of every expense with a line attributed to a child (whole baskets). */
  lines: ExpenseItem[];
  rates: Record<string, number>;
  displayCurrency: string;
  now: Date;
}

export type Converter = (amount: number, currency: string) => number | null;

/** Like `convertAmount`, but an unknown rate is `null`, never the unconverted amount. */
export function makeConverter(rates: Record<string, number>, displayCurrency: string): Converter {
  return (amount, currency) => {
    if (currency === displayCurrency) return amount;
    const from = rates[currency];
    const to = rates[displayCurrency];
    if (!from || !to || !Number.isFinite(from) || !Number.isFinite(to)) return null;
    return (amount / from) * to;
  };
}

const dayOf = (date: Date | string): string => toDateInputValue(new Date(date));

interface AttributionInput {
  expenses: AttribExpense[];
  links: ExpenseChildLink[];
  items: AttribItem[];
}

/** The expenses that carry any attribution, as the attribution core reads them. */
export function toAttributionInput(expenses: Expense[], lines: ExpenseItem[]): AttributionInput {
  const linesByExpense = new Map<string, AttribItem[]>();
  for (const line of lines) {
    if (line.isDeleted) continue;
    const list = linesByExpense.get(line.expenseId) ?? [];
    list.push({
      expenseId: line.expenseId,
      totalPrice: Number(line.totalPrice) || 0,
      lineDiscount: line.lineDiscount ?? null,
      childId: line.childId ?? null,
      categoryId: line.categoryId ?? null,
      canonicalName: line.canonicalName ?? null,
    });
    linesByExpense.set(line.expenseId, list);
  }

  const out: AttributionInput = { expenses: [], links: [], items: [] };
  for (const e of filterConsumption(expenses)) {
    if (e.isDeleted || e.isPlanned) continue;
    const links = (e.expenseChildren ?? []).filter((l) => l.expenseId === e.id);
    const items = linesByExpense.get(e.id) ?? [];
    const mode = resolveAttributionMode(links, items);
    if (mode === 'none') continue;

    const base: AttribExpense = {
      id: e.id,
      amount: Number(e.amount) || 0,
      currencyCode: e.currencyCode,
      date: dayOf(e.date),
      categoryId: e.categoryId ?? null,
      discountAmount: e.discountAmount ?? null,
      isSplitReceivable: e.isSplitReceivable ?? null,
      isPlanned: e.isPlanned ?? null,
    };

    if (mode === 'lines') {
      out.expenses.push(base);
      out.items.push(...items);
      continue;
    }

    const live = (e.splits ?? []).filter((s) => !s.isDeleted);
    if (live.length === 0) {
      out.expenses.push(base);
      out.links.push(...links);
      continue;
    }
    // Whole attribution of a split expense: one part per split, each with the
    // expense's child shares, so the child's money lands in the split categories.
    attributeToCategories({ amount: e.amount, categoryId: e.categoryId, splits: live }).forEach((part, k) => {
      const id = `${e.id}#split${k}`;
      out.expenses.push({ ...base, id, amount: part.amount, categoryId: part.categoryId ?? null });
      for (const l of links) out.links.push({ ...l, expenseId: id });
    });
  }
  return out;
}

const yearRange = (now: Date) => ({ from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` });

/** One child's summary and 800+ coverage (this calendar year, against the year's spending). */
export function computeChildCosts(
  childId: string,
  sources: ChildCostSources,
  input: AttributionInput = toAttributionInput(sources.expenses, sources.lines),
): { summary: ChildCostSummary; coverage: ChildBenefitCoverage | null } {
  const convert = makeConverter(sources.rates, sources.displayCurrency);
  const summary = childCostSummary({ childId, ...input, convert, now: sources.now });

  const { from, to } = yearRange(sources.now);
  const incomes = filterIncomeConsumption(sources.incomes)
    .filter((i) => !i.isDeleted && i.childBenefitChildId === childId)
    .map((i) => ({
      amount: Number(i.amount) || 0,
      currencyCode: i.currencyCode,
      date: dayOf(i.date),
      childBenefitChildId: i.childBenefitChildId ?? null,
      isSplitReceivable: i.isSplitReceivable ?? null,
    }));
  const coverage = benefitCoverage({ childId, incomes, spending: summary.yearTotal, from, to, convert });
  // `benefitCoverage` drops a payment without a rate silently; the screen's notice must cover it too.
  const benefitFx = incomes.some(
    (i) => i.date >= from && i.date <= to && convert(i.amount, i.currencyCode) === null,
  );
  // No benefit income this year: the coverage line is not shown at all.
  return {
    summary: benefitFx && !summary.fxApproximate ? { ...summary, fxApproximate: true } : summary,
    coverage: coverage.benefit > 0 ? coverage : null,
  };
}

/** This month's total per child, for the Analytics "Children" section. */
export function computeChildMonthTotals(
  childIds: string[],
  sources: ChildCostSources,
): Map<string, { monthTotal: number; fxApproximate: boolean }> {
  const input = toAttributionInput(sources.expenses, sources.lines);
  const convert = makeConverter(sources.rates, sources.displayCurrency);
  const out = new Map<string, { monthTotal: number; fxApproximate: boolean }>();
  for (const childId of childIds) {
    const s = childCostSummary({ childId, ...input, convert, now: sources.now });
    out.set(childId, { monthTotal: s.monthTotal, fxApproximate: s.fxApproximate });
  }
  return out;
}

/**
 * Web has no SQLite: the lines come from the list pull (`expense.items`, kept
 * only for line-attributed expenses), with any line a screen has loaded and
 * edited since (`expenseStore.expenseItems`) taking precedence, so a line
 * attributed in this session counts without waiting for the next pull.
 */
export function collectWebLines(expenses: Expense[], loaded: Record<string, ExpenseItem[]>): ExpenseItem[] {
  const out: ExpenseItem[] = [];
  for (const e of expenses) {
    const pulled = e.items ?? [];
    const fresh = loaded[e.id];
    if (fresh && fresh.length > 0) {
      const pulledById = new Map(pulled.map((p) => [p.id, p]));
      if (!fresh.some((l) => !l.isDeleted && l.childId) && pulled.length === 0) continue;
      // The loaded lines are current; the pulled copy contributes what they lack (category, discount).
      for (const l of fresh) {
        const p = pulledById.get(l.id);
        out.push({
          ...l,
          expenseId: e.id,
          categoryId: l.categoryId ?? p?.categoryId ?? null,
          lineDiscount: l.lineDiscount ?? p?.lineDiscount ?? null,
        });
      }
    } else {
      for (const p of pulled) out.push({ ...p, expenseId: e.id });
    }
  }
  return out;
}
