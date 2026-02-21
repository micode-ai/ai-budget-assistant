/**
 * Client-side analytics computed from local SQLite data.
 * Used for Tier 2 encrypted accounts where server-side analytics are unavailable
 * because amounts are encrypted.
 */
import { executeSql } from '../db/client';
import type { AnalyticsSummary } from '@budget/shared-types';

interface CategoryBreakdownRow {
  category_id: string;
  category_name: string;
  total: number;
  count: number;
}

interface TopExpenseRow {
  id: string;
  description: string;
  amount: number;
  date: string;
  category_name: string;
}

interface TotalRow {
  total: number;
}

/**
 * Compute analytics summary from local SQLite data.
 * Equivalent to the server's GET /analytics/summary but runs entirely on-device.
 */
export async function getLocalAnalyticsSummary(
  accountId: string,
  startDate: string,
  endDate: string,
): Promise<AnalyticsSummary> {
  // Total expenses for the period
  const expenseTotal = await executeSql<TotalRow>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM expenses
     WHERE account_id = ? AND is_deleted = 0
     AND date >= ? AND date <= ?`,
    [accountId, startDate, endDate],
  );

  // Total incomes for the period
  const incomeTotal = await executeSql<TotalRow>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM incomes
     WHERE account_id = ? AND is_deleted = 0
     AND date >= ? AND date <= ?`,
    [accountId, startDate, endDate],
  );

  const totalExpenses = expenseTotal[0]?.total ?? 0;
  const totalIncome = incomeTotal[0]?.total ?? 0;

  // Expenses by category
  const categoryRows = await executeSql<CategoryBreakdownRow>(
    `SELECT
       e.category_id,
       COALESCE(c.name, 'Uncategorized') as category_name,
       SUM(e.amount) as total,
       COUNT(*) as count
     FROM expenses e
     LEFT JOIN categories c ON c.id = e.category_id
     WHERE e.account_id = ? AND e.is_deleted = 0
     AND e.date >= ? AND e.date <= ?
     GROUP BY e.category_id
     ORDER BY total DESC`,
    [accountId, startDate, endDate],
  );

  const expensesByCategory = categoryRows.map((row) => ({
    categoryId: row.category_id || '',
    categoryName: row.category_name,
    amount: row.total,
    percentage: totalExpenses > 0 ? (row.total / totalExpenses) * 100 : 0,
    count: row.count,
  }));

  // Top expenses
  const topRows = await executeSql<TopExpenseRow>(
    `SELECT
       e.id,
       COALESCE(e.description, '') as description,
       e.amount,
       e.date,
       COALESCE(c.name, 'Uncategorized') as category_name
     FROM expenses e
     LEFT JOIN categories c ON c.id = e.category_id
     WHERE e.account_id = ? AND e.is_deleted = 0
     AND e.date >= ? AND e.date <= ?
     ORDER BY e.amount DESC
     LIMIT 5`,
    [accountId, startDate, endDate],
  );

  const topExpenses = topRows.map((row) => ({
    id: row.id,
    description: row.description,
    amount: row.amount,
    date: row.date,
    categoryName: row.category_name,
  }));

  // Total discount savings
  const discountTotal = await executeSql<TotalRow>(
    `SELECT COALESCE(SUM(discount_amount), 0) as total FROM expenses
     WHERE account_id = ? AND is_deleted = 0
     AND date >= ? AND date <= ?
     AND discount_amount > 0`,
    [accountId, startDate, endDate],
  );

  // Trends: compare with previous period of the same length
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  const periodMs = endMs - startMs;
  const prevStart = new Date(startMs - periodMs).toISOString().split('T')[0];
  const prevEnd = new Date(startMs - 1).toISOString().split('T')[0];

  const prevExpenseTotal = await executeSql<TotalRow>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM expenses
     WHERE account_id = ? AND is_deleted = 0
     AND date >= ? AND date <= ?`,
    [accountId, prevStart, prevEnd],
  );
  const prevTotal = prevExpenseTotal[0]?.total ?? 0;

  const vsLastPeriod = prevTotal > 0
    ? ((totalExpenses - prevTotal) / prevTotal) * 100
    : 0;

  return {
    period: { start: startDate, end: endDate },
    totalIncome,
    totalExpenses,
    netSavings: totalIncome - totalExpenses,
    expensesByCategory,
    topExpenses,
    totalDiscountSavings: discountTotal[0]?.total ?? 0,
    trends: {
      vsLastPeriod,
      vsAverage: 0, // Would require more historical data
    },
  };
}

/**
 * Get spending by day for charts (local computation).
 */
export async function getLocalSpendingByDay(
  accountId: string,
  startDate: string,
  endDate: string,
): Promise<{ date: string; amount: number }[]> {
  const rows = await executeSql<{ date: string; total: number }>(
    `SELECT date, SUM(amount) as total FROM expenses
     WHERE account_id = ? AND is_deleted = 0
     AND date >= ? AND date <= ?
     GROUP BY date
     ORDER BY date ASC`,
    [accountId, startDate, endDate],
  );

  return rows.map((row) => ({
    date: row.date,
    amount: row.total,
  }));
}

/**
 * Get monthly totals for trend charts (local computation).
 */
export async function getLocalMonthlyTotals(
  accountId: string,
  months: number = 12,
): Promise<{ month: string; expenses: number; income: number }[]> {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  const startStr = startDate.toISOString().split('T')[0];

  const expenseRows = await executeSql<{ month: string; total: number }>(
    `SELECT strftime('%Y-%m', date) as month, SUM(amount) as total
     FROM expenses
     WHERE account_id = ? AND is_deleted = 0 AND date >= ?
     GROUP BY strftime('%Y-%m', date)
     ORDER BY month ASC`,
    [accountId, startStr],
  );

  const incomeRows = await executeSql<{ month: string; total: number }>(
    `SELECT strftime('%Y-%m', date) as month, SUM(amount) as total
     FROM incomes
     WHERE account_id = ? AND is_deleted = 0 AND date >= ?
     GROUP BY strftime('%Y-%m', date)
     ORDER BY month ASC`,
    [accountId, startStr],
  );

  const expenseMap = new Map(expenseRows.map((r) => [r.month, r.total]));
  const incomeMap = new Map(incomeRows.map((r) => [r.month, r.total]));
  const allMonths = new Set([...expenseMap.keys(), ...incomeMap.keys()]);

  return Array.from(allMonths)
    .sort()
    .map((month) => ({
      month,
      expenses: expenseMap.get(month) ?? 0,
      income: incomeMap.get(month) ?? 0,
    }));
}
