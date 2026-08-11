# Conversion-Leak Audit — monetization & activation funnel

Why the app has ~0 paid conversions. Review only; no code changed. Prioritized.

## TL;DR — the big one
The **`Paywall` component is never mounted anywhere**. When a free user hits the AI limit, the server returns 403 and the app shows a generic "Sorry, I encountered an error" chat bubble. Users never see a paywall, a price, or an upgrade button. The upgrade path effectively does not exist at the moment of intent.

## Top 3 highest-impact fixes

### FIX 1 (High) — Paywall is a dead export, never rendered
- `apps/mobile/src/components/Paywall.tsx` is fully built but has **zero call sites** (no `<Paywall`, `showPaywall`, import anywhere).
- Result: AI-limit 403 in `chatStore.sendMessage` (`apps/mobile/src/stores/chatStore.ts:121-133`) is caught and shown as `errors.chatError`. The member-limit 403 in `account/invite.tsx` shows the raw API string. No upgrade CTA anywhere.
- **Fix:** mount `<Paywall>` in a Modal at the chat screen (and invite screen). Detect `error.status === 403`, set a `limitReached` flag, show the modal. Props contract `{ error, requiredTier, currentTier }` already exists.

### FIX 2 (High) — 7-day trial is invisible until checkout starts
- Stripe trial IS configured: `trial_period_days: 7` (`apps/api/src/modules/subscriptions/subscriptions.service.ts:238`).
- But it only appears as tiny tertiary text "7-day free trial" (`welcome.tsx:135`, `subscription.tsx:281`, `Paywall.tsx:80`). No "Start free trial" hero CTA, no countdown.
- Worse: trialing free users get only **5 AI requests** (`TRIAL_REQUEST_LIMITS`, `subscriptions.service.ts:24-28`) — too few to reach the aha moment before the trial ends.
- **Fix:** (a) CTA button = "Start 7-day free trial" + "-20% yearly" badge; (b) raise trial free AI limit from 5 to >=20 (needs product sign-off per CLAUDE.md); (c) add a T-3-day trial reminder (see Finding 8).

### FIX 3 (High) — AI-limit 403 surfaces as a generic error, not a conversion moment
- API returns 403 "AI request limit reached (50 per month). Upgrade…" (`subscriptions.service.ts:337`). `http-client.ts:118-127` attaches `.status=403` but `chatStore.ts:121-133` never reads it.
- The `subscription.limitReached` i18n key exists but is never used.
- **Fix:** in the catch block check `error.status === 403` → push a message using `subscription.limitReached` with an "Upgrade" button routing to `/subscription`. Turns a dead-end error into a conversion touchpoint.

## Full findings

| # | Finding | Severity | File:Line |
|---|---------|----------|-----------|
| 1 | `Paywall` never rendered — zero call sites | High | `src/components/Paywall.tsx` |
| 2 | 7-day trial invisible; trial free AI limit = 5 (too low) | High | `subscriptions.service.ts:24-28`, `welcome.tsx:135` |
| 3 | 403 AI-limit error shows as generic chat error, no CTA | High | `chatStore.ts:121-133`, `http-client.ts:118-127` |
| 4 | `@RequireTier` decorator used nowhere — Pro features entirely ungated | High | `require-tier.decorator.ts`, insights controllers |
| 5 | Plan features hardcoded English in API response, not i18n (PL users see English) | Med | `subscriptions.service.ts:141-148` |
| 6 | Pro account count inconsistent (service=3, i18n=5); no 80% usage nudge | Med | `subscriptions.service.ts:144`, `en.ts:1019` |
| 7 | Long registration + mandatory email verify before first value | Med | `register.tsx`, `verify-email.tsx` |
| 8 | Trial reminder fires only T-1 day, not T-3 | Med | `trial-reminder.cron.ts:27-36` |
| 9 | Paywall shows only price, no feature/benefit list | Low | `Paywall.tsx:52-78` |
| 10 | Annual plan not highlighted on subscription settings screen | Low | `subscription.tsx:260-278` |
| 11 | `AiUsageBadge` not in persistent chat tab header | Low | `(tabs)/chat.tsx`, `_layout.tsx` |

## Notable: Finding 4 — Pro features are free
`grep '@RequireTier'` returns zero endpoint usages. Fat Finder, spending story, AI insights, predictive analytics — all advertised as Pro on the plan cards — are callable by free users with no tier check. The paywall promises value the product gives away for free. Gating `POST /insights/story`, `/insights/fat-finder`, `/insights/ai-charts` with `@RequireTier('pro')` makes upgrading meaningful.
