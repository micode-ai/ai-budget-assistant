import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class StreakService {
  constructor(private readonly prisma: PrismaService) {}

  async getStreak(accountId: string, userId: string) {
    return this.prisma.userStreak.findUnique({
      where: {
        userId_accountId_streakType: {
          userId,
          accountId,
          streakType: 'daily_tracking',
        },
      },
    });
  }

  async updateStreak(accountId: string, userId: string, userTimezone: string): Promise<{
    currentStreak: number;
    longestStreak: number;
    updated: boolean;
  }> {
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: userTimezone || 'UTC' });
    const today = new Date(todayStr);

    const yesterdayDate = new Date(today);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);

    const existing = await this.prisma.userStreak.findUnique({
      where: {
        userId_accountId_streakType: {
          userId,
          accountId,
          streakType: 'daily_tracking',
        },
      },
    });

    if (!existing) {
      const created = await this.prisma.userStreak.create({
        data: {
          userId,
          accountId,
          streakType: 'daily_tracking',
          currentStreak: 1,
          longestStreak: 1,
          lastActivityDate: today,
          streakStartDate: today,
        },
      });
      return { currentStreak: created.currentStreak, longestStreak: created.longestStreak, updated: true };
    }

    const lastDateStr = existing.lastActivityDate.toISOString().split('T')[0];

    // Already tracked today
    if (lastDateStr === todayStr) {
      return { currentStreak: existing.currentStreak, longestStreak: existing.longestStreak, updated: false };
    }

    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

    let newStreak: number;
    let newStart: Date;

    if (lastDateStr === yesterdayStr) {
      // Consecutive day - extend streak
      newStreak = existing.currentStreak + 1;
      newStart = existing.streakStartDate;
    } else {
      // Streak broken - start fresh
      newStreak = 1;
      newStart = today;
    }

    const newLongest = Math.max(existing.longestStreak, newStreak);

    const updated = await this.prisma.userStreak.update({
      where: { id: existing.id },
      data: {
        currentStreak: newStreak,
        longestStreak: newLongest,
        lastActivityDate: today,
        streakStartDate: newStart,
      },
    });

    return { currentStreak: updated.currentStreak, longestStreak: updated.longestStreak, updated: true };
  }
}
