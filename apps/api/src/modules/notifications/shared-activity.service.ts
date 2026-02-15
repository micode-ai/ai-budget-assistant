import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from './notifications.service';

@Injectable()
export class SharedActivityService {
  private readonly logger = new Logger(SharedActivityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async notifyExpenseCreated(
    accountId: string,
    creatorUserId: string,
    amount: number,
    currencyCode: string,
    description?: string,
  ): Promise<void> {
    try {
      const account = await this.prisma.account.findUnique({
        where: { id: accountId },
        select: { name: true, type: true },
      });

      if (!account || account.type !== 'shared') return;

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

      const title = `New expense in "${account.name}"`;
      const expenseDesc = description || 'an expense';
      const body = `${creator?.name || 'Someone'} added ${currencyCode} ${amount.toFixed(2)} for ${expenseDesc}`;

      await this.notifications.sendToUsers(
        members.map((m: { userId: string }) => m.userId),
        title,
        body,
        { type: 'shared_expense', accountId, creatorUserId },
        'shared_expense',
      );
    } catch (error) {
      this.logger.error(`Shared activity notification failed: ${error}`);
    }
  }
}
