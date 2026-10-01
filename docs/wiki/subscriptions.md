# Subscriptions

## What this is
The monetisation layer: Stripe-backed subscription plans (Free / Pro / Business), in-app paywall, server-side tier enforcement, and admin visibility into subscriber state.

## Entry points
- `apps/api/src/modules/subscriptions/` — subscription module (controller, service, `stripe-webhook.controller.ts` at `POST /webhooks/stripe`, `SubscriptionTierGuard`, `@RequireTier`, `trial-reminder.cron.ts`)
- `apps/mobile/src/stores/subscriptionStore.ts` — current subscription state: `loadSubscription()`, `loadUsage()`, `loadPlans()`, `createCheckout()`
- `apps/mobile/src/stores/upgradeStore.ts` + `src/components/UpgradeGate.tsx` — the app-wide upgrade sheet (see [upgrade-paywall](features/upgrade-paywall.md))
- `apps/mobile/app/subscription.tsx` — paywall screen
- `apps/mobile/src/components/Paywall.tsx` — the paywall body rendered inside `UpgradeGate`
- `apps/admin/src/app/subscriptions/` — admin subscriptions page

## Key concepts
- **Tiers** — `free | pro | business` (defined in `shared-types` as `SubscriptionTier`)
- **Stripe integration** — `STRIPE_SECRET_KEY` env var; API version pinned to `2026-01-28.clover` (must match SDK version in `package-lock.json`)
- **Webhook** — Stripe posts lifecycle events (checkout completed, subscription updated/cancelled) to `POST /webhooks/stripe` (outside the `/api/v1` prefix); the handler updates the user's `Subscription` row in Postgres
- **Paywall and tier gating** — the API refuses a gated endpoint with a `TIER_REQUIRED` 403; the caller opens the one shared sheet via `useUpgradeStore.getState().show()`. Detail, invariants and the P2002 upsert-race rule: [upgrade-paywall](features/upgrade-paywall.md). Prices: [subscription-pricing](features/subscription-pricing.md)
- **Admin view** — `/subscriptions` page shows current subscriber counts, tier distribution, and per-user subscription details

## Cross-references
- Talks to: Stripe API (checkout sessions, subscription management, webhooks)
- Used by: `ai-features` — AI usage limits depend on subscription tier
- Monitored by: `admin-dashboard` subscriptions page and dashboard KPI cards

## Where to look first
Webhook issues → `apps/api/src/modules/subscriptions/` service and Stripe dashboard. Mobile paywall flow → `apps/mobile/app/subscription.tsx` and `src/stores/subscriptionStore.ts`.
