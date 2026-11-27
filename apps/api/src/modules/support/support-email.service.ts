import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { buildSupportUnsubscribeUrl } from '../mail/email-unsubscribe';

/** Where the e-mail button leads: the web app's support screen, tagged so the visit is attributed. */
export const SUPPORT_EMAIL_CTA_URL = 'https://app.ai-budget.pl/support?src=email&loc=support_reply';

/**
 * E-mail fallback for developer replies the user has not read (contact-developer addendum
 * 2026-11-28). One e-mail per unread batch: the claim sets `lastEmailedAt` with a conditional
 * `updateMany` BEFORE sending, so a concurrent cron run and an immediate send cannot both win,
 * and `markReadByUser` clears it to open the next batch.
 */
@Injectable()
export class SupportEmailService {
  private readonly logger = new Logger(SupportEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * E-mails the thread's unread developer replies if the thread is eligible. `olderThan` is the
   * cron's 12 h cutoff on `firstUnreadReplyAt`; omit it for the immediate no-push path.
   * Resolves true only when an e-mail went out. A send that fails or throws releases the claim.
   */
  async sendUnreadReplyEmail(threadId: string, olderThan?: Date, now: Date = new Date()): Promise<boolean> {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) {
      this.logger.warn('JWT_SECRET unset - support reply e-mail skipped (cannot sign the unsubscribe link)');
      return false;
    }

    const claim = await this.prisma.supportThread.updateMany({
      where: {
        id: threadId,
        userUnreadCount: { gt: 0 },
        lastEmailedAt: null,
        emailEnabled: true,
        muted: false,
        user: { isActive: true, email: { not: '' } },
        ...(olderThan ? { firstUnreadReplyAt: { lte: olderThan } } : {}),
      },
      data: { lastEmailedAt: now },
    });
    if (claim.count === 0) return false;

    try {
      const thread = await this.prisma.supportThread.findUnique({
        where: { id: threadId },
        select: {
          id: true,
          userId: true,
          userUnreadCount: true,
          user: { select: { id: true, email: true, name: true, language: true } },
        },
      });
      if (!thread) throw new Error(`thread ${threadId} vanished after claim`);

      const rows = await this.prisma.supportMessage.findMany({
        where: { threadId, author: 'developer' },
        orderBy: { createdAt: 'desc' },
        take: thread.userUnreadCount,
        select: { body: true, translatedBody: true, createdAt: true },
      });
      const replies = rows
        .reverse()
        .map((m) => (m.translatedBody ? { text: m.translatedBody, original: m.body } : { text: m.body, original: null }));

      const baseUrl = process.env.APP_PUBLIC_URL || 'https://api.ai-budget.pl';
      const ok = await this.mail.sendSupportReplyEmail({
        to: thread.user.email,
        lang: thread.user.language,
        name: thread.user.name,
        replies,
        ctaUrl: SUPPORT_EMAIL_CTA_URL,
        unsubscribeUrl: buildSupportUnsubscribeUrl(baseUrl, thread.userId, secret),
      });
      if (!ok) await this.release(threadId, now);
      return ok;
    } catch (err) {
      await this.release(threadId, now);
      throw err;
    }
  }

  /**
   * Gives the claim back so the next run retries; matches on our own stamp only. Trade-off: if
   * the SMTP server accepted the message but the call then errored (timeout after accept), the
   * retry sends a duplicate. We accept that over the alternative - keeping the claim on any error
   * silently loses the e-mail for the whole batch.
   */
  private async release(threadId: string, claimedAt: Date): Promise<void> {
    await this.prisma.supportThread
      .updateMany({ where: { id: threadId, lastEmailedAt: claimedAt }, data: { lastEmailedAt: null } })
      .catch((e: unknown) => this.logger.warn(`SupportEmailService.release failed for ${threadId}: ${e}`));
  }
}
