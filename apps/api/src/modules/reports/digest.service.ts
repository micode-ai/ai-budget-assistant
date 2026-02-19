import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getDigest(accountId: string, month: string) {
    // month format: "2025-01"
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const mon = parseInt(monthStr, 10);

    const periodStart = new Date(year, mon - 1, 1);
    const periodEnd = new Date(year, mon, 0); // last day of month

    // Check encryption
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { encryptionTier: true, currencyCode: true },
    });
    if (!account) throw new NotFoundException('Account not found');
    if (account.encryptionTier >= 2) {
      throw new ForbiddenException('Digests unavailable for fully encrypted accounts');
    }

    // Check cache
    const cached = await this.prisma.monthlyDigestCache.findUnique({
      where: { accountId_periodStart_periodEnd: { accountId, periodStart, periodEnd } },
    });
    if (cached && cached.expiresAt > new Date()) {
      return { digest: cached.data, generatedAt: cached.createdAt.toISOString() };
    }

    // Generate digest
    const currencyCode = account.currencyCode;
    const [expenses, incomes] = await Promise.all([
      this.prisma.expense.aggregate({
        where: { accountId, isDeleted: false, date: { gte: periodStart, lte: periodEnd }, currencyCode },
        _sum: { amount: true },
      }),
      this.prisma.income.aggregate({
        where: { accountId, isDeleted: false, date: { gte: periodStart, lte: periodEnd }, currencyCode },
        _sum: { amount: true },
      }),
    ]);

    const totalExpenses = Number(expenses._sum.amount || 0);
    const totalIncome = Number(incomes._sum.amount || 0);
    const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;

    // Top categories
    const categoryBreakdown = await this.prisma.expense.groupBy({
      by: ['categoryId'],
      where: { accountId, isDeleted: false, date: { gte: periodStart, lte: periodEnd }, currencyCode },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 5,
    });

    const categoryIds = categoryBreakdown.map(c => c.categoryId).filter(Boolean) as string[];
    const categoryNames = await this.prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true },
    });
    const nameMap = new Map(categoryNames.map(c => [c.id, c.name]));

    const topCategories = categoryBreakdown.map(c => ({
      categoryId: c.categoryId || null,
      name: nameMap.get(c.categoryId || '') || 'Uncategorized',
      amount: Number(c._sum.amount || 0),
      percentage: totalExpenses > 0 ? (Number(c._sum.amount || 0) / totalExpenses) * 100 : 0,
    }));

    // Previous month comparison
    const prevStart = new Date(year, mon - 2, 1);
    const prevEnd = new Date(year, mon - 1, 0);
    const [prevExpenses, prevIncomes] = await Promise.all([
      this.prisma.expense.aggregate({
        where: { accountId, isDeleted: false, date: { gte: prevStart, lte: prevEnd }, currencyCode },
        _sum: { amount: true },
      }),
      this.prisma.income.aggregate({
        where: { accountId, isDeleted: false, date: { gte: prevStart, lte: prevEnd }, currencyCode },
        _sum: { amount: true },
      }),
    ]);
    const prevTotalExpenses = Number(prevExpenses._sum.amount || 0);
    const prevTotalIncome = Number(prevIncomes._sum.amount || 0);

    const incomeChange = prevTotalIncome > 0 ? ((totalIncome - prevTotalIncome) / prevTotalIncome) * 100 : 0;
    const expenseChange = prevTotalExpenses > 0 ? ((totalExpenses - prevTotalExpenses) / prevTotalExpenses) * 100 : 0;

    const digestData = {
      periodLabel: month,
      currencyCode,
      totalIncome,
      totalExpenses,
      savingsRate: Math.round(savingsRate * 10) / 10,
      topCategories,
      incomeChange: Math.round(incomeChange * 10) / 10,
      expenseChange: Math.round(expenseChange * 10) / 10,
    };

    // Cache for 7 days
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.prisma.monthlyDigestCache.upsert({
      where: { accountId_periodStart_periodEnd: { accountId, periodStart, periodEnd } },
      update: { data: digestData, expiresAt, createdAt: new Date() },
      create: { accountId, periodStart, periodEnd, data: digestData, expiresAt },
    });

    return { digest: digestData, generatedAt: new Date().toISOString() };
  }
}
