import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { estimateCost } from './admin-analytics.service';
import type {
  AdminInvestorMetricsResponse,
  SegmentMetrics,
  MonetizationBlock,
} from '@budget/shared-types';
import {
  buildActiveDays,
  computeActivation,
  computeChurn,
  computeEngagement,
  computeGrowth,
  computeTrialConversion,
  computeWeeklyRetention,
  normalizeMrr,
  type ActivityEvent,
  type PaidSubRow,
  type SignupRow,
} from './admin-metrics.util';

interface Params { months: number; weeks: number; activationDays: number }

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AdminInvestorMetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  async getInvestorMetrics(params: Params): Promise<AdminInvestorMetricsResponse> {
    const key = `admin:investor-metrics:${params.months}:${params.weeks}:${params.activationDays}`;
    const cached = await this.cacheService.get<AdminInvestorMetricsResponse>(key);
    if (cached) return cached;

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    // Activity lookback: enough for the retention window plus a margin.
    const lookbackStart = new Date(now.getTime() - Math.max((params.weeks + 4) * 7, 90 + params.activationDays) * DAY_MS);

    const [
      totalUsers, totalAccounts, totalTransactions,
      users, expenses, incomes, subs, usageLogs,
    ] = await Promise.all([
      // All registered users — must match the `findMany` signup universe that
      // feeds retention/activation/growth/segments (freeToPaidConversion divides
      // by this), per the spec's "all registered users" convention.
      this.prisma.user.count(),
      this.prisma.account.count(),
      Promise.all([
        this.prisma.expense.count({ where: { isDeleted: false } }),
        this.prisma.income.count({ where: { isDeleted: false } }),
      ]).then(([e, i]) => e + i),
      this.prisma.user.findMany({ select: { id: true, createdAt: true, language: true } }),
      this.prisma.expense.findMany({
        where: { isDeleted: false, createdAt: { gte: lookbackStart } },
        select: { userId: true, createdAt: true },
      }),
      this.prisma.income.findMany({
        where: { isDeleted: false, createdAt: { gte: lookbackStart } },
        select: { userId: true, createdAt: true },
      }),
      this.prisma.subscription.findMany({
        select: {
          userId: true, tier: true, status: true,
          currentPeriodStart: true, currentPeriodEnd: true,
          trialStart: true, trialEnd: true, canceledAt: true,
          user: { select: { language: true, currencyCode: true } },
        },
      }),
      this.prisma.usageLog.findMany({
        where: { createdAt: { gte: monthStart } },
        select: { featureType: true },
      }),
    ]);

    const signups: SignupRow[] = users.map((u) => ({ userId: u.id, createdAt: u.createdAt }));
    const activity: ActivityEvent[] = [
      ...expenses.map((e) => ({ userId: e.userId, createdAt: e.createdAt })),
      ...incomes.map((i) => ({ userId: i.userId, createdAt: i.createdAt })),
    ];
    const langById = new Map(users.map((u) => [u.id, u.language]));

    const monetization = this.buildMonetization(subs, usageLogs, totalUsers, activity, now, monthStart);

    const segment = (which: 'pl' | 'other'): SegmentMetrics => {
      const inSeg = (lang: string | null | undefined) => (which === 'pl' ? lang === 'pl' : lang !== 'pl');
      const segSignups = signups.filter((s) => inSeg(langById.get(s.userId)));
      const segUserIds = new Set(segSignups.map((s) => s.userId));
      const segActivity = activity.filter((a) => segUserIds.has(a.userId));
      const segActive = buildActiveDays(segActivity);
      const ret = computeWeeklyRetention(segSignups, segActive, params.weeks, now);
      const act = computeActivation(segSignups, segActive, params.activationDays, now);
      const segPaid = this.paidRows(subs.filter((s) => inSeg(s.user?.language)));
      const segMrr = normalizeMrr(segPaid).mrrUsd;
      return {
        segment: which,
        users: segSignups.length,
        retentionHeadline: ret.headline,
        activationRate: act.activationRate,
        freeToPaidConversion: segSignups.length > 0 ? segPaid.length / segSignups.length : 0,
        mrrUsd: Math.round(segMrr * 100) / 100,
      };
    };

    const active = buildActiveDays(activity);
    const response: AdminInvestorMetricsResponse = {
      generatedAt: now.toISOString(),
      params,
      retention: computeWeeklyRetention(signups, active, params.weeks, now),
      activation: computeActivation(signups, active, params.activationDays, now),
      engagement: computeEngagement(active, now),
      growth: computeGrowth(signups, params.months, now),
      monetization,
      segments: [segment('pl'), segment('other')],
      scale: { totalUsers, totalAccounts, totalTransactions },
    };

    await this.cacheService.set(key, response, 3600);
    return response;
  }

  // Maps active paid subscription rows to the pure PaidSubRow shape.
  private paidRows(
    subs: Array<{
      tier: string; status: string;
      currentPeriodStart: Date | null; currentPeriodEnd: Date | null;
      user?: { currencyCode?: string } | null;
    }>,
  ): PaidSubRow[] {
    return subs
      .filter((s) => (s.tier === 'pro' || s.tier === 'business') && s.status === 'active')
      .map((s) => ({
        tier: s.tier as 'pro' | 'business',
        currentPeriodStart: s.currentPeriodStart,
        currentPeriodEnd: s.currentPeriodEnd,
        currencyCode: s.user?.currencyCode ?? 'USD',
      }));
  }

  private buildMonetization(
    subs: Array<any>,
    usageLogs: Array<{ featureType: string }>,
    totalUsers: number,
    activity: ActivityEvent[],
    now: Date,
    monthStart: Date,
  ): MonetizationBlock {
    const paid = this.paidRows(subs);
    const { mrrUsd, approximate, payingUsers } = normalizeMrr(paid);
    const trialingUsers = subs.filter((s) => s.status === 'trialing').length;

    const mau = computeEngagement(buildActiveDays(activity), now).mau;
    const aiCogsUsd = Math.round(
      usageLogs.reduce((sum, l) => sum + estimateCost(l.featureType, 1), 0) * 10000,
    ) / 10000;

    const endedTrialFlags = subs
      .filter((s) => s.trialEnd && s.trialEnd.getTime() < now.getTime())
      .map((s) => (s.tier === 'pro' || s.tier === 'business') && s.status === 'active');
    const trialToPaidConversion = computeTrialConversion(endedTrialFlags);

    // Churned this month: detect by canceled status + canceledAt, NOT by tier —
    // handleSubscriptionDeleted resets tier->free and stripePriceId->null on cancel,
    // so the pre-cancel tier/price are lost. Logo churn (count-based) is exact;
    // revenue churn is unknowable in v1 (churnedMrr omitted -> null). See Phase 2.
    const churnedCount = subs.filter(
      (s) => s.status === 'canceled' && s.canceledAt && s.canceledAt.getTime() >= monthStart.getTime(),
    ).length;
    const churn = computeChurn({ payingNow: payingUsers, churnedCount, mrrNow: mrrUsd });

    return {
      // normalizeMrr returns the EXACT monthly-equivalent sum (a pure function,
      // no cents rounding — see Task 7); round to cents here at the presentation
      // boundary, consistent with arpu/arppu/aiCogs below.
      mrrUsd: Math.round(mrrUsd * 100) / 100, mrrApproximate: approximate, payingUsers, trialingUsers,
      arpuUsd: mau > 0 ? Math.round((mrrUsd / mau) * 100) / 100 : 0,
      arppuUsd: payingUsers > 0 ? Math.round((mrrUsd / payingUsers) * 100) / 100 : 0,
      freeToPaidConversion: totalUsers > 0 ? payingUsers / totalUsers : 0,
      trialToPaidConversion,
      logoChurnMonthly: churn.logoChurnMonthly,
      revenueChurnMonthly: churn.revenueChurnMonthly,
      aiCogsUsd,
      grossMargin: mrrUsd > 0 ? (mrrUsd - aiCogsUsd) / mrrUsd : null,
    };
  }
}
