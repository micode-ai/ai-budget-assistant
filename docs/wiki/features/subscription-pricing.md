# Subscription pricing

*Hub: [subscriptions](../subscriptions.md) · related: [marketing-site](marketing-site.md)*

## What this is

Where the Pro and Business prices live, how the displayed price relates to the price Stripe
actually charges, and the procedure for changing a live price. Current: Pro **$4.99/mo,
$29.99/yr** (cut from $9.99 in ABA-320); Business **$19.99/mo, $191.88/yr**.

## Entry points

- `apps/api/src/modules/subscriptions/pricing-data.json` — amounts in minor units + symbol, per
  currency
- `apps/api/src/modules/subscriptions/subscriptions.service.ts` — `getPlans()`,
  `resolvePriceId()`, `createCheckoutSession`
- `apps/api/src/modules/subscriptions/scripts/setup-stripe-products.ts`
- `docs/marketing/landing/build_landing.py` — builds the static `/pricing/` page from the JSON
- `apps/api/src/modules/admin/admin-metrics.util.ts` — `MRR_MONTHLY_USD`

## Key concepts

**Displayed and charged are two independent systems.** `getPlans()` amounts are cosmetic; the real
charge is a Stripe Price whose id comes from `STRIPE_{PRO,BUSINESS}_{MONTHLY,YEARLY}_PRICE_ID_{CUR}`
env vars. That stays env-driven on purpose — per-environment test/live ids, not a build constant.

**One JSON feeds three consumers:** `getPlans()`, the Stripe setup script, and the landing
generator (`json.load`, minor → major units).

## Invariants

**Import the JSON as a namespace.** `import * as pricingData from './pricing-data.json'` — the API
has `resolveJsonModule` but no `esModuleInterop`, so a default import compiles to `.default`, which
is `undefined` for a plain `require()`d JSON module. A shape spec in `subscriptions.service.spec.ts`
fails fast on a malformed edit.

**Regenerate the landing with the production env** —
`LANDING_BASE= ROBOTS="index,follow,max-image-preview:large" python docs/marketing/landing/build_landing.py`.
The env-less default builds a `noindex` preview over the committed production site.

**Never hardcode a yearly-discount percentage.** Pro and Business have different ratios (~50% vs
20%). The landing badge is fixed non-numeric copy; the mobile badge computes
`round((1 − yearly / (monthly × 12)) × 100)` live from `getPlans()`.

**Changing a live price is a five-step procedure**, because Stripe Prices are immutable:

1. Run `setup-stripe-products.ts` with the live key — ideally **inside the prod API container**
   (`docker cp` in, `docker exec -w /app/apps/api budget-api-prod node …`) so the secret never leaves
   the server. It creates new Products and Prices on **every** run; it is not idempotent.
2. Archive the old Products/Prices (`active: false`). Existing subscriptions keep renewing at the old
   price; archiving only blocks new checkouts.
3. Back up `.env.production`, then update all 24 `STRIPE_*_PRICE_ID_*` lines.
4. Force-recreate the `api` service (a restart does not reload `env_file`).
5. Edit `pricing-data.json`. Until that deploy lands, Stripe charges the new price while the app
   shows the old one.

**Find the old product by `metadata.tier` AND by its amounts.** A stray untagged legacy product
from an earlier pricing iteration exists and was deliberately left alone; `products.list().find()`
can grab the wrong one when a tier has more than one.

## Known gaps

- `MRR_MONTHLY_USD` in `admin-metrics.util.ts` is still a **hand-typed copy** of the prices, not read
  from `pricing-data.json` — a price change touches that file too. Every admin MRR figure prices
  through it (ABA-433).

## History

ABA-320 (price cut and Stripe migration) · tech-debt `pricing-table-triple-copy` (the JSON).
