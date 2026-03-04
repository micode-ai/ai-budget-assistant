import { useMemo } from 'react';
import { useExpenseStore } from '@/stores/expenseStore';
import { useIncomeStore } from '@/stores/incomeStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useExchangeRateStore, convertAmount } from '@/stores/exchangeRateStore';
import { getCategoryDisplayName } from '@/utils/categoryDisplayName';
import { useTranslation } from 'react-i18next';

export interface CategoryAdjustment {
  categoryId: string | null;
  name: string;
  icon?: string;
  color?: string;
  currentMonthly: number;
  adjustedMonthly: number;
  percentChange: number;
}

export interface ExtraIncome {
  id: string;
  description: string;
  amount: number;
}

export interface ProjectionPoint {
  month: number;
  label: string;
  currentCumulative: number;
  scenarioCumulative: number;
}

export interface HorizonSummary {
  current: number;
  scenario: number;
  diff: number;
}

export interface ScenarioProjection {
  baseCurrency: string;
  currentMonthlyExpense: number;
  currentMonthlyIncome: number;
  currentMonthlySavings: number;
  scenarioMonthlyExpense: number;
  scenarioMonthlyIncome: number;
  scenarioMonthlySavings: number;
  monthlySavingsDiff: number;
  expenseCategories: CategoryAdjustment[];
  incomeCategories: CategoryAdjustment[];
  projectionPoints: ProjectionPoint[];
  horizonTotals: Record<3 | 6 | 12, HorizonSummary>;
  hasData: boolean;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Computes a 3-month rolling average for the last N months of data,
 * grouped by categoryId, converted to baseCurrency.
 */
function computeMonthlyAverages(
  transactions: Array<{ amount: number; currencyCode: string; categoryId?: string | null; date: string | Date; isDeleted?: boolean }>,
  baseCurrency: string,
  rates: Record<string, number>,
  lookbackMonths = 3,
): Map<string | null, number> {
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - lookbackMonths, 1);

  const totals = new Map<string | null, number>();
  let count = 0;

  for (const tx of transactions) {
    if (tx.isDeleted) continue;
    const d = new Date(tx.date);
    if (d < cutoff) continue;
    // Determine which "full month" slot this falls into
    const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
    // We just accumulate totals — will divide by months below
    const catId = tx.categoryId ?? null;
    const converted = convertAmount(tx.amount, tx.currencyCode, baseCurrency, rates);
    totals.set(catId, (totals.get(catId) ?? 0) + converted);
    void monthKey; // used implicitly
    count++;
  }

  // Divide by lookback period to get monthly average
  const result = new Map<string | null, number>();
  for (const [catId, total] of totals) {
    result.set(catId, total / lookbackMonths);
  }

  void count;
  return result;
}

export function useScenarioProjection(
  expenseAdjustments: Record<string, number>, // categoryId -> percent change (-100..+100)
  incomeAdjustments: Record<string, number>,
  extraIncomes: ExtraIncome[],
  horizon: 3 | 6 | 12,
): ScenarioProjection {
  const { t } = useTranslation();
  const { expenses } = useExpenseStore();
  const { incomes } = useIncomeStore();
  const { categories } = useCategoryStore();
  const { rates, baseCurrency } = useExchangeRateStore();

  const currency = baseCurrency || 'USD';

  return useMemo(() => {
    // --- Compute monthly averages ---
    const expenseAvg = computeMonthlyAverages(expenses, currency, rates);
    const incomeAvg = computeMonthlyAverages(incomes, currency, rates);

    const hasData = expenseAvg.size > 0 || incomeAvg.size > 0;

    // --- Build expense category breakdown ---
    const expenseCategories: CategoryAdjustment[] = [];
    for (const [catId, currentMonthly] of expenseAvg) {
      if (currentMonthly < 0.01) continue;
      const cat = catId ? categories.find(c => c.id === catId) : undefined;
      const pct = expenseAdjustments[catId ?? 'null'] ?? 0;
      expenseCategories.push({
        categoryId: catId,
        name: cat ? getCategoryDisplayName(cat, t) : (catId ? catId : t('common.uncategorized')),
        icon: cat?.icon,
        color: cat?.color,
        currentMonthly,
        adjustedMonthly: currentMonthly * (1 + pct / 100),
        percentChange: pct,
      });
    }
    expenseCategories.sort((a, b) => b.currentMonthly - a.currentMonthly);

    // --- Build income category breakdown ---
    const incomeCategories: CategoryAdjustment[] = [];
    for (const [catId, currentMonthly] of incomeAvg) {
      if (currentMonthly < 0.01) continue;
      const cat = catId ? categories.find(c => c.id === catId) : undefined;
      const pct = incomeAdjustments[catId ?? 'null'] ?? 0;
      incomeCategories.push({
        categoryId: catId,
        name: cat ? getCategoryDisplayName(cat, t) : (catId ? catId : t('common.uncategorized')),
        icon: cat?.icon,
        color: cat?.color,
        currentMonthly,
        adjustedMonthly: currentMonthly * (1 + pct / 100),
        percentChange: pct,
      });
    }
    incomeCategories.sort((a, b) => b.currentMonthly - a.currentMonthly);

    // --- Totals ---
    const currentMonthlyExpense = expenseCategories.reduce((s, c) => s + c.currentMonthly, 0);
    const currentMonthlyIncome = incomeCategories.reduce((s, c) => s + c.currentMonthly, 0);
    const currentMonthlySavings = currentMonthlyIncome - currentMonthlyExpense;

    const scenarioMonthlyExpense = expenseCategories.reduce((s, c) => s + c.adjustedMonthly, 0);
    const extraIncomeTotal = extraIncomes.reduce((s, e) => s + (e.amount || 0), 0);
    const scenarioMonthlyIncome = incomeCategories.reduce((s, c) => s + c.adjustedMonthly, 0) + extraIncomeTotal;
    const scenarioMonthlySavings = scenarioMonthlyIncome - scenarioMonthlyExpense;
    const monthlySavingsDiff = scenarioMonthlySavings - currentMonthlySavings;

    // --- Projection points for chart ---
    const now = new Date();
    const projectionPoints: ProjectionPoint[] = [];
    for (let m = 1; m <= horizon; m++) {
      const targetMonth = new Date(now.getFullYear(), now.getMonth() + m, 1);
      const label = MONTHS_SHORT[targetMonth.getMonth()];
      projectionPoints.push({
        month: m,
        label,
        currentCumulative: currentMonthlySavings * m,
        scenarioCumulative: scenarioMonthlySavings * m,
      });
    }

    // --- Horizon totals ---
    const makeHorizon = (h: number): HorizonSummary => ({
      current: currentMonthlySavings * h,
      scenario: scenarioMonthlySavings * h,
      diff: monthlySavingsDiff * h,
    });

    const horizonTotals = {
      3: makeHorizon(3),
      6: makeHorizon(6),
      12: makeHorizon(12),
    } as Record<3 | 6 | 12, HorizonSummary>;

    return {
      baseCurrency: currency,
      currentMonthlyExpense,
      currentMonthlyIncome,
      currentMonthlySavings,
      scenarioMonthlyExpense,
      scenarioMonthlyIncome,
      scenarioMonthlySavings,
      monthlySavingsDiff,
      expenseCategories,
      incomeCategories,
      projectionPoints,
      horizonTotals,
      hasData,
    };
  }, [expenses, incomes, categories, currency, rates, expenseAdjustments, incomeAdjustments, extraIncomes, horizon, t]);
}
