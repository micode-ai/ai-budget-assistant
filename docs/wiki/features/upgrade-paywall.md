# Upgrade paywall and tier gating

*Hub: [subscriptions](../subscriptions.md) · related: [subscription-pricing](subscription-pricing.md)*

## What this is

How a free user meets a Pro feature: the API refuses with a structured `TIER_REQUIRED` 403 (or the
monthly AI-limit 403), and the app opens one shared upgrade sheet that starts Stripe checkout. Also
the trial limits and reminders around it.

## Entry points

- `apps/api/src/modules/subscriptions/guards/subscription-tier.guard.ts` — `SubscriptionTierGuard`
  (`TIER_HIERARCHY` ranking); `decorators/require-tier.decorator.ts` — `@RequireTier('pro' | 'business')`
- `apps/api/src/modules/subscriptions/subscriptions.service.ts` — `getOrCreateSubscription`,
  `TRIAL_REQUEST_LIMITS`, the AI-usage accounting
- `apps/api/src/modules/subscriptions/trial-reminder.cron.ts` — T-3 and T-1 trial reminders
  (push + email, `trialReminderIn3*` and siblings in `notification-i18n`)
- `apps/mobile/src/stores/upgradeStore.ts` — `visible`/`feature`/`requiredTier`, `show()`/`hide()`
- `apps/mobile/src/components/UpgradeGate.tsx` — the one modal, mounted once in `app/_layout.tsx`
- `apps/mobile/src/components/Paywall.tsx` — the sheet's body: plan, prices, trial badge, checkout
- `apps/mobile/app/subscription.tsx` — the full plans screen

## Key concepts

**Server side.** `@RequireTier('pro')` + `SubscriptionTierGuard` gate the paid endpoints; a higher
tier passes by numeric ranking, so Business satisfies Pro. A refusal throws
`{ message, requiredTier, currentTier, code: 'TIER_REQUIRED' }`. `grep -rn "@RequireTier(" apps/api/src`
for the current list — it includes `GET /insights/ai-charts`, `POST /insights/story`,
`POST /insights/fat-finder`, `POST /insights/real-salary/brief`, `POST /price-history/basket` and the
community-price reads.

**Client side.** There is no global interceptor: each caller that can receive the 403 calls
`useUpgradeStore.getState().show(featureText, tier)` itself — the AI chat monthly limit in
`chatStore.sendMessage`, Spending Story, Fat Finder, Analytics AI insights (where
`AiInsightsSection`'s `proGated` prop also renders a compact "Pro" lock), the member-invite limit in
`account/invite.tsx`, imports, the shopping list and others (`grep -rn "useUpgradeStore"`).
`UpgradeGate` renders `Paywall`, which loads plans, calls `subscriptionStore.createCheckout` and
opens the returned Stripe URL.

**Trial.** A trialing user's monthly AI limit comes from `TRIAL_REQUEST_LIMITS` (free trial: 50),
and `trial-reminder.cron` warns three days and one day before the trial ends.

## Invariants

**One modal, mounted once.** Features call `show()`; none mounts its own paywall. Duplicated
per-screen modals are what this replaced.

**A hot-path `upsert` on a unique key must catch P2002 and re-fetch (ABA-314).**
`getOrCreateSubscription` is the funnel for `getCurrent`, `getUsageStats` and every AI-limit check;
Prisma's `upsert` is not atomic, so a new user's parallel startup requests could both INSERT and one
crash `GET /subscriptions/usage` with P2002 on `userId`. It now catches P2002 and `findUnique`s the
row the concurrent request created. The same pattern applies to any such `upsert` in the codebase.

**Plan bullets come from local i18n**, `subscription.features.*`, never from the English
`features[]` strings `getPlans()` returns — those are not translated.

**Keep `user_docs/*/12-subscription.md` in sync** with what is gated: Story, Fat Finder and AI
insights were free before this and became Pro-only, which is a positioning change users read about.

## Known gaps

- Because each caller opts in, a new tier-gated endpoint shows the user a generic error until its
  caller is taught to call `show()`.
- `Paywall`'s checkout failure is only `console.error`ed — the user sees nothing happen.

## History

ABA-265/266 (shared paywall, tier gating) · ABA-314 (the P2002 upsert race).
