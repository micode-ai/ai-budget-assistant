import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../../database/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import * as ni18n from '../notifications/notification-i18n';

type SubscriptionTier = 'free' | 'pro' | 'business';
type SubscriptionRecord = NonNullable<Awaited<ReturnType<PrismaService['subscription']['findUnique']>>>;

const AI_REQUEST_LIMITS: Record<SubscriptionTier, number> = {
  free: 50,
  pro: 300,
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
  private readonly stripe!: Stripe;
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly telegramService: TelegramService,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
  ) {
    const stripeKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (stripeKey) {
      this.stripe = new Stripe(stripeKey, { apiVersion: '2026-01-28.clover' });
    }
  }

  // ---- Subscription CRUD ----

  async getOrCreateSubscription(userId: string): Promise<SubscriptionRecord> {
    return this.prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        tier: 'free',
        status: 'active',
      },
      update: {},
    });
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

  async checkMemberLimit(userId: string, accountId: string): Promise<void> {
    const sub = await this.getOrCreateSubscription(userId);
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

  // ---- Webhook Handling ----

  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    this.logger.log(`Processing Stripe webhook: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription && session.mode === 'subscription') {
          const subscription = await this.stripe.subscriptions.retrieve(
            session.subscription as string,
          );
          await this.handleSubscriptionUpdated(subscription);
        }
        break;
      }

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

      case 'invoice.paid':
        await this.handleInvoicePaid(
          event.data.object as Stripe.Invoice,
        );
        break;

      case 'invoice.payment_succeeded':
        await this.handleInvoicePaid(
          event.data.object as Stripe.Invoice,
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
    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not configured — cannot verify webhook');
    }
    return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
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

    // Capture current state before update (for notification logic)
    const existingSub = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { tier: true, status: true },
    });
    const previousTier = existingSub?.tier;
    const previousStatus = existingSub?.status;

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

    const newStatus = this.mapStripeStatus(stripeSub.status);

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

    // Notify user when trial ends and subscription becomes active
    if (previousStatus === 'trialing' && newStatus === 'active') {
      const tierUpper = tier.toUpperCase();
      this.notificationsService.sendToUser(
        userId,
        (lang: string) => ni18n.subscriptionActivatedTitle(lang),
        (lang: string) => ni18n.subscriptionActivatedBody(lang, { tier: tierUpper }),
        { type: 'subscription_activated' },
      ).catch(() => {});
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

  private async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    // Skip trial invoices ($0)
    if (invoice.amount_paid === 0) return;

    const customerId =
      typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id;

    if (!customerId) return;

    const sub = await this.prisma.subscription.findUnique({
      where: { stripeCustomerId: customerId },
      select: { userId: true, tier: true },
    });

    if (!sub) return;

    const amountDisplay = (invoice.amount_paid / 100).toFixed(2);
    const currency = (invoice.currency || 'usd').toUpperCase();

    const tierUpper = sub.tier.toUpperCase();
    this.notificationsService.sendToUser(
      sub.userId,
      (lang: string) => ni18n.paymentSuccessTitle(lang),
      (lang: string) => ni18n.paymentSuccessBody(lang, { amount: amountDisplay, currency, tier: tierUpper }),
      { type: 'payment_success' },
    ).catch(() => {});
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

      this.notificationsService.sendToUser(
        sub.userId,
        (lang: string) => ni18n.paymentFailedTitle(lang),
        (lang: string) => ni18n.paymentFailedBody(lang),
        { type: 'payment_failed' },
      ).catch(() => {});
    }
  }

  private async resolveTierFromPrice(
    priceId: string,
  ): Promise<'free' | 'pro' | 'business'> {
    const currencies = ['', '_USD', '_EUR', '_PLN', '_GBP', '_UAH', '_RUB'];

    for (const suffix of currencies) {
      const proMonthly = this.configService.get<string>(`STRIPE_PRO_MONTHLY_PRICE_ID${suffix}`);
      const proYearly = this.configService.get<string>(`STRIPE_PRO_YEARLY_PRICE_ID${suffix}`);
      if (priceId === proMonthly || priceId === proYearly) return 'pro';

      const bizMonthly = this.configService.get<string>(`STRIPE_BUSINESS_MONTHLY_PRICE_ID${suffix}`);
      const bizYearly = this.configService.get<string>(`STRIPE_BUSINESS_YEARLY_PRICE_ID${suffix}`);
      if (priceId === bizMonthly || priceId === bizYearly) return 'business';
    }

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

  private async resetUsageIfNeeded(sub: SubscriptionRecord): Promise<void> {
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
