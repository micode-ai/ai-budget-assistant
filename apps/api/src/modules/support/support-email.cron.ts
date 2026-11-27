import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { paginateById } from '../../common/utils/paginate';
import { SupportEmailService } from './support-email.service';

const BATCH_SIZE = 200;
const HOUR_MS = 60 * 60 * 1000;
/** A reply a user with push has left unread this long gets the e-mail. */
export const SUPPORT_EMAIL_DELAY_MS = 12 * HOUR_MS;

/**
 * Hourly: e-mails developer replies still unread 12 h after they arrived. Users without a push
 * token were already e-mailed on reply (their `lastEmailedAt` is set), unless that send failed,
 * in which case this run retries them. Two instances running at once are harmless: the claim
 * inside `SupportEmailService` is a conditional update, so only one of them sends.
 */
@Injectable()
export class SupportEmailCron {
  private readonly logger = new Logger(SupportEmailCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: SupportEmailService,
  ) {}

  @Cron('15 * * * *')
  async handleUnreadReplyEmails(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - SUPPORT_EMAIL_DELAY_MS);
    let sent = 0;

    const pages = paginateById(
      (cursor) =>
        this.prisma.supportThread.findMany({
          where: {
            userUnreadCount: { gt: 0 },
            lastEmailedAt: null,
            emailEnabled: true,
            muted: false,
            firstUnreadReplyAt: { lte: cutoff },
            // `id > cursor`, not cursor + skip: a claimed row leaves the filter (lastEmailedAt), and a
            // cursor on a row that no longer matches would skip the next eligible thread.
            ...(cursor ? { id: { gt: cursor } } : {}),
            user: { isActive: true, email: { not: '' } },
          },
          select: { id: true },
          take: BATCH_SIZE,
          orderBy: { id: 'asc' },
        }),
      BATCH_SIZE,
    );

    for await (const threads of pages) {
      for (const thread of threads) {
        try {
          if (await this.email.sendUnreadReplyEmail(thread.id, cutoff, now)) sent++;
        } catch (e) {
          this.logger.warn(`SupportEmailCron.sendUnreadReplyEmail failed for ${thread.id}: ${e}`);
        }
      }
    }

    this.logger.log(`Support reply e-mail cron complete. Sent ${sent} e-mails.`);
    return sent;
  }
}
