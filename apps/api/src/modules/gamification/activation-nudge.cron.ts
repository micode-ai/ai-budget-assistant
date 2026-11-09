import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as ni18n from '../notifications/notification-i18n';
import { paginateById } from '../../common/utils/paginate';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
import { MailService } from '../mail/mail.service';
import { buildUnsubscribeUrl } from '../mail/email-unsubscribe';

const BATCH_SIZE = 500;
const HOUR_MS = 60 * 60 * 1000;

/**
 * The signup-age window a user must be in to get the nudge: [24 h, 48 h) old.
 *
 * Exactly as wide as the cron's period (daily), so every user falls into it on
 * exactly one run — that IS the send-once guarantee, with no ledger table. A run
 * that is missed (a deploy restarting the API across 17:00) skips that day's
 * signups rather than sending twice, the safe direction for an unsolicited push.
 */
export function activationNudgeWindow(now: Date): { gte: Date; lt: Date } {
  return {
    gte: new Date(now.getTime() - 48 * HOUR_MS),
    lt: new Date(now.getTime() - 24 * HOUR_MS),
  };
}

/** The e-mail's window: [72 h, 96 h) old — the same one-period rule as the push (ABA-738). */
export function activationEmailWindow(now: Date): { gte: Date; lt: Date } {
  return {
    gte: new Date(now.getTime() - 96 * HOUR_MS),
    lt: new Date(now.getTime() - 72 * HOUR_MS),
  };
}

/** Where the e-mail's button leads: the web app, tagged so the visit is attributed. */
export const ACTIVATION_EMAIL_CTA_URL = 'https://app.ai-budget.pl/?src=email&loc=activation';

/**
 * ABA-737. One push to a user who signed up a day ago and has logged nothing.
 *
 * 65 of 123 users never logged a transaction and only 8 of them were seen again
 * after their first day, while nothing ever contacted them: `TrackingGapReminderCron`
 * deliberately skips users with no streak. This is a separate, single message rather
 * than a loosening of that cron — its "no streak, no nudge" rule is about not
 * nagging repeatedly, and this sends once, ever, at the one moment it can help.
 *
 * Gated by `notifyTrackingGap` (the user's "remind me to log" switch) inside
 * `NotificationsService.sendToUser`, and filtered on it here too so the query
 * stays small. A tap opens the receipt scanner on app versions that know the type
 * (`handleNotificationResponse`), and just the app on older ones.
 */
@Injectable()
export class ActivationNudgeCron {
  private readonly logger = new Logger(ActivationNudgeCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {}

  /** 17:00 UTC — early evening in Poland and Ukraine, when the day's spending is fresh. */
  @Cron('0 17 * * *')
  async handleActivationNudges(now: Date = new Date()): Promise<number> {
    const window = activationNudgeWindow(now);
    let sent = 0;

    const pages = paginateById(
      (cursor) =>
        this.prisma.user.findMany({
          where: {
            createdAt: window,
            isActive: true,
            notifyTrackingGap: true,
            pushToken: { not: null },
            expenses: { none: { isDeleted: false } },
            incomes: { none: { isDeleted: false } },
          },
          select: { id: true },
          take: BATCH_SIZE,
          orderBy: { id: 'asc' },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
      BATCH_SIZE,
    );

    for await (const users of pages) {
      for (const user of users) {
        this.notificationsService
          .sendToUser(
            user.id,
            (lang) => ni18n.activationNudgeTitle(lang),
            (lang) => ni18n.activationNudgeBody(lang),
            {},
            'activation_nudge',
          )
          .catch(logFireAndForget(this.logger, 'ActivationNudgeCron.sendToUser'));
        sent++;
      }
    }

    this.logger.log(`Activation nudge cron complete. Queued ${sent} notifications.`);
    return sent;
  }

  /**
   * ABA-738. The follow-up e-mail, two days after the push, to a user who has still logged
   * nothing — 33 of the 65 never-activated users had no push token, so the push alone never
   * reached half of them. Sent once (one-period window), only while `onboardingEmailsEnabled`
   * is on; the body and the `List-Unsubscribe` header both carry a signed unsubscribe link.
   * Sends are awaited one by one: the volume is a handful a day, and an SMTP failure is
   * logged per user rather than stopping the run.
   */
  @Cron('30 17 * * *')
  async handleActivationEmails(now: Date = new Date()): Promise<number> {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) {
      this.logger.warn('JWT_SECRET unset — activation e-mails skipped (no way to sign the unsubscribe link)');
      return 0;
    }
    const baseUrl = process.env.APP_PUBLIC_URL || 'https://api.ai-budget.pl';
    const window = activationEmailWindow(now);
    let sent = 0;

    const pages = paginateById(
      (cursor) =>
        this.prisma.user.findMany({
          where: {
            createdAt: window,
            isActive: true,
            onboardingEmailsEnabled: true,
            expenses: { none: { isDeleted: false } },
            incomes: { none: { isDeleted: false } },
          },
          select: { id: true, email: true, name: true, language: true },
          take: BATCH_SIZE,
          orderBy: { id: 'asc' },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
      BATCH_SIZE,
    );

    for await (const users of pages) {
      for (const user of users) {
        try {
          const ok = await this.mailService.sendActivationEmail({
            to: user.email,
            lang: user.language,
            name: user.name,
            ctaUrl: ACTIVATION_EMAIL_CTA_URL,
            unsubscribeUrl: buildUnsubscribeUrl(baseUrl, user.id, secret),
          });
          if (ok) sent++;
        } catch (e) {
          this.logger.warn(`ActivationNudgeCron.sendActivationEmail failed for ${user.id}: ${e}`);
        }
      }
    }

    this.logger.log(`Activation e-mail cron complete. Sent ${sent} e-mails.`);
    return sent;
  }
}
