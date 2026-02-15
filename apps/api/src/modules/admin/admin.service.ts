import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { AdminDashboardResponse, AdminUserUsageItem } from '@budget/shared-types';

/**
 * Estimated average cost per request by feature type (USD).
 * Based on OpenAI pricing as of Feb 2025:
 * - whisper-1: ~$0.02/min audio (avg ~1 min)
 * - gpt-4-turbo: ~$0.01/1K input + $0.03/1K output
 * - gpt-4o vision: ~$0.00765/1K vision + $0.009/1K output
 */
const ESTIMATED_COST_PER_REQUEST: Record<string, number> = {
  voice: 0.02,           // Whisper-1, avg 1 min audio
  chat: 0.011,           // GPT-4 Turbo, ~500 in + ~200 out tokens
  parse: 0.008,          // GPT-4 Turbo, ~400 in + ~100 out tokens
  categorization: 0.005, // GPT-4 Turbo, ~300 in + ~50 out tokens
  ocr: 0.012,            // GPT-4o Vision, ~1000 vision + ~500 out tokens
};

const DEFAULT_COST_PER_REQUEST = 0.01;

function estimateCost(featureType: string, count: number): number {
  const perRequest = ESTIMATED_COST_PER_REQUEST[featureType] ?? DEFAULT_COST_PER_REQUEST;
  return Math.round(perRequest * count * 10000) / 10000; // 4 decimal precision
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

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

    // System stats
    const [totalUsers, totalAccounts, totalExpenses] = await Promise.all([
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.account.count(),
      this.prisma.expense.count({ where: { isDeleted: false } }),
    ]);

    // Subscription breakdown
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

    // AI usage aggregation
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
    const subsMap = new Map<string, string>(); // userId -> tier

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

    // Build per-user breakdown
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

    // Round user costs
    for (const item of perUser.values()) {
      item.estimatedCostUsd = Math.round(item.estimatedCostUsd * 10000) / 10000;
    }

    // Sort by estimated cost desc
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
}
