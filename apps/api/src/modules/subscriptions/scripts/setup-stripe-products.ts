/**
 * Setup Stripe products and prices for AI Budget Assistant subscriptions.
 *
 * Two modes:
 *
 * 1. FULL (no flags) — creates two NEW Products (Pro, Business) and prices in
 *    every currency of pricing-data.json. NOT idempotent: every run creates a
 *    brand-new pair of Products. Only for a fresh environment or a full
 *    repricing (see docs/wiki/features/subscription-pricing.md).
 *
 *      STRIPE_SECRET_KEY=sk_test_... npx ts-node src/modules/subscriptions/scripts/setup-stripe-products.ts
 *
 * 2. CURRENCY (`--currency BRL[,XYZ]`) — adds prices for the given currencies
 *    to the EXISTING active Pro/Business Products. Creates no Product and
 *    touches no other currency. Re-running it is safe: a price that already
 *    exists on the product (same currency, interval and amount, active) is
 *    reused, not duplicated.
 *
 *      node dist/modules/subscriptions/scripts/setup-stripe-products.js --currency BRL --dry-run
 *      node dist/modules/subscriptions/scripts/setup-stripe-products.js --currency BRL
 *
 *    The existing Product is found by `metadata.tier` AND by its active USD
 *    monthly price matching pricing-data.json (a stray untagged legacy product
 *    exists; more than one tagged match aborts). Override with
 *    `--pro-product prod_… --business-product prod_…`.
 *
 * `--dry-run` (currency mode only) performs reads only and prints what would
 * be created. Output ends with the env lines to add to .env.
 */

import Stripe from 'stripe';
import * as pricingData from '../pricing-data.json';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover',
});

type Amounts = { pro_monthly: number; pro_yearly: number; biz_monthly: number; biz_yearly: number };
type Tier = 'pro' | 'business';
type Interval = 'month' | 'year';

/**
 * Multi-currency pricing table, derived from pricing-data.json (single
 * source of truth — see tech-debt pricing-table-triple-copy). Stripe
 * requires lowercase currency codes, so keys are lowercased here.
 */
const CURRENCIES: Record<string, Amounts> = Object.fromEntries(
  Object.entries(pricingData.currencies).map(([code, amounts]) => [
    code.toLowerCase(),
    {
      pro_monthly: amounts.pro_monthly,
      pro_yearly: amounts.pro_yearly,
      biz_monthly: amounts.biz_monthly,
      biz_yearly: amounts.biz_yearly,
    },
  ]),
);

interface Args {
  currencies: string[] | null;
  dryRun: boolean;
  proProduct?: string;
  businessProduct?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { currencies: null, dryRun: false };
  const value = (i: number, flag: string): string => {
    const v = argv[i + 1];
    if (!v || v.startsWith('--')) throw new Error(`${flag} needs a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--currency' || a === '--only') {
      args.currencies = [
        ...new Set(value(i, a).split(',').map((c) => c.trim().toLowerCase()).filter(Boolean)),
      ];
      i++;
    } else if (a === '--pro-product') {
      args.proProduct = value(i, a);
      i++;
    } else if (a === '--business-product') {
      args.businessProduct = value(i, a);
      i++;
    } else throw new Error(`Unknown argument: ${a}`);
  }
  if (args.currencies) {
    for (const c of args.currencies) {
      if (!CURRENCIES[c]) {
        throw new Error(`Currency ${c.toUpperCase()} is not in pricing-data.json`);
      }
    }
  }
  if (args.dryRun && !args.currencies) {
    throw new Error('--dry-run is only supported together with --currency');
  }
  return args;
}

function envKey(tier: Tier, interval: Interval, currency: string): string {
  const t = tier === 'pro' ? 'PRO' : 'BUSINESS';
  const p = interval === 'month' ? 'MONTHLY' : 'YEARLY';
  return `STRIPE_${t}_${p}_PRICE_ID_${currency.toUpperCase()}`;
}

function amountFor(amounts: Amounts, tier: Tier, interval: Interval): number {
  if (tier === 'pro') return interval === 'month' ? amounts.pro_monthly : amounts.pro_yearly;
  return interval === 'month' ? amounts.biz_monthly : amounts.biz_yearly;
}

async function createPrices(
  productId: string,
  tier: Tier,
  currency: string,
  amounts: { monthly: number; yearly: number },
) {
  const suffix = currency.toUpperCase();

  const monthly = await stripe.prices.create({
    product: productId,
    currency,
    unit_amount: amounts.monthly,
    recurring: { interval: 'month' },
    metadata: { tier, billing: 'monthly', currency: suffix },
  });

  const yearly = await stripe.prices.create({
    product: productId,
    currency,
    unit_amount: amounts.yearly,
    recurring: { interval: 'year' },
    metadata: { tier, billing: 'yearly', currency: suffix },
  });

  return { monthly, yearly };
}

/**
 * A price we may reuse/match: a plain licensed recurring price billed every
 * single month/year in this currency and amount. Metered, tiered or
 * every-N-intervals prices with the same amount must not count.
 */
function isPlainPrice(pr: Stripe.Price, currency: string, interval: Interval, amount: number): boolean {
  return (
    pr.active &&
    pr.type === 'recurring' &&
    pr.currency === currency &&
    pr.unit_amount === amount &&
    pr.recurring?.interval === interval &&
    pr.recurring?.interval_count === 1 &&
    pr.recurring?.usage_type === 'licensed'
  );
}

async function activePrices(productId: string): Promise<Stripe.Price[]> {
  return stripe.prices.list({ product: productId, active: true, limit: 100 }).autoPagingToArray({ limit: 1000 });
}

/** The one active, tier-tagged product whose active USD monthly price matches pricing-data.json. */
async function findExistingProduct(tier: Tier, override?: string): Promise<Stripe.Product> {
  const usdMonthly = amountFor(CURRENCIES.usd, tier, 'month');
  const hasCurrentUsdPrice = async (productId: string) =>
    (await activePrices(productId)).some((pr) => isPlainPrice(pr, 'usd', 'month', usdMonthly));

  if (override) {
    const product = await stripe.products.retrieve(override);
    if (!product.active) throw new Error(`${override} is archived (active: false)`);
    if (product.metadata?.tier !== tier) {
      throw new Error(`${override} has metadata.tier=${product.metadata?.tier ?? '(none)'}, expected ${tier}`);
    }
    if (!(await hasCurrentUsdPrice(product.id))) {
      throw new Error(`${override} has no active USD monthly price of ${usdMonthly} — not the current ${tier} product`);
    }
    return product;
  }

  const tagged = (await stripe.products.list({ active: true, limit: 100 }).autoPagingToArray({ limit: 1000 }))
    .filter((p) => p.metadata?.tier === tier);

  const matches: Stripe.Product[] = [];
  for (const product of tagged) {
    if (await hasCurrentUsdPrice(product.id)) matches.push(product);
  }

  if (matches.length !== 1) {
    const found = tagged.map((p) => `${p.id} (${p.name})`).join(', ') || 'none';
    throw new Error(
      `Expected exactly one active ${tier} product with an active USD monthly price of ${usdMonthly}; ` +
        `found ${matches.length}. Tagged active products: ${found}. ` +
        `Pass --${tier === 'pro' ? 'pro' : 'business'}-product prod_… explicitly.`,
    );
  }
  return matches[0];
}

async function addCurrencies(args: Args) {
  const currencies = args.currencies!;
  const mode = args.dryRun ? 'DRY RUN — no writes' : 'LIVE — creating prices';
  // sk_live_… and restricted rk_live_… keys alike.
  const keyKind = /_live_/.test(process.env.STRIPE_SECRET_KEY ?? '') ? 'live' : 'test';
  console.log(`Adding ${currencies.map((c) => c.toUpperCase()).join(', ')} prices to existing products (${mode}, ${keyKind} key)\n`);

  const products: Record<Tier, Stripe.Product> = {
    pro: await findExistingProduct('pro', args.proProduct),
    business: await findExistingProduct('business', args.businessProduct),
  };
  console.log(`Pro product:      ${products.pro.id} (${products.pro.name})`);
  console.log(`Business product: ${products.business.id} (${products.business.name})\n`);

  const envLines: string[] = [];
  for (const tier of ['pro', 'business'] as const) {
    const existing = await activePrices(products[tier].id);
    for (const currency of currencies) {
      for (const interval of ['month', 'year'] as const) {
        const amount = amountFor(CURRENCIES[currency], tier, interval);
        const key = envKey(tier, interval, currency);
        const reuse = existing.find((pr) => isPlainPrice(pr, currency, interval, amount));
        if (reuse) {
          console.log(`${key}: reusing existing ${reuse.id} (${amount} ${currency})`);
          envLines.push(`${key}=${reuse.id}`);
          continue;
        }
        if (args.dryRun) {
          console.log(`${key}: WOULD CREATE ${amount} ${currency} / ${interval} on ${products[tier].id}`);
          envLines.push(`${key}=<created on real run>`);
          continue;
        }
        const price = await stripe.prices.create({
          product: products[tier].id,
          currency,
          unit_amount: amount,
          recurring: { interval },
          metadata: { tier, billing: interval === 'month' ? 'monthly' : 'yearly', currency: currency.toUpperCase() },
        });
        console.log(`${key}: created ${price.id} (${amount} ${currency})`);
        envLines.push(`${key}=${price.id}`);
      }
    }
  }

  console.log('\n--- Add the following to .env.production ---');
  envLines.forEach((line) => console.log(line));
}

async function setupAll() {
  console.log('Creating Stripe products and multi-currency prices...\n');

  // ---- Pro Product ----
  const proProd = await stripe.products.create({
    name: 'AI Budget Pro',
    description:
      '200 AI requests/month, up to 3 accounts, 5 members per account, predictive analytics',
    metadata: { tier: 'pro' },
  });
  console.log(`Pro product: ${proProd.id}`);

  // ---- Business Product ----
  const bizProd = await stripe.products.create({
    name: 'AI Budget Business',
    description:
      'Unlimited AI requests, unlimited accounts & members, advanced reporting',
    metadata: { tier: 'business' },
  });
  console.log(`Business product: ${bizProd.id}\n`);

  // ---- Create prices for each currency ----
  const envLines: string[] = [];

  for (const [currency, amounts] of Object.entries(CURRENCIES)) {
    const suffix = currency.toUpperCase();
    console.log(`--- ${suffix} ---`);

    const pro = await createPrices(proProd.id, 'pro', currency, {
      monthly: amounts.pro_monthly,
      yearly: amounts.pro_yearly,
    });
    const monthlyKey = `STRIPE_PRO_MONTHLY_PRICE_ID_${suffix}`;
    const yearlyKey = `STRIPE_PRO_YEARLY_PRICE_ID_${suffix}`;
    console.log(`${monthlyKey}=${pro.monthly.id}`);
    console.log(`${yearlyKey}=${pro.yearly.id}`);
    envLines.push(`${monthlyKey}=${pro.monthly.id}`);
    envLines.push(`${yearlyKey}=${pro.yearly.id}`);

    const biz = await createPrices(bizProd.id, 'business', currency, {
      monthly: amounts.biz_monthly,
      yearly: amounts.biz_yearly,
    });
    const bizMonthlyKey = `STRIPE_BUSINESS_MONTHLY_PRICE_ID_${suffix}`;
    const bizYearlyKey = `STRIPE_BUSINESS_YEARLY_PRICE_ID_${suffix}`;
    console.log(`${bizMonthlyKey}=${biz.monthly.id}`);
    console.log(`${bizYearlyKey}=${biz.yearly.id}`);
    envLines.push(`${bizMonthlyKey}=${biz.monthly.id}`);
    envLines.push(`${bizYearlyKey}=${biz.yearly.id}`);
    console.log('');
  }

  console.log('--- Copy the following to your .env ---');
  envLines.forEach((line) => console.log(line));
}

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set');
  const args = parseArgs(process.argv.slice(2));
  if (args.currencies) await addCurrencies(args);
  else await setupAll();
}

main().catch((err) => {
  console.error('Failed to setup Stripe products:', err);
  process.exit(1);
});
