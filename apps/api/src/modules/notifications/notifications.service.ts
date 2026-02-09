import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { NotificationType } from '@budget/shared-types';

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
  private readonly BATCH_SIZE = 100;

  constructor(private readonly prisma: PrismaService) {}

  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
    notificationType?: NotificationType,
  ): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        pushToken: true,
        notifyBudgetAlerts: true,
        notifySharedActivity: true,
      },
    });

    if (!user?.pushToken) return false;

    if (notificationType === 'budget_alert' && !user.notifyBudgetAlerts) return false;
    if (notificationType === 'shared_expense' && !user.notifySharedActivity) return false;

    if (!this.isValidExpoPushToken(user.pushToken)) {
      this.logger.warn(`Invalid push token for user ${userId}, clearing`);
      await this.clearPushToken(userId);
      return false;
    }

    const tickets = await this.sendPushNotifications([{
      to: user.pushToken,
      title,
      body,
      data: { ...data, type: notificationType },
      sound: 'default',
    }]);

    await this.handleTicketErrors(tickets, [{ userId, token: user.pushToken }]);

    return tickets.length > 0 && tickets[0].status === 'ok';
  }

  async sendToUsers(
    userIds: string[],
    title: string,
    body: string,
    data?: Record<string, unknown>,
    notificationType?: NotificationType,
  ): Promise<void> {
    if (userIds.length === 0) return;

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        pushToken: true,
        notifyBudgetAlerts: true,
        notifySharedActivity: true,
      },
    });

    const eligible = users.filter((u) => {
      if (!u.pushToken || !this.isValidExpoPushToken(u.pushToken)) return false;
      if (notificationType === 'budget_alert' && !u.notifyBudgetAlerts) return false;
      if (notificationType === 'shared_expense' && !u.notifySharedActivity) return false;
      return true;
    });

    if (eligible.length === 0) return;

    const messages: ExpoPushMessage[] = eligible.map((u) => ({
      to: u.pushToken!,
      title,
      body,
      data: { ...data, type: notificationType },
      sound: 'default',
    }));

    for (let i = 0; i < messages.length; i += this.BATCH_SIZE) {
      const batch = messages.slice(i, i + this.BATCH_SIZE);
      const tokenMap = eligible.slice(i, i + this.BATCH_SIZE)
        .map((u) => ({ userId: u.id, token: u.pushToken! }));

      const tickets = await this.sendPushNotifications(batch);
      await this.handleTicketErrors(tickets, tokenMap);
    }
  }

  private async sendPushNotifications(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    try {
      const response = await fetch(this.EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(messages),
      });

      if (!response.ok) {
        const text = await response.text();
        this.logger.error(`Expo Push API error (${response.status}): ${text}`);
        return [];
      }

      const result = await response.json();
      return result.data || [];
    } catch (error) {
      this.logger.error(`Failed to send push notifications: ${error}`);
      return [];
    }
  }

  private async handleTicketErrors(
    tickets: ExpoPushTicket[],
    tokenMap: Array<{ userId: string; token: string }>,
  ): Promise<void> {
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      if (ticket.status === 'error') {
        const errorType = ticket.details?.error;
        this.logger.warn(`Push ticket error: ${errorType} - ${ticket.message}`);

        if (errorType === 'DeviceNotRegistered' || errorType === 'InvalidCredentials') {
          await this.clearPushToken(tokenMap[i].userId);
        }
      }
    }
  }

  private isValidExpoPushToken(token: string): boolean {
    return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
  }

  private async clearPushToken(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { pushToken: null },
    });
    this.logger.log(`Cleared push token for user ${userId}`);
  }
}
