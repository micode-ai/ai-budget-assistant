import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import * as ni18n from '@budget/shared-types/notification-strings';

@Injectable()
export class TrialReminderCron {
  private readonly logger = new Logger(TrialReminderCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Runs daily at 10:00 UTC.
   * Finds subscriptions whose trial ends tomorrow and sends a reminder.
   */
  @Cron('0 10 * * *')
  async handleTrialReminder() {
    this.logger.log('Checking for trials ending tomorrow...');

    const now = new Date();
    const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const tomorrowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);

    const expiringTrials = await this.prisma.subscription.findMany({
      where: {
        status: 'trialing',
        trialEnd: {
          gte: tomorrowStart,
          lt: tomorrowEnd,
        },
      },
      include: {
        user: { select: { id: true, name: true, email: true, language: true } },
      },
    });

    this.logger.log(`Found ${expiringTrials.length} trials expiring tomorrow`);

    for (const sub of expiringTrials) {
      const { user } = sub;
      if (!user) continue;

      const tierUpper = sub.tier.toUpperCase();
      const lang = user.language || 'en';

      // Push notification
      this.notificationsService.sendToUser(
        user.id,
        (l: string) => ni18n.trialReminderTitle(l),
        (l: string) => ni18n.trialReminderBody(l, { tier: tierUpper }),
        { type: 'trial_reminder' },
      ).catch(() => {});

      // Email
      const subject = ni18n.trialReminderEmailSubject(lang);
      const html = ni18n.trialReminderEmailHtml(lang, user.name, { tier: tierUpper });
      this.mailService.sendMail(user.email, subject, html).catch(() => {});
    }
  }
}
