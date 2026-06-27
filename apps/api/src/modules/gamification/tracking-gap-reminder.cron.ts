import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as ni18n from '../notifications/notification-i18n';

@Injectable()
export class TrackingGapReminderCron {
  private readonly logger = new Logger(TrackingGapReminderCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Runs daily at 10:00 UTC.
   * Sends a push notification to users who haven't logged any expense or income
   * in 3+ days (fires on day 3, 6, 9... — diffDays % 3 === 0).
   * Skips users with no UserStreak record (new users who have never logged anything).
   */
  @Cron('0 10 * * *')
  async handleTrackingGapReminders() {
    this.logger.log('Running tracking gap reminder cron...');

    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    // Find the most recent lastActivityDate per user across all their streak records.
    // We only care about streaks of type 'daily_tracking'.
    // We query users who have notifyTrackingGap enabled and a pushToken,
    // then let the cron compute diffDays in JS (avoids raw SQL).
    const users = await this.prisma.user.findMany({
      where: {
        notifyTrackingGap: true,
        pushToken: { not: null },
        isActive: true,
      },
      select: {
        id: true,
        streaks: {
          where: { streakType: 'daily_tracking' },
          select: { lastActivityDate: true },
          orderBy: { lastActivityDate: 'desc' },
        },
      },
    });

    let sent = 0;

    for (const user of users) {
      if (user.streaks.length === 0) continue; // new user, never logged

      // Most recent activity across all accounts
      const latestActivityDate = user.streaks[0].lastActivityDate;
      const lastActive = new Date(
        Date.UTC(
          latestActivityDate.getFullYear(),
          latestActivityDate.getMonth(),
          latestActivityDate.getDate(),
        ),
      );

      const diffMs = todayUtc.getTime() - lastActive.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays < 3) continue; // active recently
      if (diffDays % 3 !== 0) continue; // not a send day

      this.notificationsService
        .sendToUser(
          user.id,
          (lang) => ni18n.trackingGapTitle(lang),
          (lang) => ni18n.trackingGapBody(lang),
          {},
          'tracking_gap_reminder',
        )
        .catch(() => {});

      sent++;
    }

    this.logger.log(`Tracking gap reminder cron complete. Sent ${sent} notifications.`);
  }
}
