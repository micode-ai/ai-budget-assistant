import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { estimateCost } from './admin-analytics.service';
import type { AdminUserUsageItem } from '@budget/shared-types';

type SubscriptionTier = 'free' | 'pro' | 'business';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
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
        include: { admin: { select: { name: true, email: true } } },
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
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (tier) where.subscription = { tier };

    const orderBy: Record<string, string> = {};
    const allowedSortFields = ['name', 'email', 'createdAt', 'lastSyncAt'];
    orderBy[allowedSortFields.includes(sortBy) ? sortBy : 'createdAt'] = order;

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
          subscription: { select: { tier: true, status: true, aiRequestsUsed: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data: users, total, page, limit, totalPages: Math.ceil(total / limit) };
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
            account: { select: { id: true, name: true, type: true, currencyCode: true } },
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const usageGroups = await this.prisma.usageLog.groupBy({
      by: ['featureType'],
      where: { userId, createdAt: { gte: periodStart, lte: periodEnd } },
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
      byFeature.push({ featureType: g.featureType, costUnits: cost, estimatedCostUsd: featureCostUsd, count });
    }

    const [recentExpenses, recentIncomes] = await Promise.all([
      this.prisma.expense.findMany({
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
      }),
      this.prisma.income.findMany({
        where: { userId, isDeleted: false },
        orderBy: { date: 'desc' },
        take: 20,
        select: { id: true, amount: true, currencyCode: true, description: true, date: true },
      }),
    ]);

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
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { subscription: true } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.subscription) {
      return this.prisma.subscription.create({
        data: { userId, tier, status: 'active', aiRequestsUsed: 0 },
      });
    }
    return this.prisma.subscription.update({
      where: { id: user.subscription.id },
      data: { tier, status: 'active' },
    });
  }

  async setCustomAiLimit(userId: string, customAiLimit: number | null) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { subscription: true } });
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
    if (userId === adminId) throw new BadRequestException('Cannot delete your own account');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });
    if (!user) throw new NotFoundException('User not found');
    await this.logAction(adminId, 'user.delete', 'user', userId, { userName: user.name, userEmail: user.email }, ipAddress);
    await this.prisma.user.delete({ where: { id: userId } });
    return { id: user.id, email: user.email, name: user.name, deleted: true };
  }

  // ─── System Health ───────────────────────────────

  async getSystemHealth() {
    let dbStatus: 'ok' | 'error' = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'error';
    }

    let redisStatus: 'ok' | 'error' = 'ok';
    try {
      await this.cacheService.ping();
    } catch {
      redisStatus = 'error';
    }

    return {
      api: 'ok' as const,
      database: dbStatus,
      redis: redisStatus,
      uptime: process.uptime(),
      memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    };
  }
}
