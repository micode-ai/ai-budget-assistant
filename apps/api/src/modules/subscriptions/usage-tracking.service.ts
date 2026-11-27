import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

type SubscriptionTier = 'free' | 'pro' | 'business';
type SubscriptionRecord = NonNullable<Awaited<ReturnType<PrismaService['subscription']['findUnique']>>>;

const AI_REQUEST_LIMITS: Record<SubscriptionTier, number> = {
  free: 50,
  pro: 300,
  business: Infinity,
};

const TRIAL_REQUEST_LIMITS: Record<SubscriptionTier, number> = {
  free: 50,
  pro: 300,
  business: Infinity,
};

const MEMBER_LIMITS: Record<SubscriptionTier, number> = {
  free: 1,
  pro: 5,
  business: Infinity,
};

/**
 * AI usage metering and quota enforcement (hot path of every AI request).
 * Has nothing to do with Stripe — see StripeBillingService for that.
 */
@Injectable()
export class UsageTrackingService {
  private readonly logger = new Logger(UsageTrackingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async getUsageStats(userId: string) {
    const sub = await this.subscriptions.getOrCreateSubscription(userId);
    await this.resetUsageIfNeeded(sub);

    const tierLimit = sub.status === 'trialing'
      ? TRIAL_REQUEST_LIMITS[sub.tier as SubscriptionTier]
      : AI_REQUEST_LIMITS[sub.tier as SubscriptionTier];
    const refreshedSub = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    const limit = (refreshedSub?.customAiLimit ?? tierLimit) + (refreshedSub?.bonusAiRequests ?? 0);
    const used = refreshedSub?.aiRequestsUsed ?? 0;

    return {
      tier: sub.tier,
      aiRequestsUsed: used,
      aiRequestsLimit: limit === Infinity ? -1 : limit,
      resetAt: refreshedSub?.aiRequestsResetAt?.toISOString(),
      percentUsed: limit === Infinity ? 0 : Math.round((used / limit) * 100),
      isTrialing: sub.status === 'trialing',
      bonusAiRequests: refreshedSub?.bonusAiRequests ?? 0,
    };
  }

  async getUsageDetails(userId: string, month: number, year: number) {
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0, 23, 59, 59, 999);

    const logs = await this.prisma.usageLog.findMany({
      where: {
        userId,
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        featureType: true,
        costUnits: true,
        createdAt: true,
      },
    });

    // Aggregate by feature type
    const byFeature: Record<string, { count: number; totalCost: number }> = {};
    for (const log of logs) {
      if (!byFeature[log.featureType]) {
        byFeature[log.featureType] = { count: 0, totalCost: 0 };
      }
      byFeature[log.featureType].count++;
      byFeature[log.featureType].totalCost += log.costUnits;
    }

    const summary = Object.entries(byFeature).map(([feature, data]) => ({
      feature,
      count: data.count,
      totalCost: data.totalCost,
    })).sort((a, b) => b.totalCost - a.totalCost);

    return {
      month,
      year,
      totalCost: logs.reduce((sum, l) => sum + l.costUnits, 0),
      totalRequests: logs.length,
      summary,
      logs: logs.map((l) => ({
        id: l.id,
        feature: l.featureType,
        cost: l.costUnits,
        date: l.createdAt.toISOString(),
      })),
    };
  }

  // ---- Usage Tracking ----

  async trackAiUsage(
    userId: string,
    featureType: string,
    costUnits: number,
    accountId?: string,
  ): Promise<void> {
    const sub = await this.subscriptions.getOrCreateSubscription(userId);

    // Business tier with active (non-trial) status = unlimited
    if (sub.tier === 'business' && sub.status !== 'trialing') {
      await this.logUsage(sub.id, userId, featureType, costUnits, accountId);
      return;
    }

    // Reset usage if period ended
    await this.resetUsageIfNeeded(sub);

    // Refetch after possible reset
    const current = await this.prisma.subscription.findUniqueOrThrow({
      where: { userId },
    });

    const tierLimit = current.status === 'trialing'
      ? TRIAL_REQUEST_LIMITS[current.tier as SubscriptionTier]
      : AI_REQUEST_LIMITS[current.tier as SubscriptionTier];
    const limit = (current.customAiLimit ?? tierLimit) + (current.bonusAiRequests ?? 0);
    if (current.aiRequestsUsed + costUnits > limit) {
      throw new ForbiddenException(
        `AI request limit reached (${limit} per month). Upgrade your subscription for more AI features.`,
      );
    }

    // Increment usage and log
    await this.prisma.$transaction([
      this.prisma.subscription.update({
        where: { userId },
        data: { aiRequestsUsed: { increment: costUnits } },
      }),
      this.prisma.usageLog.create({
        data: {
          userId,
          subscriptionId: current.id,
          featureType,
          costUnits,
          accountId,
        },
      }),
    ]);
  }

  /**
   * Gives back units charged by `trackAiUsage` when the work turned out not to be
   * billable (ABA-644: the model classified a forwarded mail as "not a receipt").
   * Never takes the counter below zero; records a negative usage-log row so the
   * history still adds up.
   */
  async refundAiUsage(userId: string, featureType: string, costUnits: number, accountId?: string): Promise<void> {
    const sub = await this.subscriptions.getOrCreateSubscription(userId);
    const refund = Math.min(costUnits, Math.max(0, sub.aiRequestsUsed ?? 0));
    if (refund <= 0) return;
    await this.prisma.$transaction([
      this.prisma.subscription.update({
        where: { userId },
        data: { aiRequestsUsed: { decrement: refund } },
      }),
      this.prisma.usageLog.create({
        data: { userId, subscriptionId: sub.id, featureType, costUnits: -refund, accountId },
      }),
    ]);
  }

  async checkMemberLimit(userId: string, accountId: string): Promise<void> {
    const sub = await this.subscriptions.getOrCreateSubscription(userId);
    const memberCount = await this.prisma.accountMember.count({
      where: { accountId },
    });

    const limit = MEMBER_LIMITS[sub.tier as SubscriptionTier];
    if (memberCount >= limit) {
      throw new ForbiddenException(
        `Member limit reached (${limit}). Upgrade your subscription to invite more members.`,
      );
    }
  }

  async resetUsageIfNeeded(sub: SubscriptionRecord): Promise<void> {
    const now = new Date();
    if (now > sub.aiRequestsResetAt) {
      const nextReset = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        1,
      );
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: {
          aiRequestsUsed: 0,
          leafletPagesUsed: 0,
          aiRequestsResetAt: nextReset,
        },
      });
    }
  }

  private async logUsage(
    subscriptionId: string,
    userId: string,
    featureType: string,
    costUnits: number,
    accountId?: string,
  ): Promise<void> {
    await this.prisma.usageLog.create({
      data: {
        userId,
        subscriptionId,
        featureType,
        costUnits,
        accountId,
      },
    });
  }

  /**
   * Records a `usage_logs` row for a cost incurred by a request that already
   * passed its own `AiUsageGuard` check — e.g. OCR's corrective re-read
   * (ABA-442), a second real OpenAI call the guard's fixed per-route decorator
   * cost can't see, since the guard runs before the handler.
   *
   * Deliberately does NOT touch the monthly quota (`aiRequestsUsed`) — this
   * is purely so the admin AI-COGS/per-feature breakdowns (which `groupBy` on
   * the raw `featureType` string with no allow-list) see the true request
   * count. Widening the user's own quota consumption for the same event is a
   * separate, deliberately out-of-scope decision (tracked in
   * `docs/tech-debt/ocr-reread-cost-not-tracked.md`).
   *
   * Never throws: the OpenAI call already happened and was billed, so a
   * failure to write this accounting row must not fail the response.
   */
  async recordAdditionalUsage(
    userId: string,
    featureType: string,
    costUnits: number,
    accountId?: string,
  ): Promise<void> {
    try {
      const sub = await this.subscriptions.getOrCreateSubscription(userId);
      await this.logUsage(sub.id, userId, featureType, costUnits, accountId);
    } catch (error) {
      this.logger.warn(`recordAdditionalUsage failed for ${featureType}: ${error}`);
    }
  }

  /**
   * Records a `usage_logs` row without touching the monthly quota or limits —
   * for system-initiated costs the user did not trigger as an AI request
   * (support-thread translation). May throw; callers decide how to handle it.
   */
  async logUsageWithoutLimit(userId: string, featureType: string, costUnits: number): Promise<void> {
    const sub = await this.subscriptions.getOrCreateSubscription(userId);
    await this.logUsage(sub.id, userId, featureType, costUnits);
  }
}
