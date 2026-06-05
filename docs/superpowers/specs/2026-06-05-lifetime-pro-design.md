# Lifetime Pro (Product Hunt offer) — Design

**Date:** 2026-06-05
**Issue:** ABA-203 (Product Hunt launch)
**Status:** Approved design — ready for implementation plan

## Context

For the Product Hunt launch we offer **Lifetime Pro for the first N hunters** as an
engagement booster. The offer is a **hybrid**:

- **Free** for the first `N_free` redeemers (gift).
- **Paid one-time (LTD)** for the next `N_paid` redeemers, then the offer closes.

Redemption uses a **single shared promo code** (e.g. `PRODUCTHUNT`) entered in the app,
guarded by a **global, durable, atomic counter**. The paid LTD uses a **single USD
one-time Stripe price + Adaptive Pricing** (auto-converts to local currency, same as the
existing subscription checkout).

Lifetime grants **Pro forever**: Pro features, Pro AI cap (300 requests/month, refreshing
monthly forever), Pro member/account limits. Lifetime is **not** unlimited AI.

### Why this approach (Approach A)

A generic promo-campaign model with a durable DB counter was chosen over a Redis-counter /
env-code minimal variant because the free-grant counter represents "live money" and must
survive restarts and be auditable. Redis here is `allkeys-lru` and could evict the counter.
A pure-Stripe approach was rejected: Stripe cannot express "free forever" as a subscription
nor "first N free".

## Architecture overview

```
Mobile paywall ── POST /subscriptions/redeem {code}
                      │
                      ├─ free slot available  → grantLifetime('ph_free')         → 200 {result:'granted'}
                      ├─ free exhausted, paid → Stripe checkout (mode:payment)   → 200 {result:'checkout', url}
                      │                            │
                      │                            └─ webhook checkout.session.completed (payment, kind:lifetime)
                      │                                 → grantLifetime('ph_paid') + increment paidRedeemed
                      └─ all exhausted        → 200 {result:'closed'}
```

## 1. Data model (Prisma)

Add to `Subscription` (lifetime marker — prevents webhook clobber, enables analytics):

```prisma
isLifetime        Boolean   @default(false) @map("is_lifetime")
lifetimeSource    String?   @map("lifetime_source")     // 'ph_free' | 'ph_paid'
lifetimeGrantedAt DateTime? @map("lifetime_granted_at")
```

New `PromoCampaign` (one row per campaign; for launch: `PRODUCTHUNT`):

```prisma
model PromoCampaign {
  id                String    @id @default(uuid())
  code              String    @unique
  grantTier         SubscriptionTier @default(pro) @map("grant_tier")
  freeLimit         Int       @default(0) @map("free_limit")
  paidLimit         Int       @default(0) @map("paid_limit")
  freeRedeemed      Int       @default(0) @map("free_redeemed")
  paidRedeemed      Int       @default(0) @map("paid_redeemed")
  stripePriceEnvKey String?   @map("stripe_price_env_key")  // 'STRIPE_LIFETIME_PRICE_ID'
  active            Boolean   @default(true)
  startsAt          DateTime? @map("starts_at")
  endsAt            DateTime? @map("ends_at")
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")
  redemptions       PromoRedemption[]
  @@map("promo_campaigns")
}
```

New `PromoRedemption` (one per user; audit + dedup + paid reconciliation):

```prisma
model PromoRedemption {
  id              String    @id @default(uuid())
  campaignId      String    @map("campaign_id")
  userId          String    @map("user_id")
  type            String    // 'free' | 'paid'
  status          String    @default("pending")  // 'pending' | 'completed'
  stripeSessionId String?   @map("stripe_session_id")
  completedAt     DateTime? @map("completed_at")
  createdAt       DateTime  @default(now()) @map("created_at")
  campaign        PromoCampaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  user            User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([campaignId, userId])
  @@map("promo_redemptions")
}
```

`type`/`status` are strings (not Prisma enums) to keep the migration light and match the
codebase style (`featureType` etc. are strings). User model gains a `promoRedemptions
PromoRedemption[]` back-relation.

Migration: `npx prisma migrate dev --name add_promo_campaigns`.

**Seeding:** the `PRODUCTHUNT` row is created by a small script
(`scripts/seed-promo-ph.ts`) or migration SQL seed, with `freeLimit` / `paidLimit` /
`stripePriceEnvKey` filled in just before launch.

## 2. Atomic counter (protects the free grant)

Free-slot claim is a single conditional UPDATE — atomic at row level in Postgres, no race,
no raw SQL:

```ts
const claimed = await prisma.promoCampaign.updateMany({
  where: { id: campaign.id, active: true, freeRedeemed: { lt: campaign.freeLimit } },
  data:  { freeRedeemed: { increment: 1 } },
});
// claimed.count === 1 → slot acquired; 0 → free slots exhausted
```

- **Free slots** increment here, synchronously — over-grant is impossible.
- **Paid slots** increment **only in the webhook on successful payment** (same conditional
  `updateMany` guard). At redeem time the paid limit is checked best-effort — slight
  over-issue of checkout links is acceptable (overage on paid = more revenue, and an
  abandoned checkout does not consume a slot).

## 3. Redemption flow — `POST /subscriptions/redeem { code, successUrl?, cancelUrl? }` (JWT)

```
1. Normalize code (trim + upper). Find campaign by code.
   none / !active / outside [startsAt, endsAt] → 400 invalid_or_expired
2. If user has an active RECURRING subscription (stripeSubscriptionId && status active)
   → 400 "already have an active subscription" (mirrors createCheckoutSession)
3. If subscription.isLifetime already true → 409 already_redeemed
4. Dedup on PromoRedemption(campaignId,userId):
   - completed     → 409 already_redeemed
   - pending(paid) → recreate checkout on the same row (user returned)
5. Attempt atomic FREE-slot claim (section 2):
   ✓ success → grantLifetime(userId,'ph_free', grantTier);
     upsert redemption{type:'free', status:'completed', completedAt};
     → 200 { result:'granted', tier, source:'free' }
6. Free exhausted → check paid (paidRedeemed < paidLimit && stripePriceEnvKey set):
   ✓ available → Stripe checkout mode:'payment',
     line_items:[{price: resolvePriceId(envKey), quantity:1}],
     adaptive_pricing:{enabled:true}, metadata:{userId, campaignId, kind:'lifetime'};
     upsert redemption{type:'paid', status:'pending', stripeSessionId};
     → 200 { result:'checkout', url }
7. Else → 200 { result:'closed' }
```

`grantLifetime(userId, source, tier)` private helper:

```
subscription.update: tier=tier(pro), status='active', isLifetime=true,
  lifetimeSource=source, lifetimeGrantedAt=now,
  stripeSubscriptionId=null, stripePriceId=null,
  currentPeriodEnd=null, cancelAtPeriodEnd=false, canceledAt=null
(keep stripeCustomerId — present on the paid path)
→ notificationsService.sendToUser(subscription_activated) + telegram ops notification
```

AI usage is untouched: `aiRequestsResetAt` keeps resetting monthly on its own.

## 4. Webhook (paid branch) + lifetime protection

`handleWebhookEvent` currently only handles `mode==='subscription'`. Add:

```
checkout.session.completed && session.mode === 'payment' && metadata.kind === 'lifetime':
  - find redemption by stripeSessionId (or campaignId+userId); if status==='completed' → skip (idempotent)
  - grantLifetime(userId, 'ph_paid', campaign.grantTier)
  - atomic increment paidRedeemed (updateMany guard)
  - redemption → status='completed', completedAt=now
  - notify payment_success + telegram
```

Downgrade protection:

- `handleSubscriptionDeleted`: if `subscription.isLifetime` → **skip** (never reset to free).
- `handleSubscriptionUpdated`: if `isLifetime` and the resolved tier is not higher → ignore;
  a genuine upgrade to `business` via a new recurring subscription is allowed.

## 5. Read surfaces & gating

- `getCurrent` adds `isLifetime`, `lifetimeSource`. Mobile shows "Pro · Lifetime" and
  **hides the manage-subscription button** (there is no recurring subscription to manage).
- AI limits / member / account limits: **unchanged** — `tier=pro` already yields Pro caps
  (300 AI/month, monthly reset). Lifetime ≠ unlimited.
- `GET /subscriptions/promo/:code` (JWT) → `{ valid, status: 'free'|'paid'|'closed',
  freeRemaining, paidRemaining }` — for PH urgency UI ("X of N free spots left").

## 6. Mobile (Expo) + i18n

- `subscriptions.api.ts`: `redeemPromo(code, urls?)`, `getPromoStatus(code)`.
- `subscriptionStore`: `isLifetime` in state; `redeemPromo` action with 3 outcomes
  (`granted` → refresh + success modal; `checkout` → open URL via `Linking` like existing
  checkout; `closed`/`invalid`/`already` → toast).
- `settings/subscription.tsx` / Paywall: "Have a promo code?" block (input + Redeem button),
  optional "X free spots left" line from `getPromoStatus`. Lifetime badge; hide manage
  button when `isLifetime`.
- i18n (all 8 locales): `promo.title`, `promo.placeholder`, `promo.redeem`,
  `promo.successFree`, `promo.checkoutOpening`, `promo.closed`, `promo.invalid`,
  `promo.alreadyRedeemed`, `subscription.lifetimeBadge`, `promo.freeSpotsLeft`.

## 7. Config, errors, tests

- **Env:** `STRIPE_LIFETIME_PRICE_ID` (one-time USD price). Created via an extension to
  `scripts/setup-stripe-products.ts` or manually in Stripe; added to `.env.example` +
  `.env.production`.
- **Errors:** invalid/expired → 400; already redeemed → 409; closed → 200 `{result:'closed'}`;
  Stripe not configured → 400; races covered by the atomic UPDATE.
- **Tests** (`subscriptions.service.spec.ts` + controller):
  - parallel claim: with `freeLimit=N` exactly N succeed, the rest → checkout/closed;
  - dedup: repeat redeem by same user → 409;
  - free-exhausted → checkout branch; paid-exhausted → closed;
  - webhook grants lifetime and is idempotent on sessionId;
  - `subscription.deleted` / `updated` do not reset a lifetime user.

## Implementation order (per CLAUDE.md dependency order)

1. `packages/shared-types` — `RedeemPromoDto`, `PromoStatusResponse`, `isLifetime` on subscription DTO
2. `apps/api/prisma/schema.prisma` — fields + 2 models, migrate + generate
3. `apps/api/src/modules/subscriptions` — service (`redeemPromo`, `grantLifetime`,
   `getPromoStatus`), controller endpoints, webhook payment branch, downgrade guards, dto
4. `apps/api` tests — service + controller specs
5. `apps/mobile/src/services/subscriptions.api.ts` — client methods
6. `apps/mobile/src/stores/subscriptionStore.ts` — state + `redeemPromo`
7. `apps/mobile/app/settings/subscription.tsx` (+ Paywall) — UI
8. `apps/mobile/src/i18n/locales/*.ts` — keys in all 8 locales
9. `scripts/seed-promo-ph.ts` + Stripe one-time price setup
10. finish-aba-task — issue + docs

## Open parameters (set before launch, do not block design)

- **N_free** and **N_paid** (e.g. 50 / 200).
- **LTD price** in USD (e.g. $49).
- **Offer window** (`endsAt`) — whether to auto-close by date.
- Confirm step-2 rule (block redeem when an active recurring subscription exists).
