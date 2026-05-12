# Subscriptions

## What this is
The monetisation layer: Stripe-backed subscription plans (Free / Pro / Business), in-app paywall, server-side tier enforcement, and admin visibility into subscriber state.

## Entry points
- `apps/api/src/modules/subscriptions/` — subscription module (controller, service, Stripe webhook handler)
- `apps/mobile/src/stores/subscriptionStore.ts` — current subscription state, `checkSubscription()`, `openPaywall()`
- `apps/mobile/app/subscription.tsx` — paywall screen
- `apps/mobile/src/components/Paywall.tsx` — reusable paywall modal component
- `apps/admin/src/app/subscriptions/` — admin subscriptions page

## Key concepts
- **Tiers** — `free | pro | business` (defined in `shared-types` as `SubscriptionTier`)
- **Stripe integration** — `STRIPE_SECRET_KEY` env var; API version pinned to `2026-01-28.clover` (must match SDK version in `package-lock.json`)
- **Webhook** — Stripe posts lifecycle events (checkout completed, subscription updated/cancelled) to a webhook endpoint in `subscriptions/`; handler updates the user's `subscriptionTier` in Postgres
- **Paywall** — `Paywall.tsx` is a modal; `subscriptionStore.openPaywall()` triggers it from anywhere in the app; gating logic checks `subscriptionStore.tier`
- **Admin view** — `/subscriptions` page shows current subscriber counts, tier distribution, and per-user subscription details

## Cross-references
- Talks to: Stripe API (checkout sessions, subscription management, webhooks)
- Used by: `ai-features` — AI usage limits depend on subscription tier
- Used by: `gamification` — some achievement rewards unlock pro features
- Monitored by: `admin-dashboard` subscriptions page and dashboard KPI cards

## Where to look first
Webhook issues → `apps/api/src/modules/subscriptions/` service and Stripe dashboard. Mobile paywall flow → `apps/mobile/app/subscription.tsx` and `src/stores/subscriptionStore.ts`.
