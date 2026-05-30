import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AdminNotificationService {
  private readonly logger = new Logger(AdminNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async sendPush(adminId: string, userIds: string[], title: string, body: string) {
    let successCount = 0;
    let failCount = 0;
    for (const uid of userIds) {
      const ok = await this.notificationsService.sendToUser(uid, title, body);
      if (ok) successCount++;
      else failCount++;
    }
    await this.prisma.notificationLog.create({
      data: {
        adminId,
        type: 'push',
        recipientCount: userIds.length,
        successCount,
        failCount,
        body,
        recipientIds: userIds as unknown as Prisma.InputJsonValue,
      },
    });
    return { recipientCount: userIds.length, successCount, failCount };
  }

  async sendEmail(adminId: string, userIds: string[], subject: string, html: string) {
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true },
    });
    let successCount = 0;
    let failCount = 0;
    for (const u of users) {
      const ok = await this.mailService.sendMail(u.email, subject, html);
      if (ok) successCount++;
      else failCount++;
    }
    await this.prisma.notificationLog.create({
      data: {
        adminId,
        type: 'email',
        recipientCount: users.length,
        successCount,
        failCount,
        subject,
        body: html,
        recipientIds: userIds as unknown as Prisma.InputJsonValue,
      },
    });
    return { recipientCount: users.length, successCount, failCount };
  }

  async sendBroadcast(
    adminId: string,
    type: 'push' | 'email',
    params: {
      title?: string;
      subject?: string;
      body: string;
      html?: string;
      filters?: { tier?: string; isActive?: boolean; language?: string };
    },
  ) {
    const where: Record<string, unknown> = {};
    if (params.filters?.isActive !== undefined) where.isActive = params.filters.isActive;
    if (params.filters?.language) where.language = params.filters.language;
    if (params.filters?.tier) where.subscription = { tier: params.filters.tier };

    const users = await this.prisma.user.findMany({
      where,
      select: { id: true, email: true },
    });

    const userIds = users.map((u) => u.id);
    let result;
    if (type === 'push') {
      result = await this.sendPush(adminId, userIds, params.title ?? '', params.body);
    } else {
      result = await this.sendEmail(adminId, userIds, params.subject ?? '', params.html ?? params.body);
    }

    const latestLog = await this.prisma.notificationLog.findFirst({
      where: { adminId },
      orderBy: { createdAt: 'desc' },
    });
    if (latestLog) {
      await this.prisma.notificationLog.update({
        where: { id: latestLog.id },
        data: { type: 'broadcast', filters: (params.filters ?? Prisma.JsonNull) as Prisma.InputJsonValue },
      });
    }

    return result;
  }

  async getNotificationHistory(page: number, limit: number, userId?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.NotificationLogWhereInput = userId
      ? { recipientIds: { array_contains: [userId] } }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.notificationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { admin: { select: { name: true, email: true } } },
      }),
      this.prisma.notificationLog.count({ where }),
    ]);

    const allRecipientIds = [
      ...new Set(data.flatMap((d) => (d.recipientIds as string[] | null) ?? [])),
    ];
    const recipientMap = new Map<string, { name: string; email: string }>();
    if (allRecipientIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: allRecipientIds } },
        select: { id: true, name: true, email: true },
      });
      for (const u of users) recipientMap.set(u.id, { name: u.name, email: u.email });
    }

    return {
      data: data.map((d) => {
        const ids = (d.recipientIds as string[] | null) ?? [];
        return {
          ...d,
          adminName: d.admin?.name ?? 'Deleted admin',
          adminEmail: d.admin?.email ?? '',
          admin: undefined,
          recipients: ids.map((id) => {
            const u = recipientMap.get(id);
            return u ? { id, name: u.name, email: u.email } : { id, name: 'Deleted user', email: '' };
          }),
        };
      }),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async scheduleNotification(
    adminId: string,
    params: {
      type: 'push' | 'email';
      title?: string;
      subject?: string;
      body: string;
      scheduledAt: string;
      userIds?: string[];
      filters?: Record<string, unknown>;
    },
  ) {
    return this.prisma.scheduledNotification.create({
      data: {
        adminId,
        type: params.type,
        title: params.title,
        subject: params.subject,
        body: params.body,
        scheduledAt: new Date(params.scheduledAt),
        userIds: params.userIds ? (params.userIds as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        filters: params.filters ? (params.filters as Prisma.InputJsonObject) : Prisma.JsonNull,
      },
    });
  }

  async getScheduledNotifications() {
    return this.prisma.scheduledNotification.findMany({
      where: { status: 'pending' },
      orderBy: { scheduledAt: 'asc' },
      include: { admin: { select: { name: true } } },
    });
  }

  async cancelScheduledNotification(id: string) {
    return this.prisma.scheduledNotification.update({
      where: { id },
      data: { status: 'cancelled' },
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async executeScheduledNotifications() {
    const now = new Date();
    const pending = await this.prisma.scheduledNotification.findMany({
      where: { status: 'pending', scheduledAt: { lte: now } },
    });

    if (pending.length === 0) return;
    this.logger.log(`Executing ${pending.length} scheduled notification(s)`);

    for (const sn of pending) {
      try {
        await this.prisma.scheduledNotification.update({
          where: { id: sn.id },
          data: { status: 'sent', executedAt: now },
        });

        const userIds = Array.isArray(sn.userIds) ? (sn.userIds as string[]) : undefined;
        const filters = sn.filters as { tier?: string; isActive?: boolean; language?: string } | null;
        const adminId = sn.adminId ?? 'system';

        if (sn.type === 'push') {
          if (userIds && userIds.length > 0) {
            await this.sendPush(adminId, userIds, sn.title ?? '', sn.body);
          } else if (filters) {
            await this.sendBroadcast(adminId, 'push', { title: sn.title ?? '', body: sn.body, filters });
          }
        } else if (sn.type === 'email') {
          if (userIds && userIds.length > 0) {
            await this.sendEmail(adminId, userIds, sn.subject ?? '', sn.body);
          } else if (filters) {
            await this.sendBroadcast(adminId, 'email', { subject: sn.subject ?? '', body: sn.body, filters });
          }
        }

        this.logger.log(`Scheduled notification ${sn.id} executed successfully`);
      } catch (err) {
        this.logger.error(`Failed to execute scheduled notification ${sn.id}`, err);
        await this.prisma.scheduledNotification.update({
          where: { id: sn.id },
          data: { status: 'failed' },
        });
      }
    }
  }
}
