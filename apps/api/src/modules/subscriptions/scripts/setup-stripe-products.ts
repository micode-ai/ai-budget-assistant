/**
 * Setup Stripe products and prices for AI Budget Assistant subscriptions.
 *
 * Creates products (Pro, Business) and prices in multiple currencies (PPP-adjusted).
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... npx ts-node src/modules/subscriptions/scripts/setup-stripe-products.ts
 *
 * Run once per environment (test / live). Save the output price IDs to .env.
 */

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover',
});

/**
 * Multi-currency pricing table.
 * Amounts in smallest currency units (cents/groszy/kopecks).
 * Stripe requires lowercase currency codes.
 */
const CURRENCIES: Record<
  string,
  { pro_monthly: number; pro_yearly: number; biz_monthly: number; biz_yearly: number }
> = {
  usd: { pro_monthly: 999,   pro_yearly: 9588,   biz_monthly: 1999,  biz_yearly: 19188  },
  eur: { pro_monthly: 899,   pro_yearly: 8628,   biz_monthly: 1799,  biz_yearly: 17268  },
  pln: { pro_monthly: 2999,  pro_yearly: 28788,  biz_monthly: 5999,  biz_yearly: 57588  },
  gbp: { pro_monthly: 799,   pro_yearly: 7668,   biz_monthly: 1599,  biz_yearly: 15348  },
  uah: { pro_monthly: 19900, pro_yearly: 190900, biz_monthly: 39900, biz_yearly: 382900 },
  rub: { pro_monthly: 49900, pro_yearly: 478900, biz_monthly: 99900, biz_yearly: 958900 },
};

async function createPrices(
  productId: string,
  tier: 'pro' | 'business',
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

async function setup() {
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

setup().catch((err) => {
  console.error('Failed to setup Stripe products:', err);
  process.exit(1);
});
