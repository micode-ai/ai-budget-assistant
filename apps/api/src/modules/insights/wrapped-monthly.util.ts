import type { WrappedCard, WrappedResponse } from '@budget/shared-types';
import { MIN_TRACKED_ROWS, RECEIPT_SOURCES, CATEGORY_MIX_LIMIT, rankCategories, round2 } from './wrapped.util';

// A merchant visited fewer times than this in a month is not a habit worth a card.
export const MIN_HABIT_VISITS = 2;

/** Flat, IO-free expense row for the monthly assembler. `inMonth` false = the previous month. */
export interface MonthlyWrappedExpenseRow {
  amount: number;
  currencyCode: string;
  inMonth: boolean;
  date: string; // 'YYYY-MM-DD'
  weekday: number; // 0 = Sunday … 6 = Saturday
  merchant: string | null;
  source: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
}

export interface MonthlyWrappedIncomeRow {
  amount: number;
  currencyCode: string;
  inMonth: boolean;
}

export interface MonthlyWrappedInputs {
  year: number;
  month: number; // 1-12
  baseCurrency: string;
  generatedAt: string;
  expenses: MonthlyWrappedExpenseRow[]; // this month AND the previous one
  incomes: MonthlyWrappedIncomeRow[];
  rates: Record<string, number> | null;
  streakLongest: number;
  streakCurrent: number;
}

/**
 * Assemble the monthly Wrapped deck (ABA-641) — the yearly deck's short sibling, sent on the 1st of
 * each month for the month just ended. Pure like `assembleWrapped`: rows, rates and the clock are
 * injected. Same rules: amounts in `baseCurrency`, an unknown rate is excluded and flips
 * `fxApproximate`, and only cards that have data are included.
 */
export function assembleMonthlyWrapped(inputs: MonthlyWrappedInputs): WrappedResponse {
  const { year, month, baseCurrency, generatedAt, rates } = inputs;

  let fxApproximate = false;
  const convert = (amount: number, from: string): number => {
    const cur = from || baseCurrency;
    if (cur === baseCurrency) return amount;
    fxApproximate = true;
    const r = rates ? rates[cur] : undefined;
    if (!r || r <= 0) return 0;
    return amount / r;
  };

  const expenses = inputs.expenses.filter((e) => e.inMonth);
  const incomes = inputs.incomes.filter((i) => i.inMonth);
  const prevExpenses = inputs.expenses.filter((e) => !e.inMonth);
  const trackedRows = expenses.length + incomes.length;

  if (trackedRows < MIN_TRACKED_ROWS) {
    return { year, month, baseCurrency, generatedAt, hasEnoughData: false, fxApproximate: false, cards: [] };
  }

  const totalExpenses = round2(expenses.reduce((s, e) => s + convert(e.amount, e.currencyCode), 0));
  const totalIncome = round2(incomes.reduce((s, i) => s + convert(i.amount, i.currencyCode), 0));
  const prevTotal = round2(prevExpenses.reduce((s, e) => s + convert(e.amount, e.currencyCode), 0));

  const { categoriesSorted, pct } = rankCategories(expenses, convert);

  // Biggest single purchase (converted), ties keep the earliest row.
  let biggest: { row: MonthlyWrappedExpenseRow; amount: number } | null = null;
  for (const e of expenses) {
    const amount = convert(e.amount, e.currencyCode);
    if (amount > 0 && (!biggest || amount > biggest.amount)) biggest = { row: e, amount };
  }

  const weekdayTotals = new Array<number>(7).fill(0);
  for (const e of expenses) weekdayTotals[e.weekday] += convert(e.amount, e.currencyCode);
  let busiest = 0;
  for (let d = 1; d < 7; d++) if (weekdayTotals[d] > weekdayTotals[busiest]) busiest = d;

  const merchantMap = new Map<string, { visits: number; spent: number }>();
  for (const e of expenses) {
    const m = (e.merchant || '').trim();
    if (!m) continue;
    const cur = merchantMap.get(m) || { visits: 0, spent: 0 };
    cur.visits += 1;
    cur.spent += convert(e.amount, e.currencyCode);
    merchantMap.set(m, cur);
  }
  const topMerchant = [...merchantMap.entries()].sort(
    (a, b) => b[1].visits - a[1].visits || b[1].spent - a[1].spent,
  )[0];

  const receiptsScanned = expenses.filter((e) => RECEIPT_SOURCES.includes(e.source)).length;
  const netSavings = round2(totalIncome - totalExpenses);
  const savingsRate = totalIncome > 0 ? Math.round((netSavings / totalIncome) * 1000) / 10 : null;

  const cards: WrappedCard[] = [];
  cards.push({ type: 'intro', year, month, baseCurrency });
  cards.push({ type: 'total_tracked', totalExpenses, totalIncome, transactionCount: trackedRows, baseCurrency, fxApproximate });
  if (prevTotal > 0 && totalExpenses > 0) {
    cards.push({
      type: 'vs_last_month',
      totalExpenses,
      prevTotalExpenses: prevTotal,
      changePct: Math.round(((totalExpenses - prevTotal) / prevTotal) * 1000) / 10,
      baseCurrency,
      fxApproximate,
    });
  }
  if (categoriesSorted.length > 0) {
    const top = categoriesSorted[0];
    cards.push({
      type: 'top_category',
      categoryId: top.categoryId,
      name: top.name,
      amount: top.amount,
      percentage: pct(top.amount),
      color: top.color,
      baseCurrency,
    });
  }
  if (categoriesSorted.length >= 2) {
    cards.push({
      type: 'category_mix',
      categories: categoriesSorted.slice(0, CATEGORY_MIX_LIMIT).map((c) => ({
        categoryId: c.categoryId,
        name: c.name,
        amount: c.amount,
        percentage: pct(c.amount),
        color: c.color,
      })),
      baseCurrency,
    });
  }
  if (biggest) {
    cards.push({
      type: 'biggest_purchase',
      amount: round2(biggest.amount),
      merchant: biggest.row.merchant?.trim() || null,
      categoryName: biggest.row.categoryName,
      date: biggest.row.date,
      baseCurrency,
      fxApproximate,
    });
  }
  if (weekdayTotals[busiest] > 0) {
    cards.push({ type: 'busiest_weekday', weekday: busiest, amount: round2(weekdayTotals[busiest]), baseCurrency, fxApproximate });
  }
  if (topMerchant && topMerchant[1].visits >= MIN_HABIT_VISITS) {
    cards.push({
      type: 'top_merchant',
      name: topMerchant[0],
      visits: topMerchant[1].visits,
      totalSpent: round2(topMerchant[1].spent),
      baseCurrency,
      fxApproximate,
    });
  }
  if (receiptsScanned > 0) cards.push({ type: 'receipts_scanned', count: receiptsScanned });
  if (totalIncome > 0) {
    // savedVsLastYear has no meaning on a monthly deck; the change against last month is its own card.
    cards.push({ type: 'savings', netSavings, savingsRate, savedVsLastYear: null, baseCurrency, fxApproximate });
  }
  if (inputs.streakLongest > 0) {
    cards.push({ type: 'streak', longestStreak: inputs.streakLongest, currentStreak: inputs.streakCurrent });
  }
  cards.push({ type: 'outro', year, month });

  return { year, month, baseCurrency, generatedAt, hasEnoughData: true, fxApproximate, cards };
}
