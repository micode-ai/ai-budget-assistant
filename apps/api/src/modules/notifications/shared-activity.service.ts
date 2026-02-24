import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from './notifications.service';
import * as ni18n from './notification-i18n';

@Injectable()
export class SharedActivityService {
  private readonly logger = new Logger(SharedActivityService.name);
  private readonly sentNotifications = new Map<string, number>();
  private readonly DEDUP_TTL_MS = 10 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async notifyExpenseCreated(
    accountId: string,
    creatorUserId: string,
    expenseId: string,
    amount: number,
    currencyCode: string,
    description?: string,
  ): Promise<void> {
    try {
      const lastSent = this.sentNotifications.get(expenseId);
      if (lastSent && Date.now() - lastSent < this.DEDUP_TTL_MS) {
        this.logger.debug(`Skipping duplicate shared notification for expense ${expenseId}`);
        return;
      }
      this.sentNotifications.set(expenseId, Date.now());
      if (this.sentNotifications.size > 10000) {
        const cutoff = Date.now() - this.DEDUP_TTL_MS;
        for (const [id, ts] of this.sentNotifications) {
          if (ts < cutoff) this.sentNotifications.delete(id);
        }
      }
      const account = await this.prisma.account.findUnique({
        where: { id: accountId },
        select: { name: true, type: true },
      });

      if (!account || account.type === 'personal') return;

      const members = await this.prisma.accountMember.findMany({
        where: {
          accountId,
          userId: { not: creatorUserId },
        },
        select: { userId: true },
      });

      if (members.length === 0) return;

      const creator = await this.prisma.user.findUnique({
        where: { id: creatorUserId },
        select: { name: true },
      });

      const expenseDesc = description || 'an expense';
      const creatorName = creator?.name || 'Someone';
      const amountStr = amount.toFixed(2);
      const params = { accountName: account.name, creatorName, currencyCode, amount: amountStr, description: expenseDesc };

      await this.notifications.sendToUsers(
        members.map((m: { userId: string }) => m.userId),
        (lang) => ni18n.sharedExpenseTitle(lang, params),
        (lang) => ni18n.sharedExpenseBody(lang, params),
        { type: 'shared_expense', accountId, creatorUserId },
        'shared_expense',
      );
    } catch (error) {
      this.logger.error(`Shared activity notification failed: ${error}`);
    }
  }
}
