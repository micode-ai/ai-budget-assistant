import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';

@Injectable()
export class ReportSchedulerService {
  private readonly logger = new Logger(ReportSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly exchangeRateService: ExchangeRateService,
  ) {}

  /**
   * Convert an amount from one currency to a target currency using rates.
   * If currencies match, returns original amount. If no rate found, returns original (best effort).
   */
  private convertAmount(
    amount: number,
    fromCurrency: string,
    targetCurrency: string,
    rates: Record<string, number>,
  ): number {
    if (fromCurrency === targetCurrency || amount === 0) return amount;
    // rates are based on targetCurrency as base, so rate = how many units of fromCurrency per 1 targetCurrency
    // To convert fromCurrency → targetCurrency: amount / rates[fromCurrency]
    const rate = rates[fromCurrency];
    if (!rate || rate === 0) {
      this.logger.warn(`No exchange rate for ${fromCurrency} → ${targetCurrency}, using raw amount`);
      return amount;
    }
    return amount / rate;
  }

  /**
   * Sum grouped amounts (by currency) converting each to the target currency.
   */
  private async sumWithConversion(
    groups: Array<{ currencyCode: string; _sum: { amount: any } }>,
    targetCurrency: string,
    rates: Record<string, number>,
  ): Promise<number> {
    let total = 0;
    for (const group of groups) {
      const raw = Number(group._sum.amount || 0);
      total += this.convertAmount(raw, group.currencyCode, targetCurrency, rates);
    }
    return total;
  }

  // Runs every day at 08:00 UTC — process weekly emails
  @Cron('0 8 * * *')
  async processWeeklyEmails() {
    const today = new Date().getDay(); // 0=Sun, 1=Mon, ...

    const users = await this.prisma.user.findMany({
      where: {
        weeklyEmailEnabled: true,
        weeklyEmailDay: today,
        isActive: true,
      },
      include: {
        subscription: true,
        accountMembers: {
          include: {
            account: { select: { id: true, name: true, currencyCode: true, encryptionTier: true } },
          },
        },
      },
    });

    this.logger.log(`Processing weekly emails for ${users.length} users`);

    for (const user of users) {
      // Business tier only
      if (user.subscription?.tier !== 'business') continue;
      await this.sendWeeklyEmailsForUser(user);
    }
  }

  async processWeeklyEmailsForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscription: true,
        accountMembers: {
          include: {
            account: { select: { id: true, name: true, currencyCode: true, encryptionTier: true } },
          },
        },
      },
    });

    if (!user || !user.weeklyEmailEnabled) {
      this.logger.warn(`trigger-weekly: user ${userId} not found or weekly email disabled`);
      return;
    }
    if (user.subscription?.tier !== 'business') {
      this.logger.warn(`trigger-weekly: user ${userId} is not on business tier`);
      return;
    }
    await this.sendWeeklyEmailsForUser(user);
  }

  private async sendWeeklyEmailsForUser(user: {
    id: string;
    email: string;
    name: string;
    accountMembers: Array<{ account: { id: string; name: string; currencyCode: string; encryptionTier: number } }>;
  }) {
    for (const membership of user.accountMembers) {
      const account = membership.account;
      // Skip fully encrypted accounts
      if (account.encryptionTier >= 2) continue;

      try {
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - 7);

        // Fetch exchange rates for account base currency to convert multi-currency amounts
        let rates: Record<string, number> = {};
        try {
          const rateData = await this.exchangeRateService.getRates(account.currencyCode);
          rates = rateData.rates;
        } catch (e) {
          this.logger.warn(`Could not fetch exchange rates for ${account.currencyCode}, sums may be inaccurate`);
        }

        // Group expenses and incomes by currency, then convert to account currency
        const [expenseGroups, incomeGroups] = await Promise.all([
          this.prisma.expense.groupBy({
            by: ['currencyCode'],
            where: { accountId: account.id, isDeleted: false, date: { gte: weekStart, lte: now } },
            _sum: { amount: true },
          }),
          this.prisma.income.groupBy({
            by: ['currencyCode'],
            where: { accountId: account.id, isDeleted: false, date: { gte: weekStart, lte: now } },
            _sum: { amount: true },
          }),
        ]);

        const totalExpenses = await this.sumWithConversion(expenseGroups, account.currencyCode, rates);
        const totalIncome = await this.sumWithConversion(incomeGroups, account.currencyCode, rates);
        const savingsRate = totalIncome > 0 ? Math.max(-100, ((totalIncome - totalExpenses) / totalIncome) * 100) : (totalExpenses > 0 ? -100 : 0);

        // Top categories — group by category AND currency, then convert and re-aggregate
        const categoryBreakdownRaw = await this.prisma.expense.groupBy({
          by: ['categoryId', 'currencyCode'],
          where: { accountId: account.id, isDeleted: false, date: { gte: weekStart, lte: now } },
          _sum: { amount: true },
        });

        // Aggregate per category with currency conversion
        const categoryTotals = new Map<string, number>();
        for (const row of categoryBreakdownRaw) {
          const catId = row.categoryId || '';
          const raw = Number(row._sum.amount || 0);
          const converted = this.convertAmount(raw, row.currencyCode, account.currencyCode, rates);
          categoryTotals.set(catId, (categoryTotals.get(catId) || 0) + converted);
        }

        // Sort and take top 5
        const sortedCategories = [...categoryTotals.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);

        const categoryIds = sortedCategories.map(([id]) => id).filter(Boolean);
        const categoryNames = await this.prisma.category.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true },
        });
        const nameMap = new Map(categoryNames.map(c => [c.id, c.name]));

        const topCategories = sortedCategories.map(([catId, amount]) => ({
          name: nameMap.get(catId) || 'Uncategorized',
          amount,
          percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
        }));

        const periodLabel = `${weekStart.toISOString().split('T')[0]} — ${now.toISOString().split('T')[0]}`;

        await this.mailService.sendWeeklyReport({
          to: user.email,
          userName: user.name,
          accountName: account.name,
          periodLabel,
          totalIncome,
          totalExpenses,
          savingsRate: Math.round(savingsRate * 10) / 10,
          topCategories,
          currencyCode: account.currencyCode,
        });
      } catch (error) {
        this.logger.error(`Weekly email failed for user ${user.id}, account ${account.id}: ${error}`);
      }
    }
  }

  // Runs on the 1st of every month at 09:00 UTC
  @Cron('0 9 1 * *')
  async processMonthlyDigests() {
    const users = await this.prisma.user.findMany({
      where: {
        monthlyDigestEnabled: true,
        isActive: true,
      },
      include: {
        subscription: true,
        accountMembers: {
          include: {
            account: { select: { id: true, name: true, currencyCode: true, encryptionTier: true } },
          },
        },
      },
    });

    this.logger.log(`Processing monthly digests for ${users.length} users`);

    const TIER_HIERARCHY: Record<string, number> = { free: 0, pro: 1, business: 2 };

    for (const user of users) {
      const tier = user.subscription?.tier || 'free';
      if (TIER_HIERARCHY[tier] < TIER_HIERARCHY['pro']) continue;

      for (const membership of user.accountMembers) {
        const account = membership.account;
        if (account.encryptionTier >= 2) continue;

        try {
          const now = new Date();
          const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
          const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
          const twoMonthsAgoEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0);

          // Fetch exchange rates for currency conversion
          let rates: Record<string, number> = {};
          try {
            const rateData = await this.exchangeRateService.getRates(account.currencyCode);
            rates = rateData.rates;
          } catch (e) {
            this.logger.warn(`Could not fetch exchange rates for ${account.currencyCode}, sums may be inaccurate`);
          }

          // Group by currency and convert to account base currency
          const [expGroups, incGroups, prevExpGroups, prevIncGroups] = await Promise.all([
            this.prisma.expense.groupBy({
              by: ['currencyCode'],
              where: { accountId: account.id, isDeleted: false, date: { gte: prevMonth, lte: prevMonthEnd } },
              _sum: { amount: true },
            }),
            this.prisma.income.groupBy({
              by: ['currencyCode'],
              where: { accountId: account.id, isDeleted: false, date: { gte: prevMonth, lte: prevMonthEnd } },
              _sum: { amount: true },
            }),
            this.prisma.expense.groupBy({
              by: ['currencyCode'],
              where: { accountId: account.id, isDeleted: false, date: { gte: twoMonthsAgo, lte: twoMonthsAgoEnd } },
              _sum: { amount: true },
            }),
            this.prisma.income.groupBy({
              by: ['currencyCode'],
              where: { accountId: account.id, isDeleted: false, date: { gte: twoMonthsAgo, lte: twoMonthsAgoEnd } },
              _sum: { amount: true },
            }),
          ]);

          const totalExpenses = await this.sumWithConversion(expGroups, account.currencyCode, rates);
          const totalIncome = await this.sumWithConversion(incGroups, account.currencyCode, rates);
          const prevTotalExpenses = await this.sumWithConversion(prevExpGroups, account.currencyCode, rates);
          const prevTotalIncome = await this.sumWithConversion(prevIncGroups, account.currencyCode, rates);

          const savingsRate = totalIncome > 0 ? Math.max(-100, ((totalIncome - totalExpenses) / totalIncome) * 100) : (totalIncome === 0 && totalExpenses > 0 ? -100 : 0);
          const incomeChange = prevTotalIncome > 0 ? ((totalIncome - prevTotalIncome) / prevTotalIncome) * 100 : 0;
          const expenseChange = prevTotalExpenses > 0 ? ((totalExpenses - prevTotalExpenses) / prevTotalExpenses) * 100 : 0;

          // Top categories — group by category AND currency, then convert and re-aggregate
          const categoryBreakdownRaw = await this.prisma.expense.groupBy({
            by: ['categoryId', 'currencyCode'],
            where: { accountId: account.id, isDeleted: false, date: { gte: prevMonth, lte: prevMonthEnd } },
            _sum: { amount: true },
          });

          const categoryTotals = new Map<string, number>();
          for (const row of categoryBreakdownRaw) {
            const catId = row.categoryId || '';
            const raw = Number(row._sum.amount || 0);
            const converted = this.convertAmount(raw, row.currencyCode, account.currencyCode, rates);
            categoryTotals.set(catId, (categoryTotals.get(catId) || 0) + converted);
          }

          const sortedCategories = [...categoryTotals.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

          const categoryIds = sortedCategories.map(([id]) => id).filter(Boolean);
          const categoryNames = await this.prisma.category.findMany({
            where: { id: { in: categoryIds } },
            select: { id: true, name: true },
          });
          const nameMap = new Map(categoryNames.map(c => [c.id, c.name]));

          const topCategories = sortedCategories.map(([catId, amount]) => ({
            name: nameMap.get(catId) || 'Uncategorized',
            amount,
            percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
          }));

          const monthLabel = prevMonth.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });

          await this.mailService.sendMonthlyDigest({
            to: user.email,
            userName: user.name,
            accountName: account.name,
            periodLabel: monthLabel,
            totalIncome,
            totalExpenses,
            savingsRate: Math.round(savingsRate * 10) / 10,
            topCategories,
            incomeChange: Math.round(incomeChange * 10) / 10,
            expenseChange: Math.round(expenseChange * 10) / 10,
            currencyCode: account.currencyCode,
          });
        } catch (error) {
          this.logger.error(`Monthly digest failed for user ${user.id}, account ${account.id}: ${error}`);
        }
      }
    }
  }

  // Cleanup expired reports — runs daily at 03:00 UTC
  @Cron('0 3 * * *')
  async cleanupExpiredReports() {
    const result = await this.prisma.generatedReport.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (result.count > 0) {
      this.logger.log(`Cleaned up ${result.count} expired reports`);
    }
  }
}
