import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { AdminDashboardResponse, AdminUserUsageItem } from '@budget/shared-types';
import { normalizeMrr, toMrrRows } from './admin-metrics.util';
import {
  PAID_SUB_WHERE,
  COMPED_SUB_WHERE,
  isStripePaidSub,
  isComplimentarySub,
} from './admin-comped.util';

// Everything these two legacy endpoints need to price a subscription. Kept next to the
// queries so a future field (e.g. a discount) is added once, not per call site.
const MRR_SUB_SELECT = {
  tier: true,
  status: true,
  stripeSubscriptionId: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  user: { select: { currencyCode: true } },
} as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

export const ESTIMATED_COST_PER_REQUEST: Record<string, number> = {
  voice: 0.02,
  chat: 0.011,
  parse: 0.008,
  categorization: 0.005,
  ocr: 0.012,
};
export const DEFAULT_COST_PER_REQUEST = 0.01;

export function estimateCost(featureType: string, count: number): number {
  const perRequest = ESTIMATED_COST_PER_REQUEST[featureType] ?? DEFAULT_COST_PER_REQUEST;
  return Math.round(perRequest * count * 10000) / 10000;
}

@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(startDate?: string, endDate?: string): Promise<AdminDashboardResponse> {
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
      where: { createdAt: { gte: periodStart, lte: periodEnd } },
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
      item.byFeature.push({ featureType: g.featureType, costUnits: cost, estimatedCostUsd: featureCostUsd, count });
    }

    for (const item of perUser.values()) {
      item.estimatedCostUsd = Math.round(item.estimatedCostUsd * 10000) / 10000;
    }

    const users = [...perUser.values()].sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd);

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
      paidSubs,
      lastMonthPaidSubs,
      compedSubs,
    ] = await Promise.all([
      this.prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
      this.prisma.user.count({ where: { lastSyncAt: { gte: todayStart } } }),
      this.prisma.user.count({ where: { lastSyncAt: { gte: weekAgo } } }),
      this.prisma.subscription.findMany({ where: PAID_SUB_WHERE, select: MRR_SUB_SELECT }),
      this.prisma.subscription.findMany({
        where: { ...PAID_SUB_WHERE, createdAt: { lte: lastMonthEnd } },
        select: MRR_SUB_SELECT,
      }),
      this.prisma.subscription.findMany({ where: COMPED_SUB_WHERE, select: MRR_SUB_SELECT }),
    ]);

    // Rows, not counts: a yearly plan is not a month of revenue, and an admin-granted
    // tier is not revenue at all. Both are why this used to over-report.
    const mrr = round2(normalizeMrr(toMrrRows(paidSubs, isStripePaidSub)).mrrUsd);
    const lastMrr = round2(normalizeMrr(toMrrRows(lastMonthPaidSubs, isStripePaidSub)).mrrUsd);
    const mrrChange = lastMrr > 0 ? ((mrr - lastMrr) / lastMrr) * 100 : 0;
    const compedMrr = normalizeMrr(toMrrRows(compedSubs, isComplimentarySub));

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
      compedUsers: compedMrr.payingUsers,
      compedMrrUsd: round2(compedMrr.mrrUsd),
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
      where: { createdAt: { gte: periodStart, lte: periodEnd } },
      select: { featureType: true, costUnits: true, createdAt: true },
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
      this.prisma.subscription.groupBy({ by: ['tier', 'status'], _count: true }),
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
      if (g.status === 'trialing') dist.trialing += g._count;
      if (g.status === 'active' || g.status === 'trialing') totalActive += g._count;
    }

    const [paidSubs, compedSubs] = await Promise.all([
      this.prisma.subscription.findMany({ where: PAID_SUB_WHERE, select: MRR_SUB_SELECT }),
      this.prisma.subscription.findMany({ where: COMPED_SUB_WHERE, select: MRR_SUB_SELECT }),
    ]);
    const mrr = round2(normalizeMrr(toMrrRows(paidSubs, isStripePaidSub)).mrrUsd);
    const compedMrr = normalizeMrr(toMrrRows(compedSubs, isComplimentarySub));

    const canceledThisMonth = await this.prisma.subscription.count({
      where: {
        status: 'canceled',
        updatedAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
    });

    const churnRate = totalActive > 0 ? (canceledThisMonth / totalActive) * 100 : 0;
    // Conversion means somebody paid — a comped tier is not a conversion.
    const paidTotal = paidSubs.length;
    const conversionRate = dist.free > 0 ? (paidTotal / (dist.free + paidTotal)) * 100 : 0;

    return {
      distribution: dist,
      mrr,
      payingUsers: paidTotal,
      compedUsers: compedMrr.payingUsers,
      compedMrrUsd: round2(compedMrr.mrrUsd),
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
}
