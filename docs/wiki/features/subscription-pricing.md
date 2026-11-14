# Subscription pricing

*Hub: [subscriptions](../subscriptions.md) · related: [marketing-site](marketing-site.md)*

## What this is

Where the Pro and Business prices live, how the displayed price relates to the price Stripe
actually charges, and the procedure for changing a live price. Current: Pro **$4.99/mo,
$29.99/yr** (cut from $9.99 in ABA-320); Business **$19.99/mo, $191.88/yr**.

Per-currency amounts (PPP-adjusted) are the rows of `pricing-data.json`. Brazil (added after
ABA-755 made BRL an app currency): Pro **R$14,90/mo, R$89,90/yr**, Business **R$59,90/mo,
R$575,04/yr**, shown as `R$14,90` — prefix symbol, no space, comma decimals — the same form the
app's `formatCurrency(…, 'BRL')` renders. Every other currency keeps the legacy
`${symbol}${amount.toFixed(2)}` display (`zł14.99`); `formatPlanAmount` holds the per-currency rule.

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
generator (`json.load`, minor → major units). The landing maps a page language to a currency in
`LANG_CURRENCY` (`br` → BRL) and formats it through `CURRENCY_FORMAT`.

**Which currency a user is offered.** `getPlans()` uses `user.currencyCode` through
`resolvePlanCurrency()`: the user's currency when `pricing-data.json` has a row for it AND — when
Stripe is configured — all four of its `STRIPE_*_PRICE_ID_{CUR}` env vars are set; otherwise USD.
The checkout receives back the `priceEnvKey` that `getPlans()` handed out, so this is what keeps
the displayed currency equal to the charged one.

**Checkout accepts only an offered key.** `POST /subscriptions/checkout` takes a price env KEY
from the client. The DTO allows only `STRIPE_(PRO|BUSINESS)_(MONTHLY|YEARLY)_PRICE_ID_XXX`, and
`createCheckoutSession` then refuses (400) anything outside `offeredPriceEnvKeys(user.currencyCode)`:
the four keys of `resolvePlanCurrency()`'s currency plus the four USD keys. Without that, a user
could pay a cheaper market's PPP price they were never offered, or name any env var (`JWT_SECRET`)
and have its value sent to Stripe.

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

**Never offer a currency Stripe cannot charge in.** A row in `pricing-data.json` without its
four env vars shows USD, not local prices (`resolvePlanCurrency()`, warned once per currency per
process). This also makes the deploy order safe — the JSON row can ship before the Stripe prices
exist. `resolvePriceId()` does an exact lookup only: the old fallback to the un-suffixed
`STRIPE_*_PRICE_ID` key was removed, because it charged in whatever currency that bare price was in.

**Checkout may still show a local currency.** `createCheckoutSession` sets
`adaptive_pricing: { enabled: true }`, so Stripe Checkout can present a converted amount in the
customer's own currency at Stripe's rate — e.g. a USD plan shown in reais to a Brazilian card. The
Stripe Price's currency, the one `getPlans()` displayed, is what the subscription is priced in;
copy must not promise that the Checkout page shows that currency.

**Webhook tier resolution covers every JSON currency.** `resolveTierFromPrice` checks
`STRIPE_*_PRICE_ID_{CUR}` for each currency in `pricing-data.json` (plus the un-suffixed keys),
then falls back to the Stripe price's `metadata.tier`.

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

**Adding a currency to the live products is not a repricing.** It adds Prices to the existing
Products and touches nothing else:

1. Add the row to `pricing-data.json` and deploy. Until step 3 the gate keeps that currency's
   users on USD.
2. In the prod API container (the compiled script ships in the image, and `STRIPE_SECRET_KEY` is
   already in its env):
   `docker exec -w /app/apps/api budget-api-prod node dist/modules/subscriptions/scripts/setup-stripe-products.js --currency BRL --dry-run`,
   check the two products it picked and the four prices it would create, then run it again without
   `--dry-run`. It prints the four env lines.
3. Back up `.env.production`, append those four lines, force-recreate `api`.

`--currency` (alias `--only`, comma-separated, deduplicated) creates no Product and no other
currency's prices, and re-running it reuses a matching price — active, `recurring`,
`interval_count` 1, `licensed`, same currency/interval/amount — instead of creating a duplicate. It
finds each Product by `metadata.tier` AND an active USD monthly price equal to
`pricing-data.json`'s, and aborts on zero or several matches; `--pro-product prod_…
--business-product prod_…` overrides, and the override must pass the same USD-price check.
Without flags the script is the old full setup, which is NOT idempotent.

**Find the old product by `metadata.tier` AND by its amounts.** A stray untagged legacy product
from an earlier pricing iteration exists and was deliberately left alone; `products.list().find()`
can grab the wrong one when a tier has more than one.

## Known gaps

- `MRR_MONTHLY_USD` in `admin-metrics.util.ts` is still a **hand-typed copy** of the prices, not read
  from `pricing-data.json` — a price change touches that file too. Every admin MRR figure prices
  through it (ABA-433).

## History

ABA-320 (price cut and Stripe migration) · tech-debt `pricing-table-triple-copy` (the JSON).
