import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as ni18n from '../notifications/notification-i18n';
import { paginateById } from '../../common/utils/paginate';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
import { daysUntil } from '../../common/utils/card-cycle';
import { CardCyclesService, resolveDue, ymd } from './card-cycles.service';

const BATCH_SIZE = 500;

@Injectable()
export class CardCycleReminderCron {
  private readonly logger = new Logger(CardCycleReminderCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly cycles: CardCyclesService,
  ) {}

  /** Daily 09:00 UTC: a push 3 days before the due date with the closed statement amount. */
  @Cron('0 9 * * *')
  async handleReminders() {
    const today = new Date();
    const pages = paginateById(
      (cursor) =>
        this.prisma.cardCycleSetting.findMany({
          include: { account: { select: { name: true, ownerId: true, isActive: true } } },
          take: BATCH_SIZE,
          orderBy: { id: 'asc' },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
      BATCH_SIZE,
    );
    for await (const settings of pages) {
      for (const s of settings) {
        try {
          await this.remindOne(s, today);
        } catch (err) {
          this.logger.warn(`card reminder failed for ${s.id}: ${(err as Error).message}`);
        }
      }
    }
  }

  async remindOne(
    s: {
      id: string;
      accountId: string;
      currencyCode: string;
      statementDay: number;
      dueDay: number;
      lastRemindedDueDate: Date | null;
      account: { name: string; ownerId: string; isActive: boolean };
    },
    today: Date,
  ): Promise<boolean> {
    if (!s.account.isActive) return false;
    const { due, closed, closedIsPayable } = resolveDue(today, s.statementDay, s.dueDay);
    if (!closedIsPayable || daysUntil(today, due) !== 3) return false;
    if (s.lastRemindedDueDate && ymd(s.lastRemindedDueDate) === ymd(due)) return false;

    const amount = await this.cycles.spentBetween(s.accountId, s.currencyCode, closed.start, closed.end);
    // Mark first: a lost push must not repeat daily, there is no other surface for it.
    await this.prisma.cardCycleSetting.update({ where: { id: s.id }, data: { lastRemindedDueDate: due } });
    if (amount <= 0) return false;

    const params = {
      accountName: s.account.name,
      amount: amount.toFixed(2),
      currencyCode: s.currencyCode,
      dueDate: `${String(due.getDate()).padStart(2, '0')}.${String(due.getMonth() + 1).padStart(2, '0')}`,
    };
    this.notifications
      .sendToUser(
        s.account.ownerId,
        (lang) => ni18n.cardPaymentDueTitle(lang),
        (lang) => ni18n.cardPaymentDueBody(lang, params),
        { accountId: s.accountId },
        'debt_reminder',
      )
      .catch(logFireAndForget(this.logger, 'CardCycleReminderCron.sendToUser'));
    return true;
  }
}
