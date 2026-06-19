import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import * as ni18n from '../notifications/notification-i18n';

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
   * Sends T-3 reminder to trials ending in 3 days and T-1 reminder to trials ending tomorrow.
   */
  @Cron('0 10 * * *')
  async handleTrialReminder() {
    const now = new Date();

    // T-1: trials ending tomorrow
    const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const tomorrowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);

    // T-3: trials ending in 3 days
    const in3Start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3);
    const in3End = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 4);

    const [expiringTomorrow, expiringIn3] = await Promise.all([
      this.prisma.subscription.findMany({
        where: {
          status: 'trialing',
          trialEnd: { gte: tomorrowStart, lt: tomorrowEnd },
        },
        include: {
          user: { select: { id: true, name: true, email: true, language: true } },
        },
      }),
      this.prisma.subscription.findMany({
        where: {
          status: 'trialing',
          trialEnd: { gte: in3Start, lt: in3End },
        },
        include: {
          user: { select: { id: true, name: true, email: true, language: true } },
        },
      }),
    ]);

    this.logger.log(
      `Found ${expiringTomorrow.length} trials expiring tomorrow, ${expiringIn3.length} expiring in 3 days`,
    );

    // Send T-1 reminders
    for (const sub of expiringTomorrow) {
      const { user } = sub;
      if (!user) continue;

      const tierUpper = sub.tier.toUpperCase();
      const lang = user.language || 'en';

      this.notificationsService.sendToUser(
        user.id,
        (l: string) => ni18n.trialReminderTitle(l),
        (l: string) => ni18n.trialReminderBody(l, { tier: tierUpper }),
        { type: 'trial_reminder' },
      ).catch(() => {});

      const subject = ni18n.trialReminderEmailSubject(lang);
      const html = ni18n.trialReminderEmailHtml(lang, user.name, { tier: tierUpper });
      this.mailService.sendMail(user.email, subject, html).catch(() => {});
    }

    // Send T-3 reminders
    for (const sub of expiringIn3) {
      const { user } = sub;
      if (!user) continue;

      const tierUpper = sub.tier.toUpperCase();
      const lang = user.language || 'en';

      this.notificationsService.sendToUser(
        user.id,
        (l: string) => ni18n.trialReminderIn3Title(l),
        (l: string) => ni18n.trialReminderIn3Body(l, { tier: tierUpper }),
        { type: 'trial_reminder' },
      ).catch(() => {});

      const subject = ni18n.trialReminderIn3EmailSubject(lang);
      const html = ni18n.trialReminderIn3EmailHtml(lang, user.name, { tier: tierUpper });
      this.mailService.sendMail(user.email, subject, html).catch(() => {});
    }
  }
}
