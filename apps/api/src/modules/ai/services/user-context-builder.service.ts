import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CategoriesService } from '../../categories/categories.service';
import { DebtsService } from '../../debts/debts.service';

export interface UserContext {
  totalSpentThisMonth: number;
  monthlyBudget: number;
  topCategories: { name: string; amount: number }[];
  recentExpenses: { description: string; amount: number; category?: string; items?: { description: string; totalPrice: number }[] }[];
  tags: { name: string }[];
  projects: { name: string; spent: number }[];
  topItems: { description: string; totalSpent: number; count: number }[];
  savingsGoals: { id: string; name: string; targetAmount: number; currentAmount: number; currencyCode: string; deadline: string; status: string }[];
  categoryNames: string[];
  activeDebts: { id: string; type: 'lent' | 'borrowed'; contactName: string; remainingAmount: number; currencyCode: string; status: string }[];
}

interface ExpenseWithCategory {
  amount: unknown;
  description: string | null;
  accountId?: string;
  category?: { name: string } | null;
  categorySplits?: Array<{ amount: unknown; category?: { name: string } | null }>;
  items?: Array<{ description: string; totalPrice: unknown; quantity: unknown }>;
}

interface BudgetRecord {
  period: string;
  categoryId: string | null;
  amount: unknown;
}

@Injectable()
export class UserContextBuilder {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categoriesService: CategoriesService,
    private readonly debtsService: DebtsService,
  ) {}

  async build(userId: string, accountId?: string): Promise<UserContext> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const expenseWhere = accountId
      ? { accountId, date: { gte: startOfMonth }, isDeleted: false }
      : { userId, date: { gte: startOfMonth }, isDeleted: false };

    const expenses = await this.prisma.expense.findMany({
      where: expenseWhere,
      include: {
        category: true,
        categorySplits: { where: { isDeleted: false }, include: { category: true } },
        items: { where: { isDeleted: false } },
      },
      orderBy: { date: 'desc' },
      take: 50,
    });

    const budgetWhere = accountId
      ? { accountId, isActive: true, isDeleted: false }
      : { userId, isActive: true, isDeleted: false };
    const budgets = await this.prisma.budget.findMany({ where: budgetWhere });

    const totalSpent = expenses.reduce((sum: number, e: ExpenseWithCategory) => sum + Number(e.amount), 0);
    const monthlyBudget = budgets
      .filter((b: BudgetRecord) => b.period === 'monthly' && !b.categoryId)
      .reduce((sum: number, b: BudgetRecord) => sum + Number(b.amount), 0);

    const categoryTotals = new Map<string, number>();
    for (const expense of expenses as any[]) {
      if (expense.categorySplits && expense.categorySplits.length > 0) {
        for (const split of expense.categorySplits) {
          const catName = split.category?.name || 'Uncategorized';
          categoryTotals.set(catName, (categoryTotals.get(catName) || 0) + Number(split.amount));
        }
      } else {
        const categoryName = expense.category?.name || 'Uncategorized';
        categoryTotals.set(categoryName, (categoryTotals.get(categoryName) || 0) + Number(expense.amount));
      }
    }

    const topCategories = Array.from(categoryTotals.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    const recentExpenses = expenses.slice(0, 5).map((e: any) => {
      const category = e.categorySplits?.length > 0
        ? e.categorySplits.map((s: any) => s.category?.name).filter(Boolean).join(', ')
        : e.category?.name;
      const items = e.items?.map((i: any) => ({
        description: i.description,
        totalPrice: Number(i.totalPrice),
      }));
      return {
        description: e.description || 'Expense',
        amount: Number(e.amount),
        category,
        items: items?.length > 0 ? items : undefined,
      };
    });

    const itemMap = new Map<string, { totalSpent: number; count: number }>();
    for (const expense of expenses as any[]) {
      if (!expense.items) continue;
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
    const topItems = Array.from(itemMap.entries())
      .map(([description, data]) => ({ description, ...data }))
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10);

    const resolvedAccountId = accountId || (expenses[0] as any)?.accountId;
    let tags: { name: string }[] = [];
    let projects: { name: string; spent: number }[] = [];
    let categoryNames: string[] = [];

    if (resolvedAccountId) {
      const accountTags = await this.prisma.tag.findMany({
        where: { accountId: resolvedAccountId, isDeleted: false },
        orderBy: { usageCount: 'desc' },
        take: 20,
      });
      tags = accountTags.map((t: { name: string }) => ({ name: t.name }));

      const accountProjects = await this.prisma.project.findMany({
        where: { accountId: resolvedAccountId, isDeleted: false, isArchived: false },
        include: {
          projectExpenses: {
            where: { isDeleted: false },
            include: { expense: { select: { amount: true } } },
          },
        },
      });
      projects = accountProjects.map((p: { name: string; projectExpenses: Array<{ expense: { amount: unknown } }> }) => ({
        name: p.name,
        spent: p.projectExpenses.reduce((sum: number, pe: { expense: { amount: unknown } }) => sum + Number(pe.expense.amount), 0),
      }));

      const allCategories = await this.categoriesService.findAll(resolvedAccountId);
      categoryNames = allCategories.map((c: { name: string }) => c.name);
    }

    const goalsWhere = accountId
      ? { accountId, status: 'active' }
      : { userId, status: 'active' };
    const goals = await this.prisma.savingsGoal.findMany({ where: goalsWhere });
    const savingsGoals = goals.map((g: any) => ({
      id: g.id,
      name: g.name,
      targetAmount: Number(g.targetAmount),
      currentAmount: Number(g.currentAmount),
      currencyCode: g.currencyCode,
      deadline: g.deadline.toISOString().split('T')[0],
      status: g.status,
    }));

    let activeDebts: UserContext['activeDebts'] = [];
    if (accountId) {
      const debtSummary = await this.debtsService.getDebtSummary(accountId);
      activeDebts = [
        ...debtSummary.lent
          .filter((d: any) => d.status !== 'paid')
          .map((d: any) => ({ id: d.id, type: 'lent' as const, contactName: d.contactName, remainingAmount: d.remainingAmount, currencyCode: d.currencyCode, status: d.status })),
        ...debtSummary.borrowed
          .filter((d: any) => d.status !== 'paid')
          .map((d: any) => ({ id: d.id, type: 'borrowed' as const, contactName: d.contactName, remainingAmount: d.remainingAmount, currencyCode: d.currencyCode, status: d.status })),
      ];
    }

    return {
      totalSpentThisMonth: totalSpent,
      monthlyBudget,
      topCategories,
      recentExpenses,
      tags,
      projects,
      topItems,
      savingsGoals,
      categoryNames,
      activeDebts,
    };
  }
}
