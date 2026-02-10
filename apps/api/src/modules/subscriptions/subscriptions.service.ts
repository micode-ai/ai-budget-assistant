import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../../database/prisma.service';
import type { SubscriptionTier, Subscription } from '@prisma/client';
import { TelegramService } from '../telegram/telegram.service';

const AI_REQUEST_LIMITS: Record<SubscriptionTier, number> = {
  free: 5,
  pro: 200,
  business: Infinity,
};

const TRIAL_REQUEST_LIMITS: Record<SubscriptionTier, number> = {
  free: 5,
  pro: 15,
  business: 100,
};

const MEMBER_LIMITS: Record<SubscriptionTier, number> = {
  free: 1,
  pro: 5,
  business: Infinity,
};

/**
 * Multi-currency pricing table.
 * Amounts in smallest currency units (cents/groszy/kopecks).
 * PPP-adjusted for each market.
 */
const PRICING: Record<
  string,
  { symbol: string; pro_monthly: number; pro_yearly: number; biz_monthly: number; biz_yearly: number }
> = {
  USD: { symbol: '$',  pro_monthly: 999,   pro_yearly: 9588,   biz_monthly: 1999,  biz_yearly: 19188  },
  EUR: { symbol: '€',  pro_monthly: 899,   pro_yearly: 8628,   biz_monthly: 1799,  biz_yearly: 17268  },
  PLN: { symbol: 'zł', pro_monthly: 2999,  pro_yearly: 28788,  biz_monthly: 5999,  biz_yearly: 57588  },
  GBP: { symbol: '£',  pro_monthly: 799,   pro_yearly: 7668,   biz_monthly: 1599,  biz_yearly: 15348  },
  UAH: { symbol: '₴',  pro_monthly: 19900, pro_yearly: 190900, biz_monthly: 39900, biz_yearly: 382900 },
  RUB: { symbol: '₽',  pro_monthly: 49900, pro_yearly: 478900, biz_monthly: 99900, biz_yearly: 958900 },
};

@Injectable()
export class SubscriptionsService {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly telegramService: TelegramService,
  ) {
    const stripeKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.stripe = new Stripe(stripeKey || '', {
      apiVersion: '2026-01-28.clover',
    });
  }

  // ---- Subscription CRUD ----

  async getOrCreateSubscription(userId: string): Promise<Subscription> {
    let subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      subscription = await this.prisma.subscription.create({
        data: {
          userId,
          tier: 'free',
          status: 'active',
        },
      });
    }

    return subscription;
  }

  async getCurrent(userId: string) {
    const sub = await this.getOrCreateSubscription(userId);
    return {
      id: sub.id,
      tier: sub.tier,
      status: sub.status,
      currentPeriodStart: sub.currentPeriodStart?.toISOString(),
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString(),
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      trialStart: sub.trialStart?.toISOString(),
      trialEnd: sub.trialEnd?.toISOString(),
    };
  }

  async getUsageStats(userId: string) {
    const sub = await this.getOrCreateSubscription(userId);
    await this.resetUsageIfNeeded(sub);

    const limit = sub.status === 'trialing'
      ? TRIAL_REQUEST_LIMITS[sub.tier]
      : AI_REQUEST_LIMITS[sub.tier];
    const refreshedSub = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    const used = refreshedSub?.aiRequestsUsed ?? 0;

    return {
      tier: sub.tier,
      aiRequestsUsed: used,
      aiRequestsLimit: limit === Infinity ? -1 : limit,
      resetAt: refreshedSub?.aiRequestsResetAt?.toISOString(),
      percentUsed: limit === Infinity ? 0 : Math.round((used / limit) * 100),
      isTrialing: sub.status === 'trialing',
    };
  }

  getPlans(currencyCode: string) {
    const currency = currencyCode.toUpperCase();
    const p = PRICING[currency] || PRICING.USD;
    const code = PRICING[currency] ? currency : 'USD';

    const fmt = (amount: number) => (amount / 100).toFixed(2);

    return {
      currency: code,
      symbol: p.symbol,
      plans: [
        {
          tier: 'pro' as const,
          name: 'Pro',
          monthly: { amount: p.pro_monthly, display: `${p.symbol}${fmt(p.pro_monthly)}`, priceEnvKey: `STRIPE_PRO_MONTHLY_PRICE_ID_${code}` },
          yearly:  { amount: p.pro_yearly,  display: `${p.symbol}${fmt(p.pro_yearly)}`,  priceEnvKey: `STRIPE_PRO_YEARLY_PRICE_ID_${code}` },
          monthlyEquivalent: `${p.symbol}${fmt(Math.round(p.pro_yearly / 12))}`,
          features: [
            '200 AI requests/month',
            'Up to 3 accounts',
            'Up to 5 members',
            'Predictive analytics',
            'Anomaly detection',
            'Unlimited currencies',
          ],
        },
        {
          tier: 'business' as const,
          name: 'Business',
          monthly: { amount: p.biz_monthly, display: `${p.symbol}${fmt(p.biz_monthly)}`, priceEnvKey: `STRIPE_BUSINESS_MONTHLY_PRICE_ID_${code}` },
          yearly:  { amount: p.biz_yearly,  display: `${p.symbol}${fmt(p.biz_yearly)}`,  priceEnvKey: `STRIPE_BUSINESS_YEARLY_PRICE_ID_${code}` },
          monthlyEquivalent: `${p.symbol}${fmt(Math.round(p.biz_yearly / 12))}`,
          features: [
            'Unlimited AI requests',
            'Unlimited accounts',
            'Unlimited members',
            'Advanced reporting',
          ],
        },
      ],
    };
  }

  resolvePriceId(priceEnvKey: string): string {
    // priceEnvKey is like "STRIPE_PRO_MONTHLY_PRICE_ID_PLN"
    // First try the exact env key, then fallback to USD
    const priceId = this.configService.get<string>(priceEnvKey);
    if (priceId) return priceId;

    // Fallback: strip the currency suffix and try without it
    const fallbackKey = priceEnvKey.replace(/_[A-Z]{3}$/, '');
    const fallbackId = this.configService.get<string>(fallbackKey);
    if (fallbackId) return fallbackId;

    throw new BadRequestException(`No Stripe price configured for ${priceEnvKey}`);
  }

  // ---- Stripe Integration ----

  async getOrCreateStripeCustomer(userId: string): Promise<string> {
    const sub = await this.getOrCreateSubscription(userId);

    if (sub.stripeCustomerId) {
      return sub.stripeCustomerId;
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const customer = await this.stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: { userId },
    });

    await this.prisma.subscription.update({
      where: { userId },
      data: { stripeCustomerId: customer.id },
    });

    return customer.id;
  }

  async createCheckoutSession(
    userId: string,
    priceEnvKey: string,
    successUrl: string,
    cancelUrl: string,
  ) {
    const stripePriceId = this.resolvePriceId(priceEnvKey);
    const customerId = await this.getOrCreateStripeCustomer(userId);

    // Check if user already has an active subscription
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (sub?.stripeSubscriptionId && sub.status === 'active') {
      throw new BadRequestException(
        'You already have an active subscription. Use the customer portal to manage it.',
      );
    }

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: stripePriceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { userId },
      subscription_data: {
        metadata: { userId },
        trial_period_days: 7,
      },
      // Adaptive Pricing — auto-converts to customer's local currency
      // based on purchasing power parity (PPP)
      adaptive_pricing: { enabled: true },
    });

    return { sessionId: session.id, url: session.url };
  }

  async createPortalSession(userId: string, returnUrl: string) {
    const customerId = await this.getOrCreateStripeCustomer(userId);

    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  }

  // ---- Usage Tracking ----

  async trackAiUsage(
    userId: string,
    featureType: string,
    costUnits: number,
    accountId?: string,
  ): Promise<void> {
    const sub = await this.getOrCreateSubscription(userId);

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

    const limit = current.status === 'trialing'
      ? TRIAL_REQUEST_LIMITS[current.tier]
      : AI_REQUEST_LIMITS[current.tier];
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

  async checkMemberLimit(userId: string, accountId: string): Promise<void> {
    const sub = await this.getOrCreateSubscription(userId);
    const memberCount = await this.prisma.accountMember.count({
      where: { accountId },
    });

    const limit = MEMBER_LIMITS[sub.tier];
    if (memberCount >= limit) {
      throw new ForbiddenException(
        `Member limit reached (${limit}). Upgrade your subscription to invite more members.`,
      );
    }
  }

  // ---- Webhook Handling ----

  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    this.logger.log(`Processing Stripe webhook: ${event.type}`);

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
        );
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
        );
        break;

      case 'invoice.payment_failed':
        await this.handlePaymentFailed(
          event.data.object as Stripe.Invoice,
        );
        break;

      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }
  }

  constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
    const webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret || '',
    );
  }

  // ---- Private Helpers ----

  private async handleSubscriptionUpdated(
    stripeSub: Stripe.Subscription,
  ): Promise<void> {
    const userId = stripeSub.metadata.userId;
    if (!userId) {
      this.logger.warn('Subscription webhook missing userId metadata');
      return;
    }

    const item = stripeSub.items.data[0];
    const priceId = item?.price.id;
    const tier = await this.resolveTierFromPrice(priceId);

    // In Stripe API v2026+, current_period is on the item, not the subscription
    const periodStart = item?.current_period_start
      ? new Date(item.current_period_start * 1000)
      : null;
    const periodEnd = item?.current_period_end
      ? new Date(item.current_period_end * 1000)
      : null;

    const customerId =
      typeof stripeSub.customer === 'string'
        ? stripeSub.customer
        : stripeSub.customer.id;

    // Capture current tier before update (for notification logic)
    const existingSub = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { tier: true },
    });
    const previousTier = existingSub?.tier;

    const data = {
      tier,
      status: this.mapStripeStatus(stripeSub.status),
      stripeCustomerId: customerId,
      stripeSubscriptionId: stripeSub.id,
      stripePriceId: priceId,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      trialStart: stripeSub.trial_start
        ? new Date(stripeSub.trial_start * 1000)
        : null,
      trialEnd: stripeSub.trial_end
        ? new Date(stripeSub.trial_end * 1000)
        : null,
    };

    await this.prisma.subscription.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    // Notify on new paid subscription or tier upgrade
    if (tier !== 'free' && previousTier !== tier) {
      try {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { name: true, email: true },
        });
        if (user) {
          this.telegramService.notifyNewSubscription(
            user.name,
            user.email,
            tier,
          );
        }
      } catch (error) {
        this.logger.warn(`Failed to send subscription notification: ${error}`);
      }
    }
  }

  private async handleSubscriptionDeleted(
    stripeSub: Stripe.Subscription,
  ): Promise<void> {
    const userId = stripeSub.metadata.userId;
    if (!userId) return;

    await this.prisma.subscription.update({
      where: { userId },
      data: {
        tier: 'free',
        status: 'canceled',
        stripeSubscriptionId: null,
        stripePriceId: null,
        canceledAt: new Date(),
        cancelAtPeriodEnd: false,
      },
    });
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const customerId =
      typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id;

    if (!customerId) return;

    const sub = await this.prisma.subscription.findUnique({
      where: { stripeCustomerId: customerId },
    });

    if (sub) {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'past_due' },
      });
    }
  }

  private async resolveTierFromPrice(
    priceId: string,
  ): Promise<SubscriptionTier> {
    const proMonthly = this.configService.get<string>(
      'STRIPE_PRO_MONTHLY_PRICE_ID',
    );
    const proYearly = this.configService.get<string>(
      'STRIPE_PRO_YEARLY_PRICE_ID',
    );
    const businessMonthly = this.configService.get<string>(
      'STRIPE_BUSINESS_MONTHLY_PRICE_ID',
    );
    const businessYearly = this.configService.get<string>(
      'STRIPE_BUSINESS_YEARLY_PRICE_ID',
    );

    if (priceId === proMonthly || priceId === proYearly) return 'pro';
    if (priceId === businessMonthly || priceId === businessYearly)
      return 'business';

    // Fallback: try to read from Stripe price metadata
    try {
      const price = await this.stripe.prices.retrieve(priceId);
      const tier = price.metadata?.tier as SubscriptionTier;
      if (tier && ['pro', 'business'].includes(tier)) return tier;
    } catch {
      this.logger.warn(`Could not resolve tier for price: ${priceId}`);
    }

    return 'free';
  }

  private mapStripeStatus(
    stripeStatus: Stripe.Subscription.Status,
  ): 'active' | 'canceled' | 'past_due' | 'incomplete' | 'trialing' | 'paused' {
    const statusMap: Record<string, 'active' | 'canceled' | 'past_due' | 'incomplete' | 'trialing' | 'paused'> = {
      active: 'active',
      canceled: 'canceled',
      past_due: 'past_due',
      incomplete: 'incomplete',
      incomplete_expired: 'canceled',
      trialing: 'trialing',
      unpaid: 'past_due',
      paused: 'paused',
    };
    return statusMap[stripeStatus] || 'active';
  }

  private async resetUsageIfNeeded(sub: Subscription): Promise<void> {
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
}
