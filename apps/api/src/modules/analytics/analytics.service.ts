import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

interface ExpenseWithCategory {
  id: string;
  amount: unknown;
  description: string | null;
  date: Date;
  categoryId: string | null;
  category?: { name: string } | null;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(userId: string, startDate: Date, endDate: Date) {
    // Get expenses in date range
    const expenses = await this.prisma.expense.findMany({
      where: {
        userId,
        date: { gte: startDate, lte: endDate },
        isDeleted: false,
      },
      include: { category: true },
      orderBy: { amount: 'desc' },
    });

    const totalExpenses = expenses.reduce((sum: number, e: ExpenseWithCategory) => sum + Number(e.amount), 0);

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
        userId,
        date: { gte: previousStartDate, lt: previousEndDate },
        isDeleted: false,
      },
      _sum: { amount: true },
    });

    const previousTotal = Number(previousExpenses._sum.amount || 0);
    const vsLastPeriod = previousTotal > 0 ? ((totalExpenses - previousTotal) / previousTotal) * 100 : 0;

    return {
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      totalIncome: 0, // TODO: Implement income tracking
      totalExpenses,
      netSavings: 0 - totalExpenses,
      expensesByCategory,
      topExpenses,
      trends: {
        vsLastPeriod,
        vsAverage: 0, // TODO: Calculate average
      },
    };
  }

  async getTrends(userId: string, startDate: Date, endDate: Date) {
    // Get daily totals
    const expenses = await this.prisma.expense.findMany({
      where: {
        userId,
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
}
