import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import * as pricingData from './pricing-data.json';

type SubscriptionRecord = NonNullable<Awaited<ReturnType<PrismaService['subscription']['findUnique']>>>;

/**
 * Multi-currency pricing table (amounts + display symbol).
 * Single source of truth is pricing-data.json (see tech-debt
 * pricing-table-triple-copy) — also read by setup-stripe-products.ts and
 * docs/marketing/landing/build_landing.py. Does NOT drive what Stripe
 * actually charges (see resolvePriceId() below, which is env-driven).
 */
const PRICING: Record<
  string,
  { symbol: string; pro_monthly: number; pro_yearly: number; biz_monthly: number; biz_yearly: number }
> = pricingData.currencies;

/** The four Stripe price env keys a currency needs before its prices can be offered. */
export function stripePriceEnvKeys(code: string): string[] {
  return [
    `STRIPE_PRO_MONTHLY_PRICE_ID_${code}`,
    `STRIPE_PRO_YEARLY_PRICE_ID_${code}`,
    `STRIPE_BUSINESS_MONTHLY_PRICE_ID_${code}`,
    `STRIPE_BUSINESS_YEARLY_PRICE_ID_${code}`,
  ];
}

/**
 * Display convention per currency for getPlans()' `display` strings. Only
 * currencies listed here deviate from the legacy `${symbol}${n.toFixed(2)}`
 * form; BRL follows the app formatter (`formatCurrency(…, 'BRL')` → `R$14,90`,
 * `R$1.234,50`): prefix symbol, no space, comma decimals, dot thousands.
 */
const DISPLAY_FORMAT: Record<string, { decimal: string; thousands: string }> = {
  BRL: { decimal: ',', thousands: '.' },
};

export function formatPlanAmount(code: string, symbol: string, amountMinor: number): string {
  const fixed = (amountMinor / 100).toFixed(2);
  const fmt = DISPLAY_FORMAT[code];
  if (!fmt) return `${symbol}${fixed}`;
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, fmt.thousands);
  return `${symbol}${grouped}${fmt.decimal}${frac}`;
}

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);
  /** Currencies already warned about as unprovisioned — warn once per process, not per request. */
  private readonly warnedUnprovisioned = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  // ---- Subscription CRUD ----

  async getOrCreateSubscription(userId: string): Promise<SubscriptionRecord> {
    try {
      return await this.prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          tier: 'free',
          status: 'active',
        },
        update: {},
      });
    } catch (e: any) {
      // Prisma's upsert is NOT atomic under concurrency (ABA-314): two first-time
      // requests for the same user can both attempt the INSERT, and one loses on
      // the unique userId with P2002. The row exists now — re-fetch it instead of
      // crashing (this is a hot path: getCurrent/getUsageStats/limit checks all
      // funnel through here, so a new user's parallel startup requests race).
      if (e?.code === 'P2002') {
        const existing = await this.prisma.subscription.findUnique({ where: { userId } });
        if (existing) return existing;
      }
      throw e;
    }
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


  /**
   * The currency the plans are offered in: the user's own currency when
   * pricing-data.json has a row for it AND (with Stripe configured) all four of
   * its STRIPE_*_PRICE_ID_{CUR} env keys are set; otherwise USD. The env check
   * keeps the displayed currency equal to the charged one — a currency whose
   * Stripe prices are not provisioned yet (e.g. BRL before its env lines land)
   * must not show local prices it cannot charge. Without STRIPE_SECRET_KEY
   * nothing can be charged, so the row alone decides (dev/test).
   */
  resolvePlanCurrency(currencyCode: string | null | undefined): string {
    const requested = (currencyCode || 'USD').toUpperCase();
    if (!PRICING[requested]) return 'USD';
    if (requested === 'USD' || !this.configService.get<string>('STRIPE_SECRET_KEY')) return requested;
    const provisioned = stripePriceEnvKeys(requested).every(
      (key) => !!this.configService.get<string>(key),
    );
    if (!provisioned) {
      if (!this.warnedUnprovisioned.has(requested)) {
        this.warnedUnprovisioned.add(requested);
        this.logger.warn(
          `Stripe prices for ${requested} are not configured; offering USD plans instead`,
        );
      }
      return 'USD';
    }
    return requested;
  }

  getPlans(currencyCode: string) {
    const code = this.resolvePlanCurrency(currencyCode);
    const p = PRICING[code];

    const fmtDisplay = (amount: number) => formatPlanAmount(code, p.symbol, amount);

    return {
      currency: code,
      symbol: p.symbol,
      plans: [
        {
          tier: 'pro' as const,
          name: 'Pro',
          monthly: { amount: p.pro_monthly, display: fmtDisplay(p.pro_monthly), priceEnvKey: `STRIPE_PRO_MONTHLY_PRICE_ID_${code}` },
          yearly:  { amount: p.pro_yearly,  display: fmtDisplay(p.pro_yearly),  priceEnvKey: `STRIPE_PRO_YEARLY_PRICE_ID_${code}` },
          monthlyEquivalent: fmtDisplay(Math.round(p.pro_yearly / 12)),
          features: [
            '300 AI requests/month',
            'Up to 5 accounts',
            'Up to 5 members',
            'Predictive analytics',
            'Anomaly detection',
            'Unlimited currencies',
          ],
        },
        {
          tier: 'business' as const,
          name: 'Business',
          monthly: { amount: p.biz_monthly, display: fmtDisplay(p.biz_monthly), priceEnvKey: `STRIPE_BUSINESS_MONTHLY_PRICE_ID_${code}` },
          yearly:  { amount: p.biz_yearly,  display: fmtDisplay(p.biz_yearly),  priceEnvKey: `STRIPE_BUSINESS_YEARLY_PRICE_ID_${code}` },
          monthlyEquivalent: fmtDisplay(Math.round(p.biz_yearly / 12)),
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

  /**
   * The price env keys a user may check out with: the four getPlans() hands
   * out for their currency, plus the four USD keys (the universal fallback
   * plans). Anything else — another currency's cheaper PPP price, or an
   * arbitrary env var name — is refused before any config lookup.
   */
  offeredPriceEnvKeys(currencyCode: string | null | undefined): Set<string> {
    const code = this.resolvePlanCurrency(currencyCode);
    return new Set([...stripePriceEnvKeys(code), ...stripePriceEnvKeys('USD')]);
  }

  /**
   * Exact env lookup of a suffixed price key ("STRIPE_PRO_MONTHLY_PRICE_ID_PLN").
   * No fallback to the un-suffixed key: it would charge in whatever currency
   * that bare price is in, not the one displayed. Only called with a key that
   * passed offeredPriceEnvKeys().
   */
  resolvePriceId(priceEnvKey: string): string {
    const priceId = this.configService.get<string>(priceEnvKey);
    if (priceId) return priceId;
    throw new BadRequestException(`No Stripe price configured for ${priceEnvKey}`);
  }
}
