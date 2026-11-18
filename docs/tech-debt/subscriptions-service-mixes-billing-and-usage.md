---
id: subscriptions-service-mixes-billing-and-usage
title: 'subscriptions.service.ts mixes Stripe billing lifecycle with AI usage metering'
status: closed
priority: P2
module: 'apps/api'
created_at: 2026-09-08
orchestration_run: 49c47aba-153f-4700-b07b-251549689e29
---

# subscriptions.service.ts mixes Stripe billing lifecycle with AI usage metering

## What's wrong

`apps/api/src/modules/subscriptions/subscriptions.service.ts` is 721 lines covering two largely independent concerns in one class: (1) Stripe billing lifecycle — `getOrCreateStripeCustomer`, `createCheckoutSession`, `createPortalSession`, `handleWebhookEvent` and its four private handlers (`handleSubscriptionUpdated`, `handleSubscriptionDeleted`, `handleInvoicePaid`, `handlePaymentFailed`), `resolveTierFromPrice`, `mapStripeStatus` — and (2) AI usage metering/quota enforcement — `trackAiUsage`, `checkMemberLimit`, `getUsageStats`, `getUsageDetails`, `resetUsageIfNeeded`, `logUsage`, `recordAdditionalUsage`. `getOrCreateSubscription`/`getCurrent` are the only methods genuinely shared by both halves.

## Why it matters

The two halves have unrelated failure modes and unrelated callers: the billing half is driven by Stripe webhooks and mutates `status`/`tier`/`stripeSubscriptionId`, while the usage half is called from every AI-consuming module (`AiUsageGuard`, OCR, chat, receipt re-reads) on the hot path of a user request and has nothing to do with Stripe. Keeping them in one class means a change to webhook handling (e.g. adding a new Stripe event type) sits next to, and risks merge conflicts with, usage-quota changes that ship far more often (this file is already referenced by name in `pricing-table-triple-copy.md` and `ocr-reread-cost-not-tracked.md` for unrelated reasons, both signs of high traffic through one file). This module is exactly the shape the codebase has already split elsewhere for the same reason (`chat.service.ts` → `ai-tools.service.ts`/`prompt-builder.service.ts`/`user-context-builder.service.ts`; `admin.service.ts` → four focused admin services; `expenses.service.ts` → `ExpenseBulkService`/`ExpenseCrossAccountService`).

## Proposed fix

- Extract the Stripe-facing methods (`getOrCreateStripeCustomer`, `createCheckoutSession`, `createPortalSession`, `handleWebhookEvent` + its 4 private handlers, `resolveTierFromPrice`, `mapStripeStatus`) into a new `StripeBillingService`.
- Extract the usage-metering methods (`trackAiUsage`, `checkMemberLimit`, `getUsageStats`, `getUsageDetails`, `resetUsageIfNeeded`, `logUsage`, `recordAdditionalUsage`) into a new `UsageTrackingService`.
- Keep `getOrCreateSubscription`/`getCurrent` on `SubscriptionsService` (or promote to a small shared leaf both new services inject), since both halves need the current-subscription row.
- Update `SubscriptionsController`/`StripeWebhookController`/`AiUsageGuard` and any other injector to depend on the new, narrower services directly — same "controller injects the new service directly" precedent used in the `chat.service.ts`/`admin.service.ts`/`expenses.service.ts` splits.
- Split `subscriptions.service.spec.ts` 1:1 with the new services, mirroring how the other splits moved their tests.

## Files involved

- `apps/api/src/modules/subscriptions/subscriptions.service.ts`
- `apps/api/src/modules/subscriptions/subscriptions.service.spec.ts`
- `apps/api/src/modules/subscriptions/subscriptions.controller.ts`
- `apps/api/src/modules/subscriptions/stripe-webhook.controller.ts`
