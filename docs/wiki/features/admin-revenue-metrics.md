# Admin revenue metrics

*Hub: [admin-dashboard](../admin-dashboard.md) · related:
[subscription-pricing](subscription-pricing.md), [acquisition-tracking](acquisition-tracking.md)*

## What this is

The admin panel's money and growth numbers: investor metrics (retention, activation, MRR,
conversion, churn, margin), the acquisition breakdown, and the rule that separates admin-granted
("comped") tiers from real revenue.

## Entry points

- `apps/api/src/modules/admin/admin-metrics.util.ts` — pure, unit-tested: `normalizeMrr`,
  `toMrrRows`, `MRR_MONTHLY_USD`
- `apps/api/src/modules/admin/admin-comped.util.ts` — `isComplimentarySub`, `isStripePaidSub`,
  `COMPED_SUB_WHERE`, `PAID_SUB_WHERE`
- `apps/api/src/modules/admin/admin-investor-metrics.service.ts` — `GET /admin/metrics/investor`
- `apps/api/src/modules/admin/admin-analytics.service.ts` — dashboard KPIs, `getAnalyticsOverview`,
  `getSubscriptionStats`, `getAcquisitionBreakdown`
- Admin UI: `apps/admin/src/app/metrics/page.tsx`, `apps/admin/src/app/acquisition/page.tsx`,
  `apps/admin/src/hooks/use-investor-metrics.ts`, `use-acquisition.ts`,
  `apps/admin/src/components/users/ChangeTierDialog.tsx`

## Key concepts

**A comp is "active paid tier with no Stripe subscription id".** `stripeSubscriptionId` is written in
exactly one place — the Stripe webhook's `handleSubscriptionCreated` — while an admin tier change
sets only `tier` and `status`. So the predicate identifies the granted set exactly, retroactively
for grants already made, needs no column or migration, and self-heals if the user later pays.
`handleSubscriptionDeleted` nulls the id **and** resets the tier to free, so a churned payer can
never read as a comp. On prod, all 7 active Business subscriptions were grants and there were zero
Stripe-paid subs: the dashboard had been reporting $139.93/mo of revenue that did not exist.

**Investor metrics (ABA-340)** come from existing tables, admin-only, cached 1 h per parameter set.
Definitions: *active* = created ≥1 expense/income that UTC day; trials are excluded from MRR and
paying users; `totalUsers` and the free→paid denominator are all registered users. MRR infers the
interval from `currentPeriodEnd − currentPeriodStart` (> 45 days ⇒ yearly ÷ 12), USD-normalized with
an `mrrApproximate` flag when a sub is non-USD. Also: weekly cohort retention, 3-day activation,
DAU/WAU/MAU, MoM growth, ARPU/ARPPU, AI-COGS gross margin, PL/other language segments. Every card
carries an `InfoHint` tooltip (ABA-341).

**Acquisition (ABA-452)** groups signups in a 1–365 day window by the four `acquisition*` columns.
A NULL is bucketed as `'direct'`, never dropped — it is a legitimate "unknown".

## Invariants

**Comped users are excluded from every revenue figure** — investor MRR, paying users, ARPPU,
conversion (a post-trial grant is not a conversion), segment MRR, and both legacy calculations,
which moved from `count()` to rows through `normalizeMrr` (fixing the comp inflation, a stale
hardcoded $9.99 and an ignored yearly interval together). Comped users and comped MRR are reported
separately, and the dashboard MRR card explains the corrected number rather than silently shrinking.

**The predicate and its Prisma `where` live in one file.** A counting query and an in-memory filter
that disagree is the failure mode being guarded. The predicates are **nullish-tolerant, not
`=== null`** — an absent field (a narrowed select) would otherwise read as *paying*, failing in the
direction that inflates revenue. The `where` literals are deliberately **not** `as const`: Prisma's
types reject the readonly array it produces.

**Paying and comped rows go through ONE mapper** (`toMrrRows`) so they stay comparable. Do not add a
second.

**The raw `stripeSubscriptionId` never leaves the service** — `GET /admin/users` returns only a
computed `isComplimentary`, and its `billing=paying|comped` filter composes with `tier`.

**Churn is count-based.** Cancel resets `tier → free` and `stripePriceId → null`, discarding the
pre-cancel tier, so logo churn is exact but revenue churn is `null`.

**`normalizeMrr` returns the exact sum**; cents rounding happens once at the service boundary, and
ARPU/ARPPU derive from the exact value.

**All MRR prices through `MRR_MONTHLY_USD`**, which is itself a hand-typed copy of the price table —
see [subscription-pricing](subscription-pricing.md).

**The admin `formatPercent` prefixes `+`** for deltas; the metrics page uses a local formatter for
non-delta stats. The shadcn `Tooltip` is aliased `UITooltip` to avoid recharts' `Tooltip`.

## Known gaps

- A Stripe Pro payer hand-upgraded to Business keeps a non-null id and counts as paying at the
  Business price; closing that needs an explicit flag.
- Revenue churn needs a pre-cancel tier snapshot.
- CAC and LTV:CAC need marketing spend, which is not in the database; no referral K-factor yet.

## History

ABA-340 (investor metrics) · ABA-341 (tooltips) · ABA-433 (comped tiers) · ABA-452 (acquisition).
