import type { WrappedCard, WrappedResponse } from '@budget/shared-types';

// Below this many tracked rows in the year, Wrapped isn't worth showing.
export const MIN_TRACKED_ROWS = 5;
// How many categories the mix card carries.
export const CATEGORY_MIX_LIMIT = 6;
// Expense sources that count toward the "receipts scanned" card.
export const RECEIPT_SOURCES = ['ocr', 'notification'];

/** Flat, IO-free expense row consumed by the pure assembler. */
export interface WrappedExpenseRow {
  amount: number;
  currencyCode: string;
  year: number;
  month: number; // 0-11
  merchant: string | null;
  source: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
}

/** Flat, IO-free income row consumed by the pure assembler. */
export interface WrappedIncomeRow {
  amount: number;
  currencyCode: string;
  year: number;
}

export interface WrappedInputs {
  year: number;
  baseCurrency: string;
  generatedAt: string; // ISO datetime — injected so the assembler stays pure
  expenses: WrappedExpenseRow[]; // this year AND prior year
  incomes: WrappedIncomeRow[]; // this year AND prior year
  rates: Record<string, number> | null; // base-currency rate table, or null when unavailable
  inflationPct: number | null;
  streakLongest: number;
  streakCurrent: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Assemble the Financial Wrapped deck from already-fetched data.
 *
 * Pure and deterministic — no Prisma, no network, no clock — so it can be
 * unit-tested directly (mirrors safe-to-spend.util.ts). All monetary output is
 * in `baseCurrency`; amounts whose rate is unknown are excluded from sums and
 * flip `fxApproximate`.
 */
export function assembleWrapped(inputs: WrappedInputs): WrappedResponse {
  const { year, baseCurrency, generatedAt, expenses, incomes, rates } = inputs;

  let fxApproximate = false;
  const convert = (amount: number, from: string): number => {
    const cur = from || baseCurrency;
    if (cur === baseCurrency) return amount;
    fxApproximate = true;
    const r = rates ? rates[cur] : undefined;
    if (!r || r <= 0) return 0; // unknown rate → excluded from the sum
    return amount / r;
  };

  const yearExpenses = expenses.filter((e) => e.year === year);
  const yearIncomes = incomes.filter((i) => i.year === year);
  const trackedRows = yearExpenses.length + yearIncomes.length;

  const empty = (): WrappedResponse => ({
    year,
    baseCurrency,
    generatedAt,
    hasEnoughData: false,
    fxApproximate: false,
    cards: [],
  });

  if (trackedRows < MIN_TRACKED_ROWS) return empty();

  // ── Totals ────────────────────────────────────────────────
  const totalExpenses = round2(
    yearExpenses.reduce((s, e) => s + convert(e.amount, e.currencyCode), 0),
  );
  const totalIncome = round2(
    yearIncomes.reduce((s, i) => s + convert(i.amount, i.currencyCode), 0),
  );

  // ── Top merchant (visits, tie-break by spend) ─────────────
  const merchantMap = new Map<string, { visits: number; spent: number }>();
  for (const e of yearExpenses) {
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

  // ── Biggest month ─────────────────────────────────────────
  const monthTotals = new Array<number>(12).fill(0);
  for (const e of yearExpenses) monthTotals[e.month] += convert(e.amount, e.currencyCode);
  let biggestMonthIdx = 0;
  for (let i = 1; i < 12; i++) {
    if (monthTotals[i] > monthTotals[biggestMonthIdx]) biggestMonthIdx = i;
  }
  const hasMonthSpend = monthTotals[biggestMonthIdx] > 0;

  // ── Categories ────────────────────────────────────────────
  const catMap = new Map<
    string,
    { categoryId: string | null; name: string; color: string | null; amount: number }
  >();
  for (const e of yearExpenses) {
    const id = e.categoryId || 'uncategorized';
    const cur = catMap.get(id) || {
      categoryId: e.categoryId ?? null,
      name: e.categoryName || 'Uncategorized',
      color: e.categoryColor ?? null,
      amount: 0,
    };
    cur.amount += convert(e.amount, e.currencyCode);
    catMap.set(id, cur);
  }
  const categoriesSorted = [...catMap.values()]
    .map((c) => ({ ...c, amount: round2(c.amount) }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const catTotal = categoriesSorted.reduce((s, c) => s + c.amount, 0);
  const pct = (amt: number) => (catTotal > 0 ? Math.round((amt / catTotal) * 1000) / 10 : 0);

  // ── Receipts scanned ──────────────────────────────────────
  const receiptsScanned = yearExpenses.filter((e) => RECEIPT_SOURCES.includes(e.source)).length;

  // ── Savings vs last year ──────────────────────────────────
  const prevExpenses = expenses.filter((e) => e.year === year - 1);
  const prevIncomes = incomes.filter((i) => i.year === year - 1);
  const prevHasData = prevExpenses.length + prevIncomes.length > 0;
  const netSavings = round2(totalIncome - totalExpenses);
  const savingsRate = totalIncome > 0 ? Math.round((netSavings / totalIncome) * 1000) / 10 : null;
  let savedVsLastYear: number | null = null;
  if (prevHasData) {
    const prevExp = prevExpenses.reduce((s, e) => s + convert(e.amount, e.currencyCode), 0);
    const prevInc = prevIncomes.reduce((s, i) => s + convert(i.amount, i.currencyCode), 0);
    savedVsLastYear = round2(netSavings - (prevInc - prevExp));
  }

  // ── Assemble ordered cards (only those with data) ─────────
  const cards: WrappedCard[] = [];
  cards.push({ type: 'intro', year, baseCurrency });
  cards.push({
    type: 'total_tracked',
    totalExpenses,
    totalIncome,
    transactionCount: trackedRows,
    baseCurrency,
    fxApproximate,
  });
  if (topMerchant) {
    cards.push({
      type: 'top_merchant',
      name: topMerchant[0],
      visits: topMerchant[1].visits,
      totalSpent: round2(topMerchant[1].spent),
      baseCurrency,
      fxApproximate,
    });
  }
  if (hasMonthSpend) {
    cards.push({
      type: 'biggest_month',
      month: `${year}-${String(biggestMonthIdx + 1).padStart(2, '0')}`,
      monthIndex: biggestMonthIdx,
      amount: round2(monthTotals[biggestMonthIdx]),
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
  if (receiptsScanned > 0) {
    cards.push({ type: 'receipts_scanned', count: receiptsScanned });
  }
  cards.push({
    type: 'savings',
    netSavings,
    savingsRate,
    savedVsLastYear,
    baseCurrency,
    fxApproximate,
  });
  if (inputs.inflationPct != null) {
    cards.push({ type: 'personal_inflation', indexPct: inputs.inflationPct });
  }
  if (inputs.streakLongest > 0) {
    cards.push({
      type: 'streak',
      longestStreak: inputs.streakLongest,
      currentStreak: inputs.streakCurrent,
    });
  }
  cards.push({ type: 'outro', year });

  return {
    year,
    baseCurrency,
    generatedAt,
    hasEnoughData: true,
    fxApproximate,
    cards,
  };
}
