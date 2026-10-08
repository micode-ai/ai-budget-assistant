import type {
  ImportReportBudgetSuggestion,
  ImportReportDuplicate,
  ImportReportMerchant,
  ImportReportResponse,
  ImportReportSubscription,
} from '@budget/shared-types';
import { DAY_MS, expensePayee, normalizeMerchant } from '../anomaly/anomaly-helpers.util';
import { rankCategories, round2 } from '../insights/wrapped.util';

// Below this many imported expenses the report has nothing worth saying.
export const MIN_REPORT_EXPENSES = 10;
export const REPORT_CATEGORY_LIMIT = 6;
export const REPORT_MERCHANT_LIMIT = 5;
export const REPORT_DUPLICATE_LIMIT = 5;
export const BUDGET_SUGGESTION_LIMIT = 5;
const AVG_MONTH_DAYS = 30.4;

/** Flat, IO-free expense row for the pure report builder. */
export interface ImportReportExpenseRow {
  id: string;
  amount: number;
  currencyCode: string;
  date: Date;
  merchant: string | null;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
}

export interface ImportReportIncomeRow {
  amount: number;
  currencyCode: string;
}

export interface ImportReportInputs {
  batchId: string;
  baseCurrency: string;
  expenses: ImportReportExpenseRow[];
  incomes: ImportReportIncomeRow[];
  rates: Record<string, number> | null;
  /** Normalized names of subscriptions the account already tracks. */
  trackedSubscriptionNames: Set<string>;
  /** Category ids that already have an active budget allocation. */
  budgetedCategoryIds: Set<string>;
}

/** The payee as written on the statement — `expensePayee` is the normalized key, not for display. */
function displayPayee(e: { merchant: string | null; description: string | null }): string {
  return e.merchant?.trim() || e.description?.trim() || '';
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Round a monthly figure UP to a number a person would type as a budget. */
export function niceBudget(amount: number): number {
  if (amount <= 0) return 0;
  const step = amount < 100 ? 10 : amount < 1000 ? 50 : 100;
  return Math.ceil(amount / step) * step;
}

/**
 * The cycle of a same-amount series. Lenient on purpose compared with the anomaly detector's
 * `detectCycle` (3 charges): a three-month statement holds only two or three charges of a monthly
 * subscription, so two monthly-spaced charges are enough here — the user confirms before anything
 * is tracked.
 */
export function seriesCycle(dates: Date[]): 'monthly' | 'weekly' | null {
  if (dates.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i++) gaps.push((dates[i].getTime() - dates[i - 1].getTime()) / DAY_MS);
  if (gaps.every((g) => g >= 25 && g <= 35)) return 'monthly';
  if (dates.length >= 3 && gaps.every((g) => g >= 6 && g <= 8)) return 'weekly';
  return null;
}

/**
 * What a just-committed import says about the user's money (ABA-643). Pure: rows, rates and the
 * account's existing subscriptions and budgets are injected, so it is tested without Prisma.
 * Totals are in `baseCurrency` (unknown rate → excluded, `fxApproximate`); a subscription and a
 * duplicate keep the charge's own currency, because that is what the user will track or check.
 */
export function buildImportReport(inputs: ImportReportInputs): ImportReportResponse {
  const { batchId, baseCurrency, rates } = inputs;
  let fxApproximate = false;
  const convert = (amount: number, from: string): number => {
    const cur = from || baseCurrency;
    if (cur === baseCurrency) return amount;
    fxApproximate = true;
    const r = rates ? rates[cur] : undefined;
    if (!r || r <= 0) return 0;
    return amount / r;
  };

  const expenses = [...inputs.expenses].sort((a, b) => a.date.getTime() - b.date.getTime());
  const base: ImportReportResponse = {
    batchId,
    baseCurrency,
    fxApproximate: false,
    hasEnoughData: false,
    periodStart: null,
    periodEnd: null,
    monthsCovered: 0,
    expenseCount: expenses.length,
    totalSpent: 0,
    totalIncome: 0,
    monthlyAverageSpend: 0,
    categories: [],
    topMerchants: [],
    subscriptions: [],
    duplicates: [],
    budgetSuggestions: [],
  };
  if (expenses.length < MIN_REPORT_EXPENSES) return base;

  const first = expenses[0].date;
  const last = expenses[expenses.length - 1].date;
  const spanDays = (last.getTime() - first.getTime()) / DAY_MS + 1;
  const monthsCovered = Math.max(1, Math.round(spanDays / AVG_MONTH_DAYS));

  const totalSpent = round2(expenses.reduce((s, e) => s + convert(e.amount, e.currencyCode), 0));
  const totalIncome = round2(inputs.incomes.reduce((s, i) => s + convert(i.amount, i.currencyCode), 0));

  // ── Categories ──
  const { categoriesSorted, pct } = rankCategories(expenses, convert);

  // ── Merchants (by spend) ──
  const merchantMap = new Map<string, ImportReportMerchant>();
  for (const e of expenses) {
    const payee = expensePayee(e);
    if (!payee) continue;
    const key = normalizeMerchant(payee);
    const cur = merchantMap.get(key) || { name: displayPayee(e), visits: 0, amount: 0 };
    cur.visits += 1;
    cur.amount += convert(e.amount, e.currencyCode);
    merchantMap.set(key, cur);
  }
  const topMerchants = [...merchantMap.values()]
    .map((m) => ({ ...m, amount: round2(m.amount) }))
    .filter((m) => m.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, REPORT_MERCHANT_LIMIT);

  // ── Recurring charges → subscriptions (same payee, amount and currency) ──
  const series = new Map<string, ImportReportExpenseRow[]>();
  for (const e of expenses) {
    const payee = expensePayee(e);
    if (!payee) continue;
    const key = `${normalizeMerchant(payee)}|${e.amount}|${e.currencyCode}`;
    const list = series.get(key) || [];
    list.push(e);
    series.set(key, list);
  }
  const subscriptions: ImportReportSubscription[] = [];
  for (const rows of series.values()) {
    if (inputs.trackedSubscriptionNames.has(normalizeMerchant(expensePayee(rows[0])))) continue;
    const cycle = seriesCycle(rows.map((r) => r.date));
    if (!cycle) continue;
    const lastRow = rows[rows.length - 1];
    const next = new Date(lastRow.date);
    if (cycle === 'monthly') next.setUTCMonth(next.getUTCMonth() + 1);
    else next.setUTCDate(next.getUTCDate() + 7);
    subscriptions.push({
      name: displayPayee(lastRow),
      amount: lastRow.amount,
      currencyCode: lastRow.currencyCode,
      billingCycle: cycle,
      charges: rows.length,
      lastDate: dateKey(lastRow.date),
      nextRenewalDate: dateKey(next),
      categoryId: lastRow.categoryId,
    });
  }
  subscriptions.sort((a, b) => b.amount - a.amount);

  // ── Possible duplicates: same payee + amount + currency within ±1 day, inside this import ──
  const duplicates: ImportReportDuplicate[] = [];
  const used = new Set<string>();
  for (let i = 0; i < expenses.length && duplicates.length < REPORT_DUPLICATE_LIMIT; i++) {
    const a = expenses[i];
    const payee = expensePayee(a);
    if (!payee || used.has(a.id)) continue;
    for (let j = i + 1; j < expenses.length; j++) {
      const b = expenses[j];
      if (b.date.getTime() - a.date.getTime() > DAY_MS) break;
      if (used.has(b.id) || b.amount !== a.amount || b.currencyCode !== a.currencyCode) continue;
      if (normalizeMerchant(expensePayee(b)) !== normalizeMerchant(payee)) continue;
      used.add(a.id);
      used.add(b.id);
      duplicates.push({ payee: displayPayee(a), amount: a.amount, currencyCode: a.currencyCode, date: dateKey(a.date), expenseIds: [a.id, b.id] });
      break;
    }
  }

  // ── Budget suggestions: top categories without a budget, monthly average rounded up ──
  const budgetSuggestions: ImportReportBudgetSuggestion[] = categoriesSorted
    .filter((c): c is typeof c & { categoryId: string } => !!c.categoryId && !inputs.budgetedCategoryIds.has(c.categoryId))
    .slice(0, BUDGET_SUGGESTION_LIMIT)
    .map((c) => ({ categoryId: c.categoryId, name: c.name, monthlyAmount: niceBudget(c.amount / monthsCovered) }))
    .filter((s) => s.monthlyAmount > 0);

  return {
    ...base,
    fxApproximate,
    hasEnoughData: true,
    periodStart: dateKey(first),
    periodEnd: dateKey(last),
    monthsCovered,
    totalSpent,
    totalIncome,
    monthlyAverageSpend: round2(totalSpent / monthsCovered),
    categories: categoriesSorted.slice(0, REPORT_CATEGORY_LIMIT).map((c) => ({
      categoryId: c.categoryId,
      name: c.name,
      color: c.color,
      amount: c.amount,
      percentage: pct(c.amount),
    })),
    topMerchants,
    subscriptions,
    duplicates,
    budgetSuggestions,
  };
}
