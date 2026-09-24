# Subscription manager — tracking the user's recurring charges

*Hub: [api](../api.md)*

## What this is

A tracker for the user's own subscriptions — Netflix, a gym, SaaS. **Not** our Stripe billing:
that is [subscriptions](../subscriptions.md). This module stores what the user pays other people,
reminds them before a renewal, and books each renewal as an expense.

## Entry points

- `apps/api/src/modules/user-subscriptions/` — service, controller,
  `subscription-renewal.cron.ts` (`addCycle`)
- Endpoints: `GET /user-subscriptions` (active first), `POST`, `PATCH :id`, `DELETE :id` (writes
  behind `ViewerBlockGuard`)
- Mobile: `src/stores/userSubscriptionStore.ts`, `app/subscriptions/{index,new,[id]}.tsx`,
  `src/components/subscriptions/SubscriptionCalendarView.tsx`, `src/hooks/useSubscriptionCalendar.ts`
- Entry points in the app: the Settings hub (`settingsRegistry.ts` / `SettingsHubMobile.tsx`), the
  `subscriptions` quick action, the desktop dashboard's attention panel and rail quick links, and
  Fat Finder's "Track this" on a subscription finding (pre-fills `new.tsx`)

## Key concepts

**`monthlyEquivalent` and `daysUntilRenewal` are computed at query time**, never stored
(yearly ÷ 12, quarterly ÷ 3, weekly × 52/12).

**Two daily crons.** 08:00 UTC `handleDueRenewals` books due renewals; 09:00 UTC sends a
`subscription_renewal` reminder to every account member three days ahead, gated by
`user.notifySubscriptionRenewals`.

**The calendar view** projects `nextRenewalDate` forward and back by the billing cycle to find every
renewal day in the displayed month — a weekly subscription can appear five times.

## Invariants

**Booking a renewal and advancing `nextRenewalDate` happen in one `$transaction`**, so a crash
cannot charge twice.

**At most one charge per subscription per run.** A long-overdue subscription catches up one period
a day rather than bursting.

**The booked expense is attributed to the account owner** (`accountMember role: 'owner'`), dated on
the renewal date, `source: 'manual'`.

## Known gaps

- The booked expense is `source: 'manual'`, so nothing distinguishes it from a hand-entered one.

## History

ABA-208 (the tracker) · ABA-209 (entry points — the screen shipped with none) · ABA-211 (auto-charge)
· ABA-259 (renewal calendar).
