import { ForbiddenException, Injectable } from '@nestjs/common';
import type { LeafletBudget } from '@budget/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

type Tier = 'free' | 'pro' | 'business';

function envInt(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Monthly leaflet PAGE budget — separate from the AI request limit. Never unlimited. */
export const LEAFLET_PAGE_LIMITS: Record<Tier, number> = {
  free: envInt('LEAFLET_PAGES_FREE', 20),
  pro: envInt('LEAFLET_PAGES_PRO', 200),
  business: envInt('LEAFLET_PAGES_BUSINESS', 500),
};

@Injectable()
export class LeafletBudgetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  // Trialing users use the same per-tier row; customAiLimit/bonusAiRequests do not apply.
  private limitFor(tier: string): number {
    return LEAFLET_PAGE_LIMITS[tier as Tier] ?? LEAFLET_PAGE_LIMITS.free;
  }

  private async fresh(userId: string) {
    const sub = await this.subscriptions.getOrCreateSubscription(userId);
    await this.subscriptions.resetUsageIfNeeded(sub);
    return this.prisma.subscription.findUniqueOrThrow({ where: { userId } });
  }

  async consume(userId: string, accountId: string | null, pages = 1): Promise<void> {
    const sub = await this.fresh(userId);
    const limit = this.limitFor(sub.tier);
    const { count } = await this.prisma.subscription.updateMany({
      where: { userId, leafletPagesUsed: { lte: limit - pages } },
      data: { leafletPagesUsed: { increment: pages } },
    });
    if (count === 0) {
      throw new ForbiddenException({
        message: `Leaflet page limit reached (${limit} per month).`,
        code: 'LEAFLET_LIMIT',
      });
    }
    // COGS visibility only; never throws and never touches the AI quota.
    await this.subscriptions.recordAdditionalUsage(userId, 'leaflet', pages, accountId ?? undefined);
  }

  async refund(userId: string, pages = 1): Promise<void> {
    // Conditional so the counter can never go below 0.
    const sub = await this.prisma.subscription.findUniqueOrThrow({ where: { userId } });
    const amount = Math.min(pages, Math.max(0, sub.leafletPagesUsed ?? 0));
    if (amount <= 0) return;
    await this.prisma.subscription.updateMany({
      where: { userId, leafletPagesUsed: { gte: amount } },
      data: { leafletPagesUsed: { decrement: amount } },
    });
  }

  async get(userId: string): Promise<LeafletBudget> {
    const sub = await this.fresh(userId);
    return {
      used: sub.leafletPagesUsed ?? 0,
      limit: this.limitFor(sub.tier),
      resetAt: sub.aiRequestsResetAt.toISOString(),
    };
  }
}
