import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFilteredTransactions } from './useFilteredTransactions';
import { getCategoryDisplayName } from '@/utils/categoryDisplayName';
import { categoryLabel } from '@/utils/entityLabel';
import { buildParentOf, normalizeCategoryKeys } from './buildParentOf';
import { groupExpensesByCategory } from './categoryGrouping';
import { inWindow, sameWindowLastYear } from './periodWindows';
import { buildYearOverYearRows } from './yearOverYear';
import { transactionDay } from './localDayKey';
import type { TimeRange } from './useAnalytics';

const MAX_ROWS = 8;
const FALLBACK_COLOR = '#9AA0A6';

export interface YearOverYearRowView {
  categoryId: string | null;
  name: string;
  color: string;
  current: number;
  lastYear: number;
  change: number | null;
}

export interface YearOverYearAnalytics {
  rows: YearOverYearRowView[];
  totals: { current: number; lastYear: number; change: number | null };
  /** The current period is in progress, so last year is cut to the same days. */
  partial: boolean;
}

/**
 * The selected month or year against the same period a year earlier, per
 * top-level category (ABA-797). Same currency filter, conversion, split
 * attribution and same-days rule as the rest of the tab. `null` for the week
 * view and for an account with no spending in last year's window — no
 * comparison is better than "+100%" against nothing.
 */
export function useYearOverYear(
  timeRange: TimeRange,
  currencyCode?: string,
  selectedMonth?: number,
  selectedYear?: number,
): YearOverYearAnalytics | null {
  const { t } = useTranslation();
  const { expenses, filteredExpenses, categories, toDisplayCurrency, dateRange, anchorDay } = useFilteredTransactions(
    timeRange,
    currencyCode,
    selectedMonth,
    selectedYear,
  );

  return useMemo(() => {
    const window = sameWindowLastYear(timeRange, dateRange, new Date(), anchorDay);
    if (!window) return null;
    const lastYearExpenses = expenses.filter((e) => {
      if (e.isDeleted) return false;
      if (currencyCode && e.currencyCode !== currencyCode) return false;
      return inWindow(transactionDay(e.date), window);
    });
    const lastYearMap = normalizeCategoryKeys(groupExpensesByCategory(lastYearExpenses, toDisplayCurrency), categories);
    const lastYearTotal = [...lastYearMap.values()].reduce((s, v) => s + v, 0);
    if (lastYearTotal <= 0) return null;

    const currentMap = normalizeCategoryKeys(groupExpensesByCategory(filteredExpenses, toDisplayCurrency), categories);
    const currentTotal = [...currentMap.values()].reduce((s, v) => s + v, 0);
    const findCategory = (id: string | null) =>
      id ? categories.find((c) => c.id === id) || categories.find((c) => c.name === id) : undefined;

    const rows = buildYearOverYearRows(currentMap, lastYearMap, buildParentOf(categories))
      .slice(0, MAX_ROWS)
      .map((r) => {
        const category = findCategory(r.categoryId);
        return {
          ...r,
          name: category ? getCategoryDisplayName(category, t) : categoryLabel(category),
          color: category?.color || FALLBACK_COLOR,
        };
      });

    return {
      rows,
      totals: {
        current: currentTotal,
        lastYear: lastYearTotal,
        change: Math.round(((currentTotal - lastYearTotal) / lastYearTotal) * 1000) / 10,
      },
      partial: window.partial,
    };
  }, [timeRange, dateRange, anchorDay, expenses, filteredExpenses, categories, currencyCode, toDisplayCurrency, t]);
}
