import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class BudgetsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(accountId: string, userId: string, dto: any) {
    return this.prisma.budget.create({
      data: {
        accountId,
        userId,
        clientId: dto.localId,
        name: dto.name,
        amount: dto.amount,
        currencyCode: dto.currencyCode,
        period: dto.period,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        categoryId: dto.categoryId,
        alertThreshold: dto.alertThreshold || 80,
      },
      include: { category: true },
    });
  }

  async findAll(accountId: string, filters: any = {}) {
    const where: any = { accountId, isDeleted: false };

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }
    if (filters.categoryId) {
      where.categoryId = filters.categoryId;
    }

    return this.prisma.budget.findMany({
      where,
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(accountId: string, id: string) {
    const budget = await this.prisma.budget.findFirst({
      where: { id, accountId, isDeleted: false },
      include: { category: true },
    });

    if (!budget) {
      throw new NotFoundException('Budget not found');
    }

    return budget;
  }

  async update(accountId: string, id: string, dto: any) {
    const budget = await this.findOne(accountId, id);

    return this.prisma.budget.update({
      where: { id: budget.id },
      data: {
        ...dto,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        syncVersion: { increment: 1 },
      },
      include: { category: true },
    });
  }

  async remove(accountId: string, id: string) {
    const budget = await this.findOne(accountId, id);

    await this.prisma.budget.update({
      where: { id: budget.id },
      data: {
        isDeleted: true,
        syncVersion: { increment: 1 },
      },
    });

    return { success: true };
  }

  async getProgress(accountId: string, id: string) {
    const budget = await this.findOne(accountId, id);

    // Calculate spent amount for this budget period
    const periodStart = budget.startDate;
    const periodEnd = budget.endDate || new Date();
    const now = new Date();

    const whereExpenses: any = {
      accountId,
      isDeleted: false,
      currencyCode: budget.currencyCode,
      date: {
        gte: periodStart,
        lte: periodEnd,
      },
    };

    if (budget.categoryId) {
      whereExpenses.categoryId = budget.categoryId;
    }

    const spent = await this.prisma.expense.aggregate({
      where: whereExpenses,
      _sum: { amount: true },
    });

    const spentAmount = Number(spent._sum?.amount || 0);
    const budgetAmount = Number(budget.amount);
    const remaining = Math.max(0, budgetAmount - spentAmount);
    const percentageUsed = budgetAmount > 0 ? (spentAmount / budgetAmount) * 100 : 0;
    const isOverBudget = spentAmount > budgetAmount;

    // Calculate prediction fields
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysElapsed = Math.max(1, Math.ceil((now.getTime() - periodStart.getTime()) / msPerDay));
    const totalDaysInPeriod = Math.max(1, Math.ceil((periodEnd.getTime() - periodStart.getTime()) / msPerDay));
    const daysRemaining = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / msPerDay));

    const dailyBurnRate = spentAmount / daysElapsed;
    const projectedTotal = dailyBurnRate * totalDaysInPeriod;

    // Estimate when budget will run out
    let estimatedExhaustionDate: string | undefined;
    if (dailyBurnRate > 0 && !isOverBudget) {
      const daysUntilExhaustion = remaining / dailyBurnRate;
      const exhaustionDate = new Date(now.getTime() + daysUntilExhaustion * msPerDay);
      // Only return if exhaustion is within the budget period
      if (exhaustionDate <= periodEnd) {
        estimatedExhaustionDate = exhaustionDate.toISOString();
      }
    }

    return {
      budget,
      spent: spentAmount,
      remaining,
      percentageUsed,
      isOverBudget,
      daysRemaining,
      projectedTotal,
      dailyBurnRate,
      estimatedExhaustionDate,
    };
  }
}
