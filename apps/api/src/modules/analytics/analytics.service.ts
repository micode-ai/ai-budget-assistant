import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import type { DrillDownLevel, ChartConfig, ChartDataPoint } from '@budget/shared-types';

interface ExpenseWithCategory {
  id: string;
  amount: unknown;
  currencyCode: string;
  description: string | null;
  date: Date;
  categoryId: string | null;
  category?: { name: string } | null;
}

/**
 * Pure calculation used by computeVsAverage / computeVsAverageMulti.
 * Exported for unit testing without mocking the DB/cache stack.
 */
export function computeVsAverageFromTotals(currentTotal: number, monthlyTotals: number[]): number {
  const hasData = monthlyTotals.some((t) => t > 0);
  if (!hasData) return 0;

  const rollingAverage = monthlyTotals.reduce((s, t) => s + t, 0) / monthlyTotals.length;

  if (rollingAverage === 0) return currentTotal > 0 ? 100 : 0;

  return Math.round(((currentTotal - rollingAverage) / rollingAverage) * 10000) / 100;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Fetch total expenses for a single calendar month, using Redis cache.
   * Cache key: analytics:trailing-avg:{accountId}:{YYYY-MM}
   */
  private async getMonthlyTotal(accountId: string, year: number, month: number): Promise<number> {
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const cacheKey = `analytics:trailing-avg:${accountId}:${monthKey}`;

    const cached = await this.cache.get<number>(cacheKey);
    if (cached !== null) return cached;

    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1); // exclusive upper bound
    const agg = await this.prisma.expense.aggregate({
      where: { accountId, date: { gte: start, lt: end }, isDeleted: false },
      _sum: { amount: true },
    });
    const total = Number(agg._sum?.amount || 0);
    await this.cache.set(cacheKey, total, 3600);
    return total;
  }

  /**
   * Compute the signed percentage difference between currentTotal and the
   * rolling average of the trailing N full calendar months before startDate.
   *
   * Returns 0 when there is no historical data (new account).
   */
  private async computeVsAverage(
    accountId: string,
    startDate: Date,
    currentTotal: number,
    months = 3,
  ): Promise<number> {
    const monthlyTotals: number[] = [];

    for (let i = 1; i <= months; i++) {
      // Walk backwards: month i before startDate
      const d = new Date(startDate.getFullYear(), startDate.getMonth() - i, 1);
      const total = await this.getMonthlyTotal(accountId, d.getFullYear(), d.getMonth() + 1);
      monthlyTotals.push(total);
    }

    return computeVsAverageFromTotals(currentTotal, monthlyTotals);
  }

  /**
   * Like computeVsAverage but for multiple accounts (aggregated summary).
   */
  private async computeVsAverageMulti(
    accountIds: string[],
    startDate: Date,
    currentTotal: number,
    months = 3,
  ): Promise<number> {
    const monthlyTotals: number[] = [];

    for (let i = 1; i <= months; i++) {
      const d = new Date(startDate.getFullYear(), startDate.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);

      const cacheKey = `analytics:trailing-avg-multi:${accountIds.slice().sort().join(',')}:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const cached = await this.cache.get<number>(cacheKey);
      if (cached !== null) {
        monthlyTotals.push(cached);
        continue;
      }

      const agg = await this.prisma.expense.aggregate({
        where: { accountId: { in: accountIds }, date: { gte: start, lt: end }, isDeleted: false },
        _sum: { amount: true },
      });
      const total = Number(agg._sum?.amount || 0);
      await this.cache.set(cacheKey, total, 3600);
      monthlyTotals.push(total);
    }

    return computeVsAverageFromTotals(currentTotal, monthlyTotals);
  }

  /**
   * Check if the account has Tier 2 (full) encryption, meaning amounts are
   * encrypted and server-side analytics cannot compute totals.
   */
  private async isFullEncryption(accountId: string): Promise<boolean> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { encryptionTier: true },
    });
    return (account?.encryptionTier ?? 0) >= 2;
  }

  private encryptionRestrictedSummary(startDate: Date, endDate: Date) {
    return {
      encryptionRestricted: true,
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      totalIncome: 0,
      totalExpenses: 0,
      totalDiscountSavings: 0,
      netSavings: 0,
      expensesByCategory: [],
      expensesByCurrency: [],
      topExpenses: [],
      trends: { vsLastPeriod: 0, vsAverage: 0 },
    };
  }

  async getSummary(accountId: string, startDate: Date, endDate: Date) {
    if (await this.isFullEncryption(accountId)) {
      return this.encryptionRestrictedSummary(startDate, endDate);
    }

    // Get incomes in date range
    const incomeAgg = await this.prisma.income.aggregate({
      where: {
        accountId,
        date: { gte: startDate, lte: endDate },
        isDeleted: false,
      },
      _sum: { amount: true },
    });
    const totalIncome = Number(incomeAgg._sum?.amount || 0);

    // Get expenses in date range
    const expenses = await this.prisma.expense.findMany({
      where: {
        accountId,
        date: { gte: startDate, lte: endDate },
        isDeleted: false,
      },
      include: {
        category: true,
        categorySplits: { where: { isDeleted: false }, include: { category: true } },
      },
      orderBy: { amount: 'desc' },
    });

    const totalExpenses = expenses.reduce((sum: number, e: ExpenseWithCategory) => sum + Number(e.amount), 0);
    const totalDiscountSavings = expenses.reduce((sum: number, e: any) => sum + Number(e.discountAmount || 0), 0);

    // Group expenses by currency
    const currencyTotals = new Map<string, { total: number; count: number }>();
    for (const expense of expenses) {
      const currency = expense.currencyCode || 'USD';
      const current = currencyTotals.get(currency) || { total: 0, count: 0 };
      currencyTotals.set(currency, {
        total: current.total + Number(expense.amount),
        count: current.count + 1,
      });
    }

    const expensesByCurrency = Array.from(currencyTotals.entries()).map(([currencyCode, data]) => ({
      currencyCode,
      totalExpenses: data.total,
      transactionCount: data.count,
    }));

    // Group by category
    const categoryMap = new Map<string, { amount: number; count: number; name: string }>();
    for (const expense of expenses as any[]) {
      // If expense has splits, use those instead of single category
      if (expense.categorySplits && expense.categorySplits.length > 0) {
        for (const split of expense.categorySplits) {
          const catId = split.categoryId;
          const catName = split.category?.name || 'Uncategorized';
          const current = categoryMap.get(catId) || { amount: 0, count: 0, name: catName };
          categoryMap.set(catId, {
            amount: current.amount + Number(split.amount),
            count: current.count + 1,
            name: catName,
          });
        }
      } else {
        const categoryId = expense.categoryId || 'uncategorized';
        const categoryName = expense.category?.name || 'Uncategorized';
        const current = categoryMap.get(categoryId) || { amount: 0, count: 0, name: categoryName };
        categoryMap.set(categoryId, {
          amount: current.amount + Number(expense.amount),
          count: current.count + 1,
          name: categoryName,
        });
      }
    }

    const expensesByCategory = Array.from(categoryMap.entries())
      .map(([categoryId, data]) => ({
        categoryId,
        categoryName: data.name,
        amount: data.amount,
        percentage: totalExpenses > 0 ? (data.amount / totalExpenses) * 100 : 0,
        count: data.count,
      }))
      .sort((a, b) => b.amount - a.amount);

    const topExpenses = expenses.slice(0, 10).map((e: ExpenseWithCategory) => ({
      id: e.id,
      description: e.description,
      amount: Number(e.amount),
      date: e.date.toISOString(),
      categoryName: e.category?.name || 'Uncategorized',
    }));

    // Calculate trend vs previous period
    const periodLength = endDate.getTime() - startDate.getTime();
    const previousStartDate = new Date(startDate.getTime() - periodLength);
    const previousEndDate = startDate;

    const previousExpenses = await this.prisma.expense.aggregate({
      where: {
        accountId,
        date: { gte: previousStartDate, lt: previousEndDate },
        isDeleted: false,
      },
      _sum: { amount: true },
    });

    const previousTotal = Number(previousExpenses._sum?.amount || 0);
    const vsLastPeriod = previousTotal > 0 ? ((totalExpenses - previousTotal) / previousTotal) * 100 : 0;

    const vsAverage = await this.computeVsAverage(accountId, startDate, totalExpenses);

    return {
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      totalIncome,
      totalExpenses,
      totalDiscountSavings,
      netSavings: totalIncome - totalExpenses,
      expensesByCategory,
      expensesByCurrency,
      topExpenses,
      trends: {
        vsLastPeriod,
        vsAverage,
      },
    };
  }

  async getItemBreakdown(accountId: string, startDate: Date, endDate: Date) {
    if (await this.isFullEncryption(accountId)) {
      return { encryptionRestricted: true, data: [] };
    }

    const expenses = await this.prisma.expense.findMany({
      where: {
        accountId,
        date: { gte: startDate, lte: endDate },
        isDeleted: false,
        source: 'ocr',
      },
      include: {
        items: { where: { isDeleted: false } },
      },
    });

    const itemMap = new Map<string, { totalSpent: number; count: number }>();

    for (const expense of expenses) {
      for (const item of expense.items) {
        if (!item.description) continue;
        const key = item.description.toLowerCase().trim();
        const existing = itemMap.get(key) || { totalSpent: 0, count: 0 };
        itemMap.set(key, {
          totalSpent: existing.totalSpent + Number(item.totalPrice),
          count: existing.count + Number(item.quantity || 1),
        });
      }
    }

    return Array.from(itemMap.entries())
      .map(([description, data]) => ({
        description,
        totalSpent: data.totalSpent,
        count: data.count,
        avgPrice: data.count > 0 ? data.totalSpent / data.count : 0,
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 50);
  }

  async getTrends(accountId: string, startDate: Date, endDate: Date) {
    if (await this.isFullEncryption(accountId)) {
      return { encryptionRestricted: true, data: [] };
    }

    // Get daily totals
    const expenses = await this.prisma.expense.findMany({
      where: {
        accountId,
        date: { gte: startDate, lte: endDate },
        isDeleted: false,
      },
      orderBy: { date: 'asc' },
    });

    // Group by date
    const dailyTotals = new Map<string, number>();
    for (const expense of expenses) {
      const dateKey = expense.date.toISOString().split('T')[0];
      dailyTotals.set(dateKey, (dailyTotals.get(dateKey) || 0) + Number(expense.amount));
    }

    return Array.from(dailyTotals.entries()).map(([date, amount]) => ({
      date,
      amount,
    }));
  }

  async getAggregatedSummary(userId: string, startDate: Date, endDate: Date) {
    // Find all accounts where the user is a member
    const memberships = await this.prisma.accountMember.findMany({
      where: { userId },
      select: { accountId: true },
    });

    const allAccountIds = memberships.map((m: { accountId: string }) => m.accountId);

    // Exclude accounts with Tier 2 (full) encryption — amounts are not readable server-side
    const accounts = await this.prisma.account.findMany({
      where: { id: { in: allAccountIds } },
      select: { id: true, encryptionTier: true },
    });
    const accountIds = accounts
      .filter((a: { encryptionTier: number }) => (a.encryptionTier ?? 0) < 2)
      .map((a: { id: string }) => a.id);

    if (accountIds.length === 0) {
      return {
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
        totalIncome: 0,
        totalExpenses: 0,
        netSavings: 0,
        expensesByCategory: [],
        topExpenses: [],
        trends: { vsLastPeriod: 0, vsAverage: 0 },
        accountCount: 0,
      };
    }

    // Get incomes across all accounts in date range
    const incomeAgg = await this.prisma.income.aggregate({
      where: {
        accountId: { in: accountIds },
        date: { gte: startDate, lte: endDate },
        isDeleted: false,
      },
      _sum: { amount: true },
    });
    const totalIncome = Number(incomeAgg._sum?.amount || 0);

    // Get expenses across all accounts in date range
    const expenses = await this.prisma.expense.findMany({
      where: {
        accountId: { in: accountIds },
        date: { gte: startDate, lte: endDate },
        isDeleted: false,
      },
      include: {
        category: true,
        categorySplits: { where: { isDeleted: false }, include: { category: true } },
      },
      orderBy: { amount: 'desc' },
    });

    const totalExpenses = expenses.reduce((sum: number, e: ExpenseWithCategory) => sum + Number(e.amount), 0);
    const totalDiscountSavings = expenses.reduce((sum: number, e: any) => sum + Number(e.discountAmount || 0), 0);

    // Group by category
    const categoryMap = new Map<string, { amount: number; count: number; name: string }>();
    for (const expense of expenses as any[]) {
      // If expense has splits, use those instead of single category
      if (expense.categorySplits && expense.categorySplits.length > 0) {
        for (const split of expense.categorySplits) {
          const catId = split.categoryId;
          const catName = split.category?.name || 'Uncategorized';
          const current = categoryMap.get(catId) || { amount: 0, count: 0, name: catName };
          categoryMap.set(catId, {
            amount: current.amount + Number(split.amount),
            count: current.count + 1,
            name: catName,
          });
        }
      } else {
        const categoryId = expense.categoryId || 'uncategorized';
        const categoryName = expense.category?.name || 'Uncategorized';
        const current = categoryMap.get(categoryId) || { amount: 0, count: 0, name: categoryName };
        categoryMap.set(categoryId, {
          amount: current.amount + Number(expense.amount),
          count: current.count + 1,
          name: categoryName,
        });
      }
    }

    const expensesByCategory = Array.from(categoryMap.entries())
      .map(([categoryId, data]) => ({
        categoryId,
        categoryName: data.name,
        amount: data.amount,
        percentage: totalExpenses > 0 ? (data.amount / totalExpenses) * 100 : 0,
        count: data.count,
      }))
      .sort((a, b) => b.amount - a.amount);

    const topExpenses = expenses.slice(0, 10).map((e: ExpenseWithCategory) => ({
      id: e.id,
      description: e.description,
      amount: Number(e.amount),
      date: e.date.toISOString(),
      categoryName: e.category?.name || 'Uncategorized',
    }));

    // Calculate trend vs previous period
    const periodLength = endDate.getTime() - startDate.getTime();
    const previousStartDate = new Date(startDate.getTime() - periodLength);
    const previousEndDate = startDate;

    const previousExpenses = await this.prisma.expense.aggregate({
      where: {
        accountId: { in: accountIds },
        date: { gte: previousStartDate, lt: previousEndDate },
        isDeleted: false,
      },
      _sum: { amount: true },
    });

    const previousTotal = Number(previousExpenses._sum?.amount || 0);
    const vsLastPeriod = previousTotal > 0 ? ((totalExpenses - previousTotal) / previousTotal) * 100 : 0;

    const vsAverage = await this.computeVsAverageMulti(accountIds, startDate, totalExpenses);

    return {
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      totalIncome,
      totalExpenses,
      totalDiscountSavings,
      netSavings: totalIncome - totalExpenses,
      expensesByCategory,
      topExpenses,
      trends: {
        vsLastPeriod,
        vsAverage,
      },
      accountCount: accountIds.length,
    };
  }

  async getDrillDown(
    accountId: string,
    level: DrillDownLevel,
    startDate: Date,
    endDate: Date,
    parentId?: string,
    currencyCode?: string,
    locale?: string,
  ) {
    const effectiveLocale = locale || 'en';
    if (await this.isFullEncryption(accountId)) {
      return {
        encryptionRestricted: true,
        chart: { chartType: 'bar' as const, title: 'Encryption restricted', data: [], drillDown: { enabled: false, currentLevel: level } },
        breadcrumb: [],
      };
    }

    const currencyFilter = currencyCode ? { currencyCode } : {};

    if (level === 'year') {
      // Monthly totals
      const expenses = await this.prisma.expense.findMany({
        where: {
          accountId,
          isDeleted: false,
          date: { gte: startDate, lte: endDate },
          ...currencyFilter,
        },
        orderBy: { date: 'asc' },
      });

      const monthlyTotals = new Map<string, number>();
      for (const expense of expenses) {
        const monthKey = `${expense.date.getFullYear()}-${String(expense.date.getMonth() + 1).padStart(2, '0')}`;
        monthlyTotals.set(monthKey, (monthlyTotals.get(monthKey) || 0) + Number(expense.amount));
      }

      const data: ChartDataPoint[] = Array.from(monthlyTotals.entries()).map(([key, value]) => {
        const month = parseInt(key.split('-')[1]) - 1;
        const label = new Intl.DateTimeFormat(effectiveLocale, { month: 'short' }).format(new Date(2000, month));
        return { label, value, id: key };
      });

      const chart: ChartConfig = {
        chartType: 'bar',
        title: 'Monthly Spending',
        data,
        drillDown: { enabled: true, currentLevel: 'year', nextLevel: 'month' },
        formatting: { currencyCode, showValues: true },
      };

      const breadcrumb = [{ level: 'year' as DrillDownLevel, label: `${startDate.getFullYear()}` }];
      return { chart, breadcrumb };
    }

    if (level === 'month') {
      // Weekly totals within a month
      const expenses = await this.prisma.expense.findMany({
        where: {
          accountId,
          isDeleted: false,
          date: { gte: startDate, lte: endDate },
          ...currencyFilter,
        },
        orderBy: { date: 'asc' },
      });

      const weeklyTotals = new Map<number, number>();
      for (const expense of expenses) {
        const dayOfMonth = expense.date.getDate();
        const weekNum = Math.ceil(dayOfMonth / 7);
        weeklyTotals.set(weekNum, (weeklyTotals.get(weekNum) || 0) + Number(expense.amount));
      }

      const data: ChartDataPoint[] = Array.from(weeklyTotals.entries())
        .sort(([a], [b]) => a - b)
        .map(([week, value]) => ({
          label: `Week ${week}`,
          value,
          id: String(week),
        }));

      const monthLabel = new Intl.DateTimeFormat(effectiveLocale, { month: 'long' }).format(startDate);

      const chart: ChartConfig = {
        chartType: 'bar',
        title: `${monthLabel} Spending`,
        data,
        drillDown: { enabled: true, currentLevel: 'month', nextLevel: 'week', parentId },
        formatting: { currencyCode, showValues: true },
      };

      const breadcrumb = [
        { level: 'year' as DrillDownLevel, label: `${startDate.getFullYear()}` },
        { level: 'month' as DrillDownLevel, label: monthLabel, id: parentId },
      ];
      return { chart, breadcrumb };
    }

    if (level === 'week') {
      // Daily totals within a week
      const expenses = await this.prisma.expense.findMany({
        where: {
          accountId,
          isDeleted: false,
          date: { gte: startDate, lte: endDate },
          ...currencyFilter,
        },
        orderBy: { date: 'asc' },
      });

      const dailyTotals = new Map<string, number>();
      for (const expense of expenses) {
        const dateKey = expense.date.toISOString().split('T')[0];
        dailyTotals.set(dateKey, (dailyTotals.get(dateKey) || 0) + Number(expense.amount));
      }

      const dayFormatter = new Intl.DateTimeFormat(effectiveLocale, { weekday: 'short' });
      const data: ChartDataPoint[] = Array.from(dailyTotals.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dateKey, value]) => {
          const d = new Date(dateKey + 'T12:00:00Z');
          return { label: dayFormatter.format(d), value, id: dateKey };
        });

      const chart: ChartConfig = {
        chartType: 'bar',
        title: 'Daily Spending',
        data,
        drillDown: { enabled: true, currentLevel: 'week', nextLevel: 'day', parentId },
        formatting: { currencyCode, showValues: true },
      };

      const breadcrumb = [
        { level: 'year' as DrillDownLevel, label: `${startDate.getFullYear()}` },
        { level: 'month' as DrillDownLevel, label: new Intl.DateTimeFormat(effectiveLocale, { month: 'long' }).format(startDate), id: `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}` },
        { level: 'week' as DrillDownLevel, label: `Week ${parentId || ''}`, id: parentId },
      ];
      return { chart, breadcrumb };
    }

    if (level === 'day' || level === 'transactions') {
      // Individual transactions for a specific day
      const expenses = await this.prisma.expense.findMany({
        where: {
          accountId,
          isDeleted: false,
          date: { gte: startDate, lte: endDate },
          ...currencyFilter,
        },
        include: { category: true },
        orderBy: { amount: 'desc' },
      });

      const transactions = expenses.map((e: { id: string; amount: unknown; description: string | null; date: Date; category?: { name: string } | null; currencyCode: string }) => ({
        id: e.id,
        description: e.description || 'No description',
        amount: Number(e.amount),
        date: e.date.toISOString(),
        categoryName: e.category?.name || 'Uncategorized',
        currencyCode: e.currencyCode,
      }));

      const data: ChartDataPoint[] = transactions.slice(0, 10).map((t: { id: string; description: string; amount: number }) => ({
        label: t.description.substring(0, 15),
        value: t.amount,
        id: t.id,
      }));

      const chart: ChartConfig = {
        chartType: 'bar',
        title: `Transactions`,
        data,
        drillDown: { enabled: false, currentLevel: 'day' },
        formatting: { currencyCode, showValues: true },
      };

      const dateLabel = new Intl.DateTimeFormat(effectiveLocale, { month: 'short', day: 'numeric' }).format(startDate);
      const breadcrumb = [
        { level: 'year' as DrillDownLevel, label: `${startDate.getFullYear()}` },
        { level: 'month' as DrillDownLevel, label: new Intl.DateTimeFormat(effectiveLocale, { month: 'long' }).format(startDate), id: `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}` },
        { level: 'day' as DrillDownLevel, label: dateLabel, id: parentId },
      ];
      return { chart, transactions, breadcrumb };
    }

    // Fallback
    return {
      chart: { chartType: 'bar' as const, title: 'No data', data: [], drillDown: { enabled: false, currentLevel: level } },
      breadcrumb: [],
    };
  }

  async getTagBreakdown(accountId: string, startDate: Date, endDate: Date) {
    if (await this.isFullEncryption(accountId)) {
      return { encryptionRestricted: true, data: [] };
    }

    const expenseTags = await this.prisma.expenseTag.findMany({
      where: {
        isDeleted: false,
        expense: {
          accountId,
          date: { gte: startDate, lte: endDate },
          isDeleted: false,
        },
      },
      include: {
        tag: true,
        expense: { select: { amount: true, currencyCode: true } },
      },
    });

    const tagMap = new Map<string, { tagId: string; tagName: string; color: string | null; amount: number; count: number }>();
    for (const et of expenseTags) {
      if (!et.tag) continue;
      const current = tagMap.get(et.tag.id) || {
        tagId: et.tag.id,
        tagName: et.tag.name,
        color: et.tag.color,
        amount: 0,
        count: 0,
      };
      current.amount += Number(et.expense.amount);
      current.count++;
      tagMap.set(et.tag.id, current);
    }

    const total = Array.from(tagMap.values()).reduce((sum, t) => sum + t.amount, 0);
    return Array.from(tagMap.values())
      .map(t => ({ ...t, percentage: total > 0 ? (t.amount / total) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }

  async getProjectBreakdown(accountId: string) {
    if (await this.isFullEncryption(accountId)) {
      return { encryptionRestricted: true, data: [] };
    }

    const projects = await this.prisma.project.findMany({
      where: { accountId, isDeleted: false },
      include: {
        projectExpenses: {
          where: { isDeleted: false },
          include: { expense: { select: { amount: true, currencyCode: true } } },
        },
        projectIncomes: {
          where: { isDeleted: false },
          include: { income: { select: { amount: true } } },
        },
      },
    });

    return projects.map((p: typeof projects[number]) => ({
      projectId: p.id,
      projectName: p.name,
      color: p.color,
      totalExpenses: p.projectExpenses.reduce((sum: number, pe: { expense: { amount: unknown } }) => sum + Number(pe.expense.amount), 0),
      totalIncome: p.projectIncomes.reduce((sum: number, pi: { income: { amount: unknown } }) => sum + Number(pi.income.amount), 0),
      expenseCount: p.projectExpenses.length,
      budget: p.budget ? Number(p.budget) : null,
      isArchived: p.isArchived,
    }));
  }
}
