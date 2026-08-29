import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import * as ni18n from '../notifications/notification-i18n';
import { paginateById } from '../../common/utils/paginate';

const BATCH_SIZE = 500;

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

    // Streamed in id-ordered batches rather than one findMany each (see
    // tech-debt daily-crons-full-table-scan).
    const tomorrowPages = paginateById(
      (cursor) =>
        this.prisma.subscription.findMany({
          where: {
            status: 'trialing',
            trialEnd: { gte: tomorrowStart, lt: tomorrowEnd },
          },
          include: {
            user: { select: { id: true, name: true, email: true, language: true } },
          },
          take: BATCH_SIZE,
          orderBy: { id: 'asc' },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
      BATCH_SIZE,
    );

    let tomorrowCount = 0;
    for await (const expiringTomorrow of tomorrowPages) {
      tomorrowCount += expiringTomorrow.length;

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
    }

    const in3Pages = paginateById(
      (cursor) =>
        this.prisma.subscription.findMany({
          where: {
            status: 'trialing',
            trialEnd: { gte: in3Start, lt: in3End },
          },
          include: {
            user: { select: { id: true, name: true, email: true, language: true } },
          },
          take: BATCH_SIZE,
          orderBy: { id: 'asc' },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
      BATCH_SIZE,
    );

    let in3Count = 0;
    for await (const expiringIn3 of in3Pages) {
      in3Count += expiringIn3.length;

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

    this.logger.log(
      `Found ${tomorrowCount} trials expiring tomorrow, ${in3Count} expiring in 3 days`,
    );
  }
}
