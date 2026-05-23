import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { StreakService } from './streak.service';
import { ACHIEVEMENT_DEFINITIONS, getLevel } from './achievement-definitions';

@Injectable()
export class GamificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly streakService: StreakService,
  ) {}

  async getDefinitions() {
    return ACHIEVEMENT_DEFINITIONS;
  }

  async getProfile(accountId: string, userId: string) {
    const [achievements, streak] = await Promise.all([
      this.prisma.userAchievement.findMany({
        where: { accountId, userId },
      }),
      this.streakService.getStreak(accountId, userId),
    ]);

    type Achievement = typeof achievements[number];
    const totalXp = achievements
      .filter((a: Achievement) => a.isCompleted)
      .reduce((sum: number, a: Achievement) => {
        const def = ACHIEVEMENT_DEFINITIONS.find((d) => d.id === a.achievementId);
        return sum + (def?.xpReward || 0);
      }, 0);

    const { level, progress } = getLevel(totalXp);

    const recentBadges = achievements
      .filter((a: Achievement) => a.isCompleted && a.unlockedAt)
      .sort((a: Achievement, b: Achievement) => (b.unlockedAt!.getTime() - a.unlockedAt!.getTime()))
      .slice(0, 5);

    return {
      totalXp,
      level,
      levelProgress: progress,
      currentStreak: streak?.currentStreak || 0,
      longestStreak: streak?.longestStreak || 0,
      lastActivityDate: streak?.lastActivityDate?.toISOString(),
      achievements: achievements.map((a: Achievement) => ({
        achievementId: a.achievementId,
        isCompleted: a.isCompleted,
        progress: a.progress,
        unlockedAt: a.unlockedAt?.toISOString(),
      })),
      recentBadges: recentBadges.map((a: Achievement) => ({
        achievementId: a.achievementId,
        unlockedAt: a.unlockedAt!.toISOString(),
      })),
    };
  }

  async checkAchievements(accountId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });

    // Update streak
    const streakResult = await this.streakService.updateStreak(
      accountId,
      userId,
      user?.timezone || 'UTC',
    );

    // Gather data for achievement evaluation
    const [expenseCount, incomeCount, budgetCount, streak] = await Promise.all([
      this.prisma.expense.count({ where: { accountId, userId, isDeleted: false } }),
      this.prisma.income.count({ where: { accountId, userId, isDeleted: false } }),
      this.prisma.budget.count({ where: { accountId, userId, isDeleted: false } }),
      this.streakService.getStreak(accountId, userId),
    ]);

    // Referral achievements (user-global, stored on defaultAccountId)
    const referralCount = await this.prisma.referral.count({
      where: { referrerUserId: userId, status: 'qualified' },
    });

    const referralUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { defaultAccountId: true },
    });
    const referralAccountId = referralUser?.defaultAccountId || accountId;

    // Check net positive month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const [expenseSum, incomeSum] = await Promise.all([
      this.prisma.expense.aggregate({
        where: { accountId, userId, isDeleted: false, date: { gte: startOfMonth, lte: endOfMonth } },
        _sum: { amount: true },
      }),
      this.prisma.income.aggregate({
        where: { accountId, userId, isDeleted: false, date: { gte: startOfMonth, lte: endOfMonth } },
        _sum: { amount: true },
      }),
    ]);

    const monthlyExpenses = Number(expenseSum._sum.amount || 0);
    const monthlyIncome = Number(incomeSum._sum.amount || 0);

    // Check budget compliance (month without exceeding)
    let budgetCompliant = false;
    const activeBudgets = await this.prisma.budget.findMany({
      where: { accountId, userId, isDeleted: false, isActive: true },
      include: { categoryAllocations: { where: { isDeleted: false }, select: { categoryId: true } } },
    });

    if (activeBudgets.length > 0) {
      const budgetChecks = await Promise.all(
        activeBudgets.map(async (budget: typeof activeBudgets[number]) => {
          const categoryIds = budget.categoryAllocations.map((a) => a.categoryId);
          const spent = await this.prisma.expense.aggregate({
            where: {
              accountId,
              isDeleted: false,
              currencyCode: budget.currencyCode,
              date: { gte: budget.startDate, lte: budget.endDate || now },
              ...(categoryIds.length > 0 ? { categoryId: { in: categoryIds } } : {}),
            },
            _sum: { amount: true },
          });
          return Number(spent._sum.amount || 0) <= Number(budget.amount);
        }),
      );
      budgetCompliant = budgetChecks.every((ok) => ok);
    }

    // Evaluate each achievement
    const newlyUnlocked: Array<{ achievementId: string; unlockedAt: string }> = [];
    const updatedProgress: Array<{ achievementId: string; progress: number }> = [];

    for (const def of ACHIEVEMENT_DEFINITIONS) {
      let progress = 0;
      let completed = false;

      switch (def.id) {
        case 'first_expense':
        case 'expenses_10':
        case 'expenses_50':
        case 'expenses_100':
        case 'expenses_500':
          progress = Math.min(100, Math.round((expenseCount / (def.threshold || 1)) * 100));
          completed = expenseCount >= (def.threshold || 1);
          break;

        case 'first_budget':
          progress = budgetCount >= 1 ? 100 : 0;
          completed = budgetCount >= 1;
          break;

        case 'budget_month_no_exceed':
          if (budgetCompliant && activeBudgets.length > 0) {
            // Check if we're past mid-month
            const dayOfMonth = now.getDate();
            progress = Math.min(100, Math.round((dayOfMonth / 30) * 100));
            completed = dayOfMonth >= 28 && budgetCompliant;
          }
          break;

        case 'budget_3months_no_exceed': {
          // Simplified: check if budget_month_no_exceed was already completed
          const monthAchievement = await this.prisma.userAchievement.findUnique({
            where: {
              userId_accountId_achievementId: {
                userId, accountId, achievementId: 'budget_month_no_exceed',
              },
            },
          });
          if (monthAchievement?.isCompleted) {
            progress = 33; // At least 1 month done
          }
          break;
        }

        case 'streak_3':
        case 'streak_7':
        case 'streak_30':
        case 'streak_100': {
          const currentStreak = streak?.currentStreak || 0;
          progress = Math.min(100, Math.round((currentStreak / (def.threshold || 1)) * 100));
          completed = currentStreak >= (def.threshold || 1);
          break;
        }

        case 'first_income':
          progress = incomeCount >= 1 ? 100 : 0;
          completed = incomeCount >= 1;
          break;

        case 'net_positive_month':
          if (monthlyIncome > 0 || monthlyExpenses > 0) {
            const ratio = monthlyIncome > 0 ? (monthlyIncome / Math.max(monthlyExpenses, 1)) * 100 : 0;
            progress = Math.min(100, Math.round(ratio));
            completed = monthlyIncome > monthlyExpenses && monthlyIncome > 0;
          }
          break;

        case 'referrals_5':
        case 'referrals_10_ambassador': {
          progress = Math.min(100, Math.round((referralCount / (def.threshold || 1)) * 100));
          completed = referralCount >= (def.threshold || 1);
          break;
        }
      }

      // Upsert achievement record
      const achievementAccountId = def.category === 'social' ? referralAccountId : accountId;
      const existing = await this.prisma.userAchievement.findUnique({
        where: {
          userId_accountId_achievementId: { userId, accountId: achievementAccountId, achievementId: def.id },
        },
      });

      if (existing) {
        if (!existing.isCompleted && completed) {
          await this.prisma.userAchievement.update({
            where: { id: existing.id },
            data: { progress: 100, isCompleted: true, unlockedAt: now },
          });
          newlyUnlocked.push({ achievementId: def.id, unlockedAt: now.toISOString() });
        } else if (progress > existing.progress) {
          await this.prisma.userAchievement.update({
            where: { id: existing.id },
            data: { progress },
          });
          updatedProgress.push({ achievementId: def.id, progress });
        }
      } else {
        await this.prisma.userAchievement.upsert({
          where: {
            userId_accountId_achievementId: { userId, accountId: achievementAccountId, achievementId: def.id },
          },
          update: {
            progress: completed ? 100 : progress,
            isCompleted: completed,
            unlockedAt: completed ? now : null,
          },
          create: {
            userId,
            accountId: achievementAccountId,
            achievementId: def.id,
            progress: completed ? 100 : progress,
            isCompleted: completed,
            unlockedAt: completed ? now : null,
          },
        });
        if (completed) {
          newlyUnlocked.push({ achievementId: def.id, unlockedAt: now.toISOString() });
        } else {
          updatedProgress.push({ achievementId: def.id, progress });
        }
      }
    }

    return {
      newlyUnlocked,
      updatedProgress,
      streakUpdated: streakResult.updated,
      currentStreak: streakResult.currentStreak,
    };
  }
}
