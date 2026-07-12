# Investor Metrics Endpoint — Design

**Date:** 2026-07-12
**Status:** Approved (design), pending implementation plan
**Scope:** New admin-only endpoint `GET /admin/metrics/investor` + admin UI page, computing the metrics an investor cares about for a consumer subscription fintech (retention, activation, engagement, growth, monetization) — grounded in data that already exists in Postgres. No mobile changes. No new DB tables.

## Motivation

The founder wants a defensible **traction signal for investors**. The existing `AdminAnalyticsService` computes scale/vanity numbers (total users, registrations, a crude MRR) but is missing the metrics that actually move an investor conversation and has a **wrong MRR** (hardcoded Pro = $9.99, ignores yearly plans). Specifically missing today:

- **Cohort retention** (the single most important consumer PMF signal) — not computed anywhere.
- **Activation rate** — not computed.
- **Honest MRR** — current value is stale and interval-blind.
- **ARPU/ARPPU, DAU/MAU stickiness, MoM growth %, revenue churn, gross margin** — not computed.
- **Market segmentation** (PL beachhead vs rest) — not computed.

## Locked definitions

- **Active on day D** = the user created ≥1 `Expense` OR `Income` with `createdAt` on day D, keyed by `userId` (the creator), deduped across all accounts a user belongs to. Transaction-based ("logging money" = using the core product). Chosen over a sync-based (`lastSyncAt`) definition because `lastSyncAt` is a single last-activity timestamp and cannot reconstruct a retention curve, and because a transaction-based definition is the honest consumer signal that survives due diligence.
- **Signup** = `User.createdAt`. All day boundaries are **UTC** (consistent with existing admin code).
- **Market segment** = `User.language`: `pl` → Polish cohort, everything else → `other`.
- **Paying user** = a `Subscription` with `tier IN (pro, business)` and `status = active` (trials are NOT revenue and are excluded from MRR/paying counts; reported separately).

### Aggregation conventions (pinned to avoid ambiguity)

- **Headline retention (W1/W4/W8)** = **pooled/weighted**, not an average of per-cohort rates: `Σ(users active in week n across qualifying cohorts) / Σ(sizes of qualifying cohorts)`. A cohort qualifies for week n only if its age ≥ (n+1) weeks.
- **`freeToPaidConversion`** denominator = **all registered users** (`payingUsers / totalUsers`), not just users with a `free` subscription row (lazy sub-row creation means not every user has one). Labeled as such in the UI.
- **Division-by-zero:** any ratio with a zero denominator returns `null` (rates that can legitimately be "not enough data": churn, trial→paid, MoM, gross margin) or `0` (ARPU/ARPPU/activation where a zero denominator means "no users"). Specified per-field in the DTO comments.

## Endpoint

`GET /admin/metrics/investor`

- **Guards:** `JwtAuthGuard + AdminGuard` (same as all other `/admin/*` routes).
- **Query params:**
  - `months` (default `6`, clamp `1..24`) — horizon for the growth series and the monetization month.
  - `weeks` (default `12`, clamp `1..26`) — number of signup cohorts in the retention triangle.
  - `activationDays` (default `3`, clamp `1..30`) — activation window.
- **Caching:** Redis key `admin:investor-metrics:{months}:{weeks}:{activationDays}` TTL 3600s (queries are full-table scans; refresh is not time-critical). Reuse the global `CacheService`.
- **Response:** `AdminInvestorMetricsResponse` (see DTO below).

## Response shape (DTO)

Declared in `packages/shared-types/src/dto/admin-metrics.ts`, imported **type-only** into the API (repo rule: no runtime import of `@budget/shared-*` from `apps/api`).

```ts
export interface CohortRetentionRow {
  cohortWeekStart: string;   // ISO date (Monday) of the signup week
  cohortSize: number;        // users who signed up that week
  // retention[n] = fraction (0..1) of the cohort active in their n-th week of life.
  // null where the cohort is too young to have completed week n.
  retention: Array<number | null>;
}

export interface RetentionBlock {
  weekly: CohortRetentionRow[];      // most-recent cohort last
  headline: {                        // aggregate over cohorts old enough to qualify
    w1: number | null;
    w4: number | null;
    w8: number | null;
  };
}

export interface ActivationBlock {
  windowDays: number;                // echo of activationDays
  cohortSize: number;                // signups eligible (old enough for the window)
  activatedWithinWindow: number;
  activationRate: number;            // 0..1
  everActivatedRate: number;         // logged ≥1 transaction ever, same cohort
}

export interface EngagementBlock {
  dau: number;
  wau: number;
  mau: number;
  dauMauRatio: number;               // 0..1 stickiness
}

export interface GrowthPoint {
  period: string;                    // 'YYYY-MM' (monthly) — one entry per month incl. empty
  newUsers: number;
}

export interface GrowthBlock {
  monthly: GrowthPoint[];
  momGrowthRate: number | null;      // last full month vs previous, fraction
}

export interface MonetizationBlock {
  mrrUsd: number;                    // honest, interval-normalized, USD (approx for non-USD)
  mrrApproximate: boolean;           // true if any paying sub is non-USD
  payingUsers: number;
  trialingUsers: number;
  arpuUsd: number;                   // mrr / total active users (MAU)
  arppuUsd: number;                  // mrr / paying users
  freeToPaidConversion: number;      // cumulative: payingUsers / totalUsers
  trialToPaidConversion: number | null; // of ended trials, fraction that became active paid
  logoChurnMonthly: number | null;   // canceled this month / paying at month start
  revenueChurnMonthly: number | null;// MRR lost this month / MRR at month start
  aiCogsUsd: number;                 // estimated AI cost for the month (usageLog)
  grossMargin: number | null;        // (mrr - aiCogs) / mrr
}

export interface SegmentMetrics {
  segment: 'pl' | 'other';
  users: number;
  retentionHeadline: { w1: number | null; w4: number | null; w8: number | null };
  activationRate: number;
  freeToPaidConversion: number;
  mrrUsd: number;
}

export interface ScaleContext {
  totalUsers: number;
  totalAccounts: number;
  totalTransactions: number;         // expenses + incomes, non-deleted
}

export interface AdminInvestorMetricsResponse {
  generatedAt: string;               // ISO
  params: { months: number; weeks: number; activationDays: number };
  retention: RetentionBlock;
  activation: ActivationBlock;
  engagement: EngagementBlock;
  growth: GrowthBlock;
  monetization: MonetizationBlock;
  segments: SegmentMetrics[];        // [pl, other]
  scale: ScaleContext;
}
```

## Architecture

Follows the repo's "pure calculator + thin IO service" pattern (`safe-to-spend.util.ts`, `wrapped.util.ts`, `settle-up-calculator.ts`, `community-price-calculator.ts`).

### Pure functions — `modules/admin/admin-metrics.util.ts`

All correctness lives here and is unit-tested. No Prisma, no I/O — takes plain arrays, returns plain objects. Uses **injected `now`** (no `Date.now()` inside) so tests are deterministic.

- `buildActivityDayIndex(events: {userId; day: string}[]) → Map<userId, Set<dayISO>>` — the shared active-days index used by retention/activation/engagement. `events` is the union of expense+income `(userId, createdAt→UTC day)`.
- `computeWeeklyRetention(signups: {userId; createdAt}[], activity, weeks, now) → RetentionBlock` — buckets users into signup weeks (Monday-anchored via the same Monday helper convention already in the codebase), computes per-cohort week-N retention and the headline aggregate. Week-N counted only for cohorts whose age ≥ (n+1) weeks.
- `computeActivation(signups, activity, windowDays, now) → ActivationBlock`.
- `computeEngagement(activity, now) → EngagementBlock` — DAU (today), WAU (7d), MAU (30d), ratio.
- `computeGrowth(signups, months, now) → GrowthBlock` — monthly buckets + MoM.
- `normalizeMrr(subs: PaidSubRow[]) → { mrrUsd; approximate; payingUsers }` — per sub: interval = (`currentPeriodEnd − currentPeriodStart` > 45 days ? yearly : monthly; if either period bound is null, default to `monthly`); monthly USD from `MRR_MONTHLY_USD[tier][interval]`; sum. Currency of a sub = the subscriber's `user.currencyCode`; the amount is always taken from the USD price map regardless, and `approximate = true` if **any** paying sub has `currencyCode !== 'USD'`. (`PaidSubRow` carries `tier`, `currentPeriodStart`, `currentPeriodEnd`, `currencyCode`.)
- `computeChurn(...)`, `computeConversion(...)`, `computeSegment(...)` — small helpers.

`MRR_MONTHLY_USD` const (documented as the **4th copy** of pricing — the repo already warns pricing lives in 3 unsynced places; keep in sync when prices change):

```ts
const MRR_MONTHLY_USD = {
  pro:      { monthly: 4.99, yearly: 29.99 / 12 },
  business: { monthly: 19.99, yearly: 191.88 / 12 },
};
```

### IO service — `modules/admin/admin-investor-metrics.service.ts`

A **4th focused admin service** (alongside `AdminService`, `AdminAnalyticsService`, `AdminNotificationService`) so `AdminAnalyticsService` (already 307 lines) is not bloated. Injects `PrismaService` + `CacheService`. Responsibilities:

1. Check Redis cache; on miss, run queries.
2. Queries (all filtered to non-deleted / active where relevant):
   - `user`: `id, createdAt, language` (all users, or windowed to the max lookback).
   - `expense` + `income`: `userId, createdAt` over the lookback window (union → activity events). `isDeleted: false`.
   - `subscription`: `tier, status, currentPeriodStart, currentPeriodEnd, trialStart, trialEnd, canceledAt, createdAt, userId` + join `user.language`, `user.currencyCode`.
   - `usageLog`: `featureType, createdAt` for the monetization month (COGS) — reuse `estimateCost` exported from `admin-analytics.service.ts`.
   - counts for scale context.
3. Map rows → pure-function inputs, assemble `AdminInvestorMetricsResponse`, cache, return.

### Controller

Add to the existing `AdminController`:

```ts
@Get('metrics/investor')
getInvestorMetrics(@Query() q: InvestorMetricsQueryDto) {
  return this.investorMetrics.getInvestorMetrics(q);
}
```

Inject `AdminInvestorMetricsService` directly (controller already injects the three admin services — no facade). Register the new service as a provider in `AdminModule`.

## Admin UI — `apps/admin`

New page `app/metrics/page.tsx` (App Router), linked from the admin nav. React Query hook `src/hooks/use-investor-metrics.ts` calling the ky client. Layout:

- **Headline cards row:** W4 retention, activation rate, MRR, MoM growth, DAU/MAU, gross margin.
- **Cohort retention heatmap:** table, rows = signup weeks, cols = week-0..N, cell shading by retention value, cohort size shown per row.
- **Growth chart:** Recharts line/bar of monthly new users.
- **Monetization cards:** MRR (with `approximate` badge), ARPU/ARPPU, free→paid, trial→paid, churn (logo + revenue), gross margin with AI COGS breakdown.
- **Segment toggle:** `PL / Other` switch re-rendering the headline/activation/conversion/MRR blocks from `segments`.

No shared-component churn; reuse existing shadcn card/table primitives and the Recharts setup already in the dashboard.

## Edge cases & caveats (baked in)

- **Small-N cohorts:** always show cohort size next to each retention row; never hide N — investor honesty. No suppression, but the UI greys rows with `cohortSize < 5`.
- **Immature cohorts:** week-N retention and activation only counted for cohorts/signups old enough for the window; otherwise `null` / excluded from denominator.
- **Multi-account users:** dedupe activity by `userId`.
- **Non-USD MRR:** normalized to the USD price point; `mrrApproximate` flag set. Precise per-currency MRR from Stripe amounts is deferred (Phase 2).
- **Timezone:** UTC day boundaries throughout.
- **Performance:** full-table scans acceptable at current scale; Redis-cached 1h. If the corpus grows, move to a materialized daily-activity rollup (Phase 2).

## Testing

- **Unit tests** `admin-metrics.util.spec.ts` covering: weekly-cohort bucketing (incl. Monday anchoring), retention triangle with immature-cohort `null`s, activation window edges, DAU/WAU/MAU, MoM growth, MRR normalization (monthly vs yearly interval inference, mixed currency → approximate), churn and conversion, segment split. Deterministic via injected `now`.
- Service/controller: a light spec asserting cache hit/miss and guard wiring (mirrors existing admin specs).

## Explicitly out of scope (YAGNI)

- **CAC / LTV:CAC / payback** — requires marketing-spend data not in the DB. ARPPU + churn are exposed so LTV can be derived once churn stabilizes.
- **K-factor / referral virality** — referral data exists but adds scope; Phase 2.
- **Mobile changes** — none. Admin-only.
- **Precise per-currency MRR from Stripe** — Phase 2.

## Follow-ups (Phase 2)

- Materialized daily-activity rollup table if scans get slow.
- Per-currency MRR from Stripe live amounts.
- Referral K-factor block.
- CSV/PNG export of the metrics page for pitch decks.
