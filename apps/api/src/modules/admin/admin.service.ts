import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AdminDashboardResponse, AdminUserUsageItem } from '@budget/shared-types';

type SubscriptionTier = 'free' | 'pro' | 'business';

/**
 * Estimated average cost per request by feature type (USD).
 */
const ESTIMATED_COST_PER_REQUEST: Record<string, number> = {
  voice: 0.02,
  chat: 0.011,
  parse: 0.008,
  categorization: 0.005,
  ocr: 0.012,
};

const DEFAULT_COST_PER_REQUEST = 0.01;

const PRO_MONTHLY_USD = 999; // cents
const BUSINESS_MONTHLY_USD = 1999;

function estimateCost(featureType: string, count: number): number {
  const perRequest = ESTIMATED_COST_PER_REQUEST[featureType] ?? DEFAULT_COST_PER_REQUEST;
  return Math.round(perRequest * count * 10000) / 10000;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ─── Audit Log ───────────────────────────────────

  async logAction(
    adminId: string,
    action: string,
    targetType: string,
    targetId: string | null,
    details: Record<string, unknown> | null,
    ipAddress: string | null,
  ) {
    await this.prisma.adminAuditLog.create({
      data: {
        adminId, action, targetType, targetId, ipAddress,
        details: details ? (details as Prisma.InputJsonObject) : Prisma.JsonNull,
      },
    });
  }

  // ─── Dashboard ───────────────────────────────────

  async getDashboard(
    startDate?: string,
    endDate?: string,
  ): Promise<AdminDashboardResponse> {
    const now = new Date();
    const periodStart = startDate
      ? new Date(startDate)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = endDate
      ? new Date(endDate)
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const [totalUsers, totalAccounts, totalExpenses] = await Promise.all([
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.account.count(),
      this.prisma.expense.count({ where: { isDeleted: false } }),
    ]);

    const tierGroups = await this.prisma.subscription.groupBy({
      by: ['tier'],
      _count: true,
    });
    const trialingCount = await this.prisma.subscription.count({
      where: { status: 'trialing' },
    });

    const subscriptions = { free: 0, pro: 0, business: 0, trialing: trialingCount };
    for (const g of tierGroups) {
      const tier = g.tier as string;
      if (tier === 'free' || tier === 'pro' || tier === 'business') {
        subscriptions[tier] = g._count;
      }
    }

    const usageGroups = await this.prisma.usageLog.groupBy({
      by: ['userId', 'featureType'],
      where: {
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      _sum: { costUnits: true },
      _count: { id: true },
    });

    const userIds = [...new Set(usageGroups.map((g: typeof usageGroups[number]) => g.userId))];
    const usersMap = new Map<string, { name: string; email: string }>();
    const subsMap = new Map<string, string>();

    if (userIds.length > 0) {
      const [users, subs] = await Promise.all([
        this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        }),
        this.prisma.subscription.findMany({
          where: { userId: { in: userIds } },
          select: { userId: true, tier: true },
        }),
      ]);
      for (const u of users) usersMap.set(u.id, { name: u.name, email: u.email });
      for (const s of subs) subsMap.set(s.userId, s.tier);
    }

    const perUser = new Map<string, AdminUserUsageItem>();
    let totalCostUnits = 0;
    let totalEstimatedCostUsd = 0;
    let totalRequests = 0;

    for (const g of usageGroups) {
      const cost = g._sum.costUnits ?? 0;
      const count = g._count.id;
      const featureCostUsd = estimateCost(g.featureType, count);

      totalCostUnits += cost;
      totalEstimatedCostUsd += featureCostUsd;
      totalRequests += count;

      let item = perUser.get(g.userId);
      if (!item) {
        const info = usersMap.get(g.userId);
        item = {
          userId: g.userId,
          userName: info?.name ?? 'Unknown',
          userEmail: info?.email ?? '',
          tier: (subsMap.get(g.userId) ?? 'free') as AdminUserUsageItem['tier'],
          totalCostUnits: 0,
          estimatedCostUsd: 0,
          requestCount: 0,
          byFeature: [],
        };
        perUser.set(g.userId, item);
      }
      item.totalCostUnits += cost;
      item.estimatedCostUsd += featureCostUsd;
      item.requestCount += count;
      item.byFeature.push({
        featureType: g.featureType,
        costUnits: cost,
        estimatedCostUsd: featureCostUsd,
        count,
      });
    }

    for (const item of perUser.values()) {
      item.estimatedCostUsd = Math.round(item.estimatedCostUsd * 10000) / 10000;
    }

    const users = [...perUser.values()].sort(
      (a, b) => b.estimatedCostUsd - a.estimatedCostUsd,
    );

    return {
      totalUsers,
      totalAccounts,
      totalExpenses,
      subscriptions,
      aiUsage: {
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        totalCostUnits,
        totalEstimatedCostUsd: Math.round(totalEstimatedCostUsd * 10000) / 10000,
        totalRequests,
        users,
      },
    };
  }

  // ─── Users ───────────────────────────────────────

  async getUsers(params: {
    page: number;
    limit: number;
    search?: string;
    tier?: string;
    isActive?: string;
    sortBy?: string;
    order?: 'asc' | 'desc';
  }) {
    const { page, limit, search, tier, isActive, sortBy = 'createdAt', order = 'desc' } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }
    if (tier) {
      where.subscription = { tier };
    }

    const orderBy: Record<string, string> = {};
    const allowedSortFields = ['name', 'email', 'createdAt', 'lastSyncAt'];
    if (allowedSortFields.includes(sortBy)) {
      orderBy[sortBy] = order;
    } else {
      orderBy.createdAt = order;
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          name: true,
          isActive: true,
          currencyCode: true,
          language: true,
          createdAt: true,
          lastSyncAt: true,
          subscription: {
            select: {
              tier: true,
              status: true,
              aiRequestsUsed: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUserDetail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        currencyCode: true,
        timezone: true,
        language: true,
        createdAt: true,
        lastSyncAt: true,
        pushToken: true,
        weeklyEmailEnabled: true,
        monthlyDigestEnabled: true,
        aiResponseMode: true,
        aiModel: true,
        subscription: true,
        accountMembers: {
          select: {
            role: true,
            account: {
              select: {
                id: true,
                name: true,
                type: true,
                currencyCode: true,
              },
            },
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    // AI usage for current month
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const usageGroups = await this.prisma.usageLog.groupBy({
      by: ['featureType'],
      where: {
        userId,
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      _sum: { costUnits: true },
      _count: { id: true },
    });

    let totalCostUnits = 0;
    let totalEstimatedCostUsd = 0;
    let totalRequests = 0;
    const byFeature: AdminUserUsageItem['byFeature'] = [];

    for (const g of usageGroups) {
      const cost = g._sum.costUnits ?? 0;
      const count = g._count.id;
      const featureCostUsd = estimateCost(g.featureType, count);
      totalCostUnits += cost;
      totalEstimatedCostUsd += featureCostUsd;
      totalRequests += count;
      byFeature.push({
        featureType: g.featureType,
        costUnits: cost,
        estimatedCostUsd: featureCostUsd,
        count,
      });
    }

    const recentExpenses = await this.prisma.expense.findMany({
      where: { userId, isDeleted: false },
      orderBy: { date: 'desc' },
      take: 20,
      select: {
        id: true,
        amount: true,
        currencyCode: true,
        description: true,
        date: true,
        source: true,
        category: { select: { name: true } },
      },
    });

    const recentIncomes = await this.prisma.income.findMany({
      where: { userId, isDeleted: false },
      orderBy: { date: 'desc' },
      take: 20,
      select: {
        id: true,
        amount: true,
        currencyCode: true,
        description: true,
        date: true,
      },
    });

    return {
      ...user,
      accounts: user.accountMembers.map((m) => ({
        id: m.account.id,
        name: m.account.name,
        type: m.account.type,
        role: m.role,
        currencyCode: m.account.currencyCode,
      })),
      accountMembers: undefined,
      aiUsage: {
        userId,
        userName: user.name,
        userEmail: user.email,
        tier: (user.subscription?.tier ?? 'free') as AdminUserUsageItem['tier'],
        totalCostUnits,
        estimatedCostUsd: Math.round(totalEstimatedCostUsd * 10000) / 10000,
        requestCount: totalRequests,
        byFeature,
      },
      recentExpenses: recentExpenses.map((e) => ({
        id: e.id,
        amount: Number(e.amount),
        currencyCode: e.currencyCode,
        description: e.description,
        categoryName: e.category?.name ?? null,
        date: e.date.toISOString(),
        source: e.source,
      })),
      recentIncomes: recentIncomes.map((i) => ({
        id: i.id,
        amount: Number(i.amount),
        currencyCode: i.currencyCode,
        description: i.description,
        date: i.date.toISOString(),
      })),
    };
  }

  async updateUser(userId: string, data: { isActive?: boolean; language?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, name: true, email: true, isActive: true, language: true },
    });
  }

  async changeSubscriptionTier(userId: string, tier: SubscriptionTier) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (!user.subscription) {
      return this.prisma.subscription.create({
        data: {
          userId,
          tier,
          status: 'active',
          aiRequestsUsed: 0,
        },
      });
    }

    return this.prisma.subscription.update({
      where: { id: user.subscription.id },
      data: { tier, status: 'active' },
    });
  }

  async setCustomAiLimit(userId: string, customAiLimit: number | null) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.subscription) throw new NotFoundException('User has no subscription');

    return this.prisma.subscription.update({
      where: { id: user.subscription.id },
      data: { customAiLimit },
    });
  }

  async deactivateUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
      select: { id: true, name: true, email: true, isActive: true },
    });
  }

  async deleteUser(userId: string, adminId: string, ipAddress: string | null = null) {
    if (userId === adminId) {
      throw new BadRequestException('Cannot delete your own account');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });
    if (!user) throw new NotFoundException('User not found');

    await this.logAction(adminId, 'user.delete', 'user', userId, {
      userName: user.name,
      userEmail: user.email,
    }, ipAddress);

    await this.prisma.user.delete({ where: { id: userId } });

    return { id: user.id, email: user.email, name: user.name, deleted: true };
  }

  // ─── Communications ──────────────────────────────

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
    if (params.filters?.isActive !== undefined) {
      where.isActive = params.filters.isActive;
    }
    if (params.filters?.language) {
      where.language = params.filters.language;
    }
    if (params.filters?.tier) {
      where.subscription = { tier: params.filters.tier };
    }

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

    // Update the notification log type to broadcast
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
        include: {
          admin: { select: { name: true, email: true } },
        },
      }),
      this.prisma.notificationLog.count({ where }),
    ]);

    // Resolve recipient IDs to names/emails
    const allRecipientIds = [
      ...new Set(data.flatMap((d) => (d.recipientIds as string[] | null) ?? [])),
    ];
    const recipientMap = new Map<string, { name: string; email: string }>();
    if (allRecipientIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: allRecipientIds } },
        select: { id: true, name: true, email: true },
      });
      for (const u of users) {
        recipientMap.set(u.id, { name: u.name, email: u.email });
      }
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
      include: {
        admin: { select: { name: true } },
      },
    });
  }

  async cancelScheduledNotification(id: string) {
    return this.prisma.scheduledNotification.update({
      where: { id },
      data: { status: 'cancelled' },
    });
  }

  // ─── Analytics ───────────────────────────────────

  async getAnalyticsOverview() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(todayStart);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const [
      newUsersToday,
      newUsersThisWeek,
      newUsersThisMonth,
      activeUsersToday,
      activeUsersThisWeek,
      proCount,
      businessCount,
      lastMonthProCount,
      lastMonthBusinessCount,
    ] = await Promise.all([
      this.prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
      this.prisma.user.count({ where: { lastSyncAt: { gte: todayStart } } }),
      this.prisma.user.count({ where: { lastSyncAt: { gte: weekAgo } } }),
      this.prisma.subscription.count({ where: { tier: 'pro', status: 'active' } }),
      this.prisma.subscription.count({ where: { tier: 'business', status: 'active' } }),
      this.prisma.subscription.count({ where: { tier: 'pro', status: 'active', createdAt: { lte: lastMonthEnd } } }),
      this.prisma.subscription.count({ where: { tier: 'business', status: 'active', createdAt: { lte: lastMonthEnd } } }),
    ]);

    const mrr = (proCount * PRO_MONTHLY_USD + businessCount * BUSINESS_MONTHLY_USD) / 100;
    const lastMrr = (lastMonthProCount * PRO_MONTHLY_USD + lastMonthBusinessCount * BUSINESS_MONTHLY_USD) / 100;
    const mrrChange = lastMrr > 0 ? ((mrr - lastMrr) / lastMrr) * 100 : 0;

    // Daily registrations (last 30 days)
    const thirtyDaysAgo = new Date(todayStart);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyUsers = await this.prisma.user.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
    });

    const dailyMap = new Map<string, number>();
    for (const u of dailyUsers) {
      const day = u.createdAt.toISOString().split('T')[0];
      dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
    }

    const dailyRegistrations: Array<{ date: string; count: number }> = [];
    for (let d = new Date(thirtyDaysAgo); d <= todayStart; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().split('T')[0];
      dailyRegistrations.push({ date: key, count: dailyMap.get(key) ?? 0 });
    }

    return {
      newUsersToday,
      newUsersThisWeek,
      newUsersThisMonth,
      activeUsersToday,
      activeUsersThisWeek,
      mrr,
      mrrChange: Math.round(mrrChange * 10) / 10,
      totalRevenue: mrr,
      dailyRegistrations,
    };
  }

  async getAiUsageTrends(startDate?: string, endDate?: string) {
    const now = new Date();
    const periodStart = startDate
      ? new Date(startDate)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = endDate
      ? new Date(endDate)
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const logs = await this.prisma.usageLog.findMany({
      where: {
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      select: {
        featureType: true,
        costUnits: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const dailyMap = new Map<string, {
      totalCost: number;
      totalRequests: number;
      byFeature: Record<string, { cost: number; count: number }>;
    }>();

    for (const log of logs) {
      const day = log.createdAt.toISOString().split('T')[0];
      let entry = dailyMap.get(day);
      if (!entry) {
        entry = { totalCost: 0, totalRequests: 0, byFeature: {} };
        dailyMap.set(day, entry);
      }
      const cost = estimateCost(log.featureType, 1);
      entry.totalCost += cost;
      entry.totalRequests += 1;
      if (!entry.byFeature[log.featureType]) {
        entry.byFeature[log.featureType] = { cost: 0, count: 0 };
      }
      entry.byFeature[log.featureType].cost += cost;
      entry.byFeature[log.featureType].count += 1;
    }

    return Array.from(dailyMap.entries()).map(([date, data]) => ({
      date,
      totalCost: Math.round(data.totalCost * 10000) / 10000,
      totalRequests: data.totalRequests,
      byFeature: data.byFeature,
    }));
  }

  async getSubscriptionStats() {
    const [distribution, recentChanges] = await Promise.all([
      this.prisma.subscription.groupBy({
        by: ['tier', 'status'],
        _count: true,
      }),
      this.prisma.adminAuditLog.findMany({
        where: {
          action: 'subscription.change_tier',
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { admin: { select: { name: true } } },
      }),
    ]);

    const dist = { free: 0, pro: 0, business: 0, trialing: 0 };
    let totalActive = 0;

    for (const g of distribution) {
      const tier = g.tier as string;
      if (tier === 'free' || tier === 'pro' || tier === 'business') {
        dist[tier] += g._count;
      }
      if (g.status === 'trialing') {
        dist.trialing += g._count;
      }
      if (g.status === 'active' || g.status === 'trialing') {
        totalActive += g._count;
      }
    }

    const proActive = await this.prisma.subscription.count({
      where: { tier: 'pro', status: 'active' },
    });
    const businessActive = await this.prisma.subscription.count({
      where: { tier: 'business', status: 'active' },
    });
    const mrr = (proActive * PRO_MONTHLY_USD + businessActive * BUSINESS_MONTHLY_USD) / 100;

    const canceledThisMonth = await this.prisma.subscription.count({
      where: {
        status: 'canceled',
        updatedAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
    });

    const churnRate = totalActive > 0 ? (canceledThisMonth / totalActive) * 100 : 0;
    const paidTotal = proActive + businessActive;
    const conversionRate = dist.free > 0 ? (paidTotal / (dist.free + paidTotal)) * 100 : 0;

    return {
      distribution: dist,
      mrr,
      churnRate: Math.round(churnRate * 10) / 10,
      conversionRate: Math.round(conversionRate * 10) / 10,
      recentChanges: recentChanges.map((c) => ({
        id: c.id,
        adminName: c.admin?.name ?? 'Deleted admin',
        action: c.action,
        targetId: c.targetId,
        details: c.details,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }

  // ─── Audit Log ───────────────────────────────────

  async getAuditLog(params: {
    page: number;
    limit: number;
    action?: string;
    adminId?: string;
    targetType?: string;
  }) {
    const { page, limit, action, adminId, targetType } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (action) where.action = { contains: action };
    if (adminId) where.adminId = adminId;
    if (targetType) where.targetType = targetType;

    const [data, total] = await Promise.all([
      this.prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          admin: { select: { name: true, email: true } },
        },
      }),
      this.prisma.adminAuditLog.count({ where }),
    ]);

    return {
      data: data.map((d) => ({
        id: d.id,
        adminId: d.adminId,
        adminName: d.admin?.name ?? 'Deleted admin',
        adminEmail: d.admin?.email ?? '',
        action: d.action,
        targetType: d.targetType,
        targetId: d.targetId,
        details: d.details,
        ipAddress: d.ipAddress,
        createdAt: d.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─── System Health ───────────────────────────────

  async getSystemHealth() {
    let dbStatus: 'ok' | 'error' = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'error';
    }

    return {
      api: 'ok' as const,
      database: dbStatus,
      redis: 'ok' as const,
      uptime: process.uptime(),
      memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    };
  }

  // ─── Scheduled Notifications Cron ────────────────

  @Cron(CronExpression.EVERY_MINUTE)
  async executeScheduledNotifications() {
    const now = new Date();

    const pending = await this.prisma.scheduledNotification.findMany({
      where: {
        status: 'pending',
        scheduledAt: { lte: now },
      },
    });

    if (pending.length === 0) return;

    this.logger.log(`Executing ${pending.length} scheduled notification(s)`);

    for (const sn of pending) {
      try {
        // Mark as running to prevent re-execution
        await this.prisma.scheduledNotification.update({
          where: { id: sn.id },
          data: { status: 'sent', executedAt: now },
        });

        const userIds = Array.isArray(sn.userIds)
          ? (sn.userIds as string[])
          : undefined;
        const filters = sn.filters as {
          tier?: string;
          isActive?: boolean;
          language?: string;
        } | null;

        const adminId = sn.adminId ?? 'system';

        if (sn.type === 'push') {
          if (userIds && userIds.length > 0) {
            await this.sendPush(adminId, userIds, sn.title ?? '', sn.body);
          } else if (filters) {
            await this.sendBroadcast(adminId, 'push', {
              title: sn.title ?? '',
              body: sn.body,
              filters,
            });
          }
        } else if (sn.type === 'email') {
          if (userIds && userIds.length > 0) {
            await this.sendEmail(adminId, userIds, sn.subject ?? '', sn.body);
          } else if (filters) {
            await this.sendBroadcast(adminId, 'email', {
              subject: sn.subject ?? '',
              body: sn.body,
              filters,
            });
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
