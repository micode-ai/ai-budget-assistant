import { Injectable, BadRequestException, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../../database/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as ni18n from '../notifications/notification-i18n';
import { AdminGateway } from '../admin/admin.gateway';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
import * as pricingData from './pricing-data.json';
import { SubscriptionsService } from './subscriptions.service';

type SubscriptionTier = 'free' | 'pro' | 'business';

const PRICING: Record<string, unknown> = pricingData.currencies;

/**
 * Stripe billing lifecycle: customer, checkout, portal and webhook handling.
 * Mutates status/tier/stripeSubscriptionId. Usage metering lives in
 * UsageTrackingService; plans and the subscription row in SubscriptionsService.
 */
@Injectable()
export class StripeBillingService {
  private readonly stripe!: Stripe;
  private readonly logger = new Logger(StripeBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly subscriptions: SubscriptionsService,
    private readonly telegramService: TelegramService,
    private readonly notificationsService: NotificationsService,
    @Optional() @Inject(forwardRef(() => AdminGateway))
    private readonly adminGateway?: AdminGateway | null,
  ) {
    const stripeKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (stripeKey) {
      this.stripe = new Stripe(stripeKey, { apiVersion: '2026-01-28.clover' });
    }
  }

  async getOrCreateStripeCustomer(userId: string): Promise<string> {
    const sub = await this.subscriptions.getOrCreateSubscription(userId);

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
    currencyCode: string | null | undefined,
  ) {
    if (!this.subscriptions.offeredPriceEnvKeys(currencyCode).has(priceEnvKey)) {
      this.logger.warn(`Refused checkout with a price key not offered to user ${userId}`);
      throw new BadRequestException('This plan is not available for your currency');
    }
    const stripePriceId = this.subscriptions.resolvePriceId(priceEnvKey);
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

    this.emitTierChange(userId, previousTier ?? 'free', tier);

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
      ).catch(logFireAndForget(this.logger, 'StripeBillingService.sendToUser#activated'));
    }
  }

  private async handleSubscriptionDeleted(
    stripeSub: Stripe.Subscription,
  ): Promise<void> {
    const userId = stripeSub.metadata.userId;
    if (!userId) return;

    const existing = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { tier: true },
    });

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

    this.emitTierChange(userId, existing?.tier ?? 'free', 'free');
  }

  /** Live admin feed. Fire-and-forget: a gateway failure must never affect the webhook response. */
  private emitTierChange(userId: string, fromTier: string, toTier: string): void {
    if (fromTier === toTier) return;
    try {
      this.adminGateway?.emitSubscriptionChange({
        userId,
        fromTier,
        toTier,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      this.logger.warn(`StripeBillingService.emitTierChange failed: ${err}`);
    }
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
    ).catch(logFireAndForget(this.logger, 'StripeBillingService.sendToUser#paymentSuccess'));
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
      ).catch(logFireAndForget(this.logger, 'StripeBillingService.sendToUser#paymentFailed'));
    }
  }

  private async resolveTierFromPrice(
    priceId: string,
  ): Promise<'free' | 'pro' | 'business'> {
    // Every currency in pricing-data.json, plus the legacy un-suffixed keys.
    const currencies = ['', ...Object.keys(PRICING).map((code) => `_${code}`)];

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
}
