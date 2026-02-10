import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

interface ExpenseWithCategory {
  id: string;
  amount: unknown;
  currencyCode: string;
  description: string | null;
  date: Date;
  categoryId: string | null;
  category?: { name: string } | null;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(accountId: string, startDate: Date, endDate: Date) {
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
      include: { category: true },
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
    for (const expense of expenses) {
      const categoryId = expense.categoryId || 'uncategorized';
      const categoryName = expense.category?.name || 'Uncategorized';
      const current = categoryMap.get(categoryId) || { amount: 0, count: 0, name: categoryName };
      categoryMap.set(categoryId, {
        amount: current.amount + Number(expense.amount),
        count: current.count + 1,
        name: categoryName,
      });
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
        vsAverage: 0, // TODO: Calculate average
      },
    };
  }

  async getItemBreakdown(accountId: string, startDate: Date, endDate: Date) {
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

    const accountIds = memberships.map((m) => m.accountId);

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
      include: { category: true },
      orderBy: { amount: 'desc' },
    });

    const totalExpenses = expenses.reduce((sum: number, e: ExpenseWithCategory) => sum + Number(e.amount), 0);
    const totalDiscountSavings = expenses.reduce((sum: number, e: any) => sum + Number(e.discountAmount || 0), 0);

    // Group by category
    const categoryMap = new Map<string, { amount: number; count: number; name: string }>();
    for (const expense of expenses) {
      const categoryId = expense.categoryId || 'uncategorized';
      const categoryName = expense.category?.name || 'Uncategorized';
      const current = categoryMap.get(categoryId) || { amount: 0, count: 0, name: categoryName };
      categoryMap.set(categoryId, {
        amount: current.amount + Number(expense.amount),
        count: current.count + 1,
        name: categoryName,
      });
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
        vsAverage: 0,
      },
      accountCount: accountIds.length,
    };
  }
}
