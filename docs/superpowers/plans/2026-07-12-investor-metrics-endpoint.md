# Investor Metrics Endpoint — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `GET /admin/metrics/investor` — an admin-only endpoint that computes cohort retention, activation, engagement (DAU/MAU), MoM growth, honest interval-normalized MRR, ARPU/ARPPU, conversion, churn, and gross margin, with a PL/other market split, plus an admin UI page to view them.

**Architecture:** Pure calculator (`admin-metrics.util.ts`, fully unit-tested) holds all correctness; a thin 4th focused admin service (`AdminInvestorMetricsService`) does Prisma IO + Redis caching + assembly + segment partitioning; the existing `AdminController` exposes one route; the admin Next.js app gets a `/metrics` page. No new DB tables, no mobile changes.

**Tech Stack:** NestJS 10, Prisma 5, ioredis (via `CacheService`), Jest; admin: Next.js 16 App Router, React Query 5, ky, Recharts, shadcn/ui.

## Global Constraints

- **No runtime import of `@budget/shared-*` in `apps/api`** — the new DTO is imported **type-only** (`import type`). (Repo rule; a runtime import crash-loops prod.)
- **All day/week/month boundaries are UTC.**
- **Trials are excluded from MRR and `payingUsers`** (reported separately as `trialingUsers`).
- **`MRR_MONTHLY_USD` is the 4th copy of the pricing table** — values must match `subscriptions.service.ts` `PRICING`. Current live prices: Pro $4.99/mo, $29.99/yr; Business $19.99/mo, $191.88/yr. Add a comment saying so.
- **Guards are inherited** from `AdminController`'s class-level `@UseGuards(JwtAuthGuard, AdminGuard)` — do NOT re-declare per-method.
- **Dedupe all activity by `userId`** (a user may belong to multiple accounts).
- **Admin-only.** No new DB tables (`prisma/schema.prisma` untouched).
- Retention uses **calendar-aligned weekly cohorts** (cohort = Monday-anchored signup week; week-n window = `[cohortStart + 7n, cohortStart + 7(n+1))`).

---

### Task 1: Shared-types DTO

**Files:**
- Create: `packages/shared-types/src/dto/admin-metrics.ts`
- Modify: `packages/shared-types/src/dto/index.ts` (add barrel export)

**Interfaces:**
- Produces: `AdminInvestorMetricsResponse`, `CohortRetentionRow`, `RetentionBlock`, `ActivationBlock`, `EngagementBlock`, `GrowthPoint`, `GrowthBlock`, `MonetizationBlock`, `SegmentMetrics`, `ScaleContext` — consumed by Tasks 8, 9, 10.

- [ ] **Step 1: Create the DTO file**

Create `packages/shared-types/src/dto/admin-metrics.ts`:

```ts
export interface CohortRetentionRow {
  cohortWeekStart: string; // ISO date (Monday, UTC) of the signup week
  cohortSize: number;
  retention: Array<number | null>; // retention[n] = fraction (0..1) active in week n; null if week n not fully elapsed
}

export interface RetentionBlock {
  weekly: CohortRetentionRow[]; // most-recent cohort last
  headline: { w1: number | null; w4: number | null; w8: number | null }; // pooled across qualifying cohorts
}

export interface ActivationBlock {
  windowDays: number;
  cohortSize: number; // signups old enough for the window, within the last 90d
  activatedWithinWindow: number;
  activationRate: number; // 0..1
  everActivatedRate: number; // 0..1
}

export interface EngagementBlock {
  dau: number;
  wau: number;
  mau: number;
  dauMauRatio: number; // 0..1
}

export interface GrowthPoint {
  period: string; // 'YYYY-MM'
  newUsers: number;
}

export interface GrowthBlock {
  monthly: GrowthPoint[]; // oldest first, includes current partial month
  momGrowthRate: number | null; // last complete month vs previous complete month
}

export interface MonetizationBlock {
  mrrUsd: number;
  mrrApproximate: boolean;
  payingUsers: number;
  trialingUsers: number;
  arpuUsd: number; // mrr / MAU (0 if MAU 0)
  arppuUsd: number; // mrr / payingUsers (0 if 0)
  freeToPaidConversion: number; // payingUsers / totalUsers (0 if 0)
  trialToPaidConversion: number | null; // ended trials that became active paid; null if no ended trials
  logoChurnMonthly: number | null;
  revenueChurnMonthly: number | null;
  aiCogsUsd: number;
  grossMargin: number | null; // (mrr - aiCogs) / mrr; null if mrr 0
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
  totalTransactions: number;
}

export interface AdminInvestorMetricsResponse {
  generatedAt: string; // ISO
  params: { months: number; weeks: number; activationDays: number };
  retention: RetentionBlock;
  activation: ActivationBlock;
  engagement: EngagementBlock;
  growth: GrowthBlock;
  monetization: MonetizationBlock;
  segments: SegmentMetrics[]; // [pl, other]
  scale: ScaleContext;
}
```

- [ ] **Step 2: Add the barrel export**

In `packages/shared-types/src/dto/index.ts`, add after line 20 (`export * from './admin';`):

```ts
export * from './admin-metrics';
```

- [ ] **Step 3: Verify it typechecks**

Run: `npm run typecheck`
Expected: PASS (no errors introduced).

- [ ] **Step 4: Commit**

```bash
git add packages/shared-types/src/dto/admin-metrics.ts packages/shared-types/src/dto/index.ts
git commit -m "feat(shared-types): investor metrics DTOs"
```

---

### Task 2: Util helpers + activity index

**Files:**
- Create: `apps/api/src/modules/admin/admin-metrics.util.ts`
- Test: `apps/api/src/modules/admin/admin-metrics.util.spec.ts`

**Interfaces:**
- Produces: `utcDay(d: Date): string`, `utcMonday(d: Date): Date`, `subInterval(start: Date|null, end: Date|null): 'monthly'|'yearly'`, `MRR_MONTHLY_USD`, `SignupRow`, `ActivityEvent`, `PaidSubRow`, `buildActiveDays(events: ActivityEvent[]): Map<string, Set<string>>` — consumed by Tasks 3–8.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/admin/admin-metrics.util.spec.ts`:

```ts
import { utcDay, utcMonday, subInterval, buildActiveDays } from './admin-metrics.util';

describe('admin-metrics util helpers', () => {
  it('utcDay formats YYYY-MM-DD in UTC', () => {
    expect(utcDay(new Date('2026-07-12T23:30:00Z'))).toBe('2026-07-12');
  });

  it('utcMonday returns Monday 00:00 UTC of the week', () => {
    // 2026-07-12 is a Sunday -> Monday of that week is 2026-07-06
    expect(utcMonday(new Date('2026-07-12T10:00:00Z')).toISOString()).toBe('2026-07-06T00:00:00.000Z');
    // 2026-07-06 is a Monday -> itself
    expect(utcMonday(new Date('2026-07-06T10:00:00Z')).toISOString()).toBe('2026-07-06T00:00:00.000Z');
  });

  it('subInterval flags yearly when the period is longer than 45 days', () => {
    expect(subInterval(new Date('2026-01-01Z'), new Date('2027-01-01Z'))).toBe('yearly');
    expect(subInterval(new Date('2026-01-01Z'), new Date('2026-02-01Z'))).toBe('monthly');
    expect(subInterval(null, null)).toBe('monthly');
  });

  it('buildActiveDays maps userId to a set of UTC day strings, deduped', () => {
    const map = buildActiveDays([
      { userId: 'a', createdAt: new Date('2026-07-01T08:00:00Z') },
      { userId: 'a', createdAt: new Date('2026-07-01T20:00:00Z') },
      { userId: 'a', createdAt: new Date('2026-07-02T01:00:00Z') },
      { userId: 'b', createdAt: new Date('2026-07-02T01:00:00Z') },
    ]);
    expect([...map.get('a')!].sort()).toEqual(['2026-07-01', '2026-07-02']);
    expect([...map.get('b')!]).toEqual(['2026-07-02']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest admin-metrics.util`
Expected: FAIL ("Cannot find module './admin-metrics.util'").

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/modules/admin/admin-metrics.util.ts`:

```ts
// Pure calculators for the investor-metrics endpoint. No Prisma, no I/O.
// All boundaries are UTC. `now` is always injected so tests are deterministic.

// NOTE: 4th copy of the pricing table (see subscriptions.service.ts PRICING,
// build_landing.py CURRENCY_PRICING, setup-stripe-products.ts CURRENCIES).
// Keep in sync when prices change.
export const MRR_MONTHLY_USD = {
  pro: { monthly: 4.99, yearly: 29.99 / 12 },
  business: { monthly: 19.99, yearly: 191.88 / 12 },
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SignupRow { userId: string; createdAt: Date }
export interface ActivityEvent { userId: string; createdAt: Date }
export interface PaidSubRow {
  tier: 'pro' | 'business';
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  currencyCode: string;
}

export function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function utcMonday(d: Date): Date {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = day.getUTCDay(); // 0=Sun..6=Sat
  const delta = (dow + 6) % 7; // days since Monday
  return new Date(day.getTime() - delta * DAY_MS);
}

export function subInterval(start: Date | null, end: Date | null): 'monthly' | 'yearly' {
  if (!start || !end) return 'monthly';
  return end.getTime() - start.getTime() > 45 * DAY_MS ? 'yearly' : 'monthly';
}

export function buildActiveDays(events: ActivityEvent[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const e of events) {
    let set = map.get(e.userId);
    if (!set) { set = new Set(); map.set(e.userId, set); }
    set.add(utcDay(e.createdAt));
  }
  return map;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest admin-metrics.util`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/admin-metrics.util.ts apps/api/src/modules/admin/admin-metrics.util.spec.ts
git commit -m "feat(api): investor metrics util helpers + activity index"
```

---

### Task 3: computeEngagement (DAU/WAU/MAU)

**Files:**
- Modify: `apps/api/src/modules/admin/admin-metrics.util.ts`
- Test: `apps/api/src/modules/admin/admin-metrics.util.spec.ts`

**Interfaces:**
- Consumes: `buildActiveDays` output (`Map<string, Set<string>>`), `EngagementBlock` (type-only from `@budget/shared-types`).
- Produces: `computeEngagement(active: Map<string, Set<string>>, now: Date): EngagementBlock`.

- [ ] **Step 1: Write the failing test**

Append to `admin-metrics.util.spec.ts`:

```ts
import { computeEngagement } from './admin-metrics.util';

describe('computeEngagement', () => {
  const now = new Date('2026-07-12T12:00:00Z');
  it('counts DAU (today), WAU (7d), MAU (30d) and the ratio', () => {
    const active = new Map<string, Set<string>>([
      ['a', new Set(['2026-07-12'])],                 // today -> DAU, WAU, MAU
      ['b', new Set(['2026-07-08'])],                 // within 7d -> WAU, MAU
      ['c', new Set(['2026-06-20'])],                 // within 30d -> MAU only
      ['d', new Set(['2026-05-01'])],                 // >30d -> none
    ]);
    const r = computeEngagement(active, now);
    expect(r.dau).toBe(1);
    expect(r.wau).toBe(2);
    expect(r.mau).toBe(3);
    expect(r.dauMauRatio).toBeCloseTo(1 / 3, 5);
  });
  it('ratio is 0 when there is no MAU', () => {
    expect(computeEngagement(new Map(), now).dauMauRatio).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest admin-metrics.util -t computeEngagement`
Expected: FAIL ("computeEngagement is not a function").

- [ ] **Step 3: Write minimal implementation**

Append to `admin-metrics.util.ts` (add the type-only import at the top of the file, grouped with other imports):

```ts
import type { EngagementBlock } from '@budget/shared-types';
```

```ts
export function computeEngagement(active: Map<string, Set<string>>, now: Date): EngagementBlock {
  const today = utcDay(now);
  const wauSince = utcDay(new Date(now.getTime() - 6 * DAY_MS));  // last 7 calendar days incl today
  const mauSince = utcDay(new Date(now.getTime() - 29 * DAY_MS)); // last 30 calendar days incl today
  let dau = 0, wau = 0, mau = 0;
  for (const days of active.values()) {
    let latest = '';
    for (const d of days) if (d > latest) latest = d;
    if (days.has(today)) dau++;
    if (latest >= wauSince) wau++;
    if (latest >= mauSince) mau++;
  }
  return { dau, wau, mau, dauMauRatio: mau > 0 ? dau / mau : 0 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest admin-metrics.util -t computeEngagement`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/admin-metrics.util.ts apps/api/src/modules/admin/admin-metrics.util.spec.ts
git commit -m "feat(api): computeEngagement DAU/WAU/MAU"
```

---

### Task 4: computeWeeklyRetention (flagship)

**Files:**
- Modify: `apps/api/src/modules/admin/admin-metrics.util.ts`
- Test: `apps/api/src/modules/admin/admin-metrics.util.spec.ts`

**Interfaces:**
- Consumes: `SignupRow[]`, activity map, `RetentionBlock` / `CohortRetentionRow` (type-only).
- Produces: `computeWeeklyRetention(signups: SignupRow[], active: Map<string, Set<string>>, weeks: number, now: Date): RetentionBlock`.

**Definition:** cohort = Monday-anchored signup week. Week-n window = `[cohortStart + 7n days, cohortStart + 7(n+1) days)`. `retention[n]` = distinct cohort users with an active day in that window ÷ cohort size, or `null` if `now < cohortStart + 7(n+1) days`. Rows keep the most-recent `weeks` cohorts, oldest first. Each row has `weeks` retention entries. Headline W1/W4/W8 is pooled: `Σ active[n] / Σ size` over cohorts where `retention[n] != null`.

- [ ] **Step 1: Write the failing test**

Append to `admin-metrics.util.spec.ts`:

```ts
import { computeWeeklyRetention } from './admin-metrics.util';

describe('computeWeeklyRetention', () => {
  const now = new Date('2026-07-13T00:00:00Z'); // Monday
  it('computes calendar-week cohort retention with immature weeks as null', () => {
    // Cohort week 2026-06-01 (Mon). Two users signed up that week.
    const signups = [
      { userId: 'a', createdAt: new Date('2026-06-01T10:00:00Z') },
      { userId: 'b', createdAt: new Date('2026-06-03T10:00:00Z') },
    ];
    const active = new Map<string, Set<string>>([
      // a: active in week 0 (2026-06-01..06-08) and week 1 (06-08..06-15)
      ['a', new Set(['2026-06-02', '2026-06-10'])],
      // b: active only in week 0
      ['b', new Set(['2026-06-04'])],
    ]);
    const r = computeWeeklyRetention(signups, active, 8, now);
    const row = r.weekly.find((c) => c.cohortWeekStart === '2026-06-01')!;
    expect(row.cohortSize).toBe(2);
    expect(row.retention[0]).toBe(1);     // both active week 0
    expect(row.retention[1]).toBeCloseTo(0.5, 5); // only a active week 1
    // week 6 window ends 2026-07-13 == now -> not "< now", so elapsed -> not null (0)
    // week 7 window ends 2026-07-20 > now -> null
    expect(row.retention[7]).toBeNull();
  });

  it('headline pools across qualifying cohorts', () => {
    const signups = [
      { userId: 'a', createdAt: new Date('2026-06-01T10:00:00Z') },
      { userId: 'b', createdAt: new Date('2026-06-01T10:00:00Z') },
      { userId: 'c', createdAt: new Date('2026-06-08T10:00:00Z') },
    ];
    const active = new Map<string, Set<string>>([
      ['a', new Set(['2026-06-09'])], // week 1 of cohort 06-01
      ['c', new Set(['2026-06-16'])], // week 1 of cohort 06-08
    ]);
    const r = computeWeeklyRetention(signups, active, 8, now);
    // cohort 06-01 w1 = 1/2, cohort 06-08 w1 = 1/1 -> pooled = (1+1)/(2+1) = 0.666...
    expect(r.headline.w1).toBeCloseTo(2 / 3, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest admin-metrics.util -t computeWeeklyRetention`
Expected: FAIL ("computeWeeklyRetention is not a function").

- [ ] **Step 3: Write minimal implementation**

Add `RetentionBlock` to the type-only import at the top of `admin-metrics.util.ts`, then append:

```ts
export function computeWeeklyRetention(
  signups: SignupRow[],
  active: Map<string, Set<string>>,
  weeks: number,
  now: Date,
): RetentionBlock {
  // Group users by Monday-anchored signup week.
  const cohorts = new Map<string, { start: Date; users: string[] }>();
  for (const s of signups) {
    const start = utcMonday(s.createdAt);
    const key = utcDay(start);
    let c = cohorts.get(key);
    if (!c) { c = { start, users: [] }; cohorts.set(key, c); }
    c.users.push(s.userId);
  }

  // Keep the most-recent `weeks` cohorts, oldest first.
  const ordered = [...cohorts.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
  const kept = ordered.slice(Math.max(0, ordered.length - weeks));

  // active[n] and size[n] pooled across cohorts for the headline.
  const pooledActive: number[] = Array(weeks).fill(0);
  const pooledSize: number[] = Array(weeks).fill(0);

  const rows = kept.map((c) => {
    const retention: Array<number | null> = [];
    for (let n = 0; n < weeks; n++) {
      const winStart = new Date(c.start.getTime() + n * 7 * DAY_MS);
      const winEnd = new Date(c.start.getTime() + (n + 1) * 7 * DAY_MS);
      if (now.getTime() < winEnd.getTime()) { retention.push(null); continue; }
      const startStr = utcDay(winStart);
      const endStr = utcDay(winEnd);
      let count = 0;
      for (const uid of c.users) {
        const days = active.get(uid);
        if (!days) continue;
        for (const d of days) { if (d >= startStr && d < endStr) { count++; break; } }
      }
      retention.push(c.users.length > 0 ? count / c.users.length : 0);
      pooledActive[n] += count;
      pooledSize[n] += c.users.length;
    }
    return { cohortWeekStart: utcDay(c.start), cohortSize: c.users.length, retention };
  });

  const pooled = (n: number): number | null => (pooledSize[n] > 0 ? pooledActive[n] / pooledSize[n] : null);
  return { weekly: rows, headline: { w1: pooled(1), w4: pooled(4), w8: pooled(8) } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest admin-metrics.util -t computeWeeklyRetention`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/admin-metrics.util.ts apps/api/src/modules/admin/admin-metrics.util.spec.ts
git commit -m "feat(api): computeWeeklyRetention cohort triangle + headline"
```

---

### Task 5: computeActivation

**Files:**
- Modify: `apps/api/src/modules/admin/admin-metrics.util.ts`
- Test: `apps/api/src/modules/admin/admin-metrics.util.spec.ts`

**Interfaces:**
- Produces: `computeActivation(signups: SignupRow[], active: Map<string, Set<string>>, windowDays: number, now: Date): ActivationBlock`.

**Definition:** eligible cohort = signups with `createdAt` in `[now - 90d, now - windowDays]` (recent and old enough for the window). Activated = active on any day in `[signupDay, signupDay + windowDays)`. everActivated = active on any day at all. Rates over eligible count (0 if eligible is empty).

- [ ] **Step 1: Write the failing test**

Append to `admin-metrics.util.spec.ts`:

```ts
import { computeActivation } from './admin-metrics.util';

describe('computeActivation', () => {
  const now = new Date('2026-07-13T00:00:00Z');
  it('counts activation within the window and ever-activated', () => {
    const signups = [
      { userId: 'a', createdAt: new Date('2026-07-01T00:00:00Z') }, // eligible (old enough, <90d)
      { userId: 'b', createdAt: new Date('2026-07-01T00:00:00Z') }, // eligible
      { userId: 'c', createdAt: new Date('2026-07-12T00:00:00Z') }, // too new (< windowDays) -> excluded
    ];
    const active = new Map<string, Set<string>>([
      ['a', new Set(['2026-07-02'])],          // day 1 -> within 3d window
      ['b', new Set(['2026-07-09'])],          // day 8 -> not in window, but ever-activated
    ]);
    const r = computeActivation(signups, active, 3, now);
    expect(r.windowDays).toBe(3);
    expect(r.cohortSize).toBe(2);
    expect(r.activatedWithinWindow).toBe(1);
    expect(r.activationRate).toBeCloseTo(0.5, 5);
    expect(r.everActivatedRate).toBeCloseTo(1, 5);
  });
  it('returns zero rates when the eligible cohort is empty', () => {
    const r = computeActivation([], new Map(), 3, now);
    expect(r.cohortSize).toBe(0);
    expect(r.activationRate).toBe(0);
    expect(r.everActivatedRate).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest admin-metrics.util -t computeActivation`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Add `ActivationBlock` to the type-only import, then append:

```ts
export function computeActivation(
  signups: SignupRow[],
  active: Map<string, Set<string>>,
  windowDays: number,
  now: Date,
): ActivationBlock {
  const oldestEligible = now.getTime() - 90 * DAY_MS;
  const newestEligible = now.getTime() - windowDays * DAY_MS;
  let cohortSize = 0, activatedWithinWindow = 0, everActivated = 0;
  for (const s of signups) {
    const t = s.createdAt.getTime();
    if (t < oldestEligible || t > newestEligible) continue;
    cohortSize++;
    const days = active.get(s.userId);
    if (!days || days.size === 0) continue;
    everActivated++;
    const startStr = utcDay(s.createdAt);
    const endStr = utcDay(new Date(s.createdAt.getTime() + windowDays * DAY_MS));
    for (const d of days) { if (d >= startStr && d < endStr) { activatedWithinWindow++; break; } }
  }
  return {
    windowDays,
    cohortSize,
    activatedWithinWindow,
    activationRate: cohortSize > 0 ? activatedWithinWindow / cohortSize : 0,
    everActivatedRate: cohortSize > 0 ? everActivated / cohortSize : 0,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest admin-metrics.util -t computeActivation`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/admin-metrics.util.ts apps/api/src/modules/admin/admin-metrics.util.spec.ts
git commit -m "feat(api): computeActivation"
```

---

### Task 6: computeGrowth

**Files:**
- Modify: `apps/api/src/modules/admin/admin-metrics.util.ts`
- Test: `apps/api/src/modules/admin/admin-metrics.util.spec.ts`

**Interfaces:**
- Produces: `computeGrowth(signups: SignupRow[], months: number, now: Date): GrowthBlock`.

**Definition:** `monthly` = one `{period:'YYYY-MM', newUsers}` per calendar month for the last `months` months (oldest first, includes the current partial month). `momGrowthRate` = `(latestComplete - prevComplete) / prevComplete` over the two most recent COMPLETE months (excludes the current partial); `null` if fewer than two complete months or `prevComplete === 0`.

- [ ] **Step 1: Write the failing test**

Append to `admin-metrics.util.spec.ts`:

```ts
import { computeGrowth } from './admin-metrics.util';

describe('computeGrowth', () => {
  const now = new Date('2026-07-12T00:00:00Z'); // current month 2026-07 (partial)
  it('buckets signups per month and computes MoM over complete months', () => {
    const signups = [
      { userId: '1', createdAt: new Date('2026-05-10Z') },
      { userId: '2', createdAt: new Date('2026-05-20Z') }, // May = 2
      { userId: '3', createdAt: new Date('2026-06-05Z') }, // Jun = 1
      { userId: '4', createdAt: new Date('2026-07-01Z') }, // Jul (current, partial) = 1
    ];
    const r = computeGrowth(signups, 3, now);
    expect(r.monthly).toEqual([
      { period: '2026-05', newUsers: 2 },
      { period: '2026-06', newUsers: 1 },
      { period: '2026-07', newUsers: 1 },
    ]);
    // complete months: May(2), Jun(1) -> mom = (1-2)/2 = -0.5
    expect(r.momGrowthRate).toBeCloseTo(-0.5, 5);
  });
  it('mom is null when the previous complete month is zero', () => {
    const signups = [{ userId: '1', createdAt: new Date('2026-06-05Z') }];
    const r = computeGrowth(signups, 3, now); // May=0, Jun=1 -> prev complete (May)=0
    expect(r.momGrowthRate).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest admin-metrics.util -t computeGrowth`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Add `GrowthBlock` to the type-only import, then append:

```ts
export function computeGrowth(signups: SignupRow[], months: number, now: Date): GrowthBlock {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  const counts = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const s of signups) {
    const k = `${s.createdAt.getUTCFullYear()}-${String(s.createdAt.getUTCMonth() + 1).padStart(2, '0')}`;
    if (counts.has(k)) counts.set(k, counts.get(k)! + 1);
  }
  const monthly = keys.map((period) => ({ period, newUsers: counts.get(period)! }));

  // Complete months exclude the current (last) partial month.
  const complete = monthly.slice(0, -1);
  let momGrowthRate: number | null = null;
  if (complete.length >= 2) {
    const prev = complete[complete.length - 2].newUsers;
    const latest = complete[complete.length - 1].newUsers;
    momGrowthRate = prev > 0 ? (latest - prev) / prev : null;
  }
  return { monthly, momGrowthRate };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest admin-metrics.util -t computeGrowth`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/admin-metrics.util.ts apps/api/src/modules/admin/admin-metrics.util.spec.ts
git commit -m "feat(api): computeGrowth + MoM"
```

---

### Task 7: normalizeMrr + trial conversion + churn

**Files:**
- Modify: `apps/api/src/modules/admin/admin-metrics.util.ts`
- Test: `apps/api/src/modules/admin/admin-metrics.util.spec.ts`

**Interfaces:**
- Produces:
  - `normalizeMrr(subs: PaidSubRow[]): { mrrUsd: number; approximate: boolean; payingUsers: number }`
  - `computeTrialConversion(endedTrialPaidFlags: boolean[]): number | null`
  - `computeChurn(params: { payingNow: number; churnedThisMonth: PaidSubRow[]; mrrNow: number }): { logoChurnMonthly: number | null; revenueChurnMonthly: number | null }`

- [ ] **Step 1: Write the failing test**

Append to `admin-metrics.util.spec.ts`:

```ts
import { normalizeMrr, computeTrialConversion, computeChurn } from './admin-metrics.util';

describe('normalizeMrr', () => {
  it('normalizes monthly and yearly subs to monthly USD and flags non-USD', () => {
    const subs = [
      { tier: 'pro' as const, currentPeriodStart: new Date('2026-07-01Z'), currentPeriodEnd: new Date('2026-08-01Z'), currencyCode: 'USD' },   // 4.99
      { tier: 'pro' as const, currentPeriodStart: new Date('2026-01-01Z'), currentPeriodEnd: new Date('2027-01-01Z'), currencyCode: 'PLN' },   // 29.99/12
      { tier: 'business' as const, currentPeriodStart: new Date('2026-07-01Z'), currentPeriodEnd: new Date('2026-08-01Z'), currencyCode: 'USD' }, // 19.99
    ];
    const r = normalizeMrr(subs);
    expect(r.payingUsers).toBe(3);
    expect(r.approximate).toBe(true);
    expect(r.mrrUsd).toBeCloseTo(4.99 + 29.99 / 12 + 19.99, 5);
  });
  it('is all-USD -> not approximate, empty -> 0', () => {
    expect(normalizeMrr([]).mrrUsd).toBe(0);
    expect(normalizeMrr([]).approximate).toBe(false);
  });
});

describe('computeTrialConversion', () => {
  it('is paid/total of ended trials, null when none ended', () => {
    expect(computeTrialConversion([true, false, true, false])).toBeCloseTo(0.5, 5);
    expect(computeTrialConversion([])).toBeNull();
  });
});

describe('computeChurn', () => {
  it('computes logo and revenue churn', () => {
    const churned = [
      { tier: 'pro' as const, currentPeriodStart: new Date('2026-07-01Z'), currentPeriodEnd: new Date('2026-08-01Z'), currencyCode: 'USD' }, // 4.99
    ];
    const r = computeChurn({ payingNow: 9, churnedThisMonth: churned, mrrNow: 95.05 });
    // payingAtStart = 9 + 1 = 10 -> logo = 1/10 = 0.1
    expect(r.logoChurnMonthly).toBeCloseTo(0.1, 5);
    // revenue = 4.99 / (95.05 + 4.99) = 0.04988...
    expect(r.revenueChurnMonthly).toBeCloseTo(4.99 / (95.05 + 4.99), 5);
  });
  it('returns null when denominators are zero', () => {
    const r = computeChurn({ payingNow: 0, churnedThisMonth: [], mrrNow: 0 });
    expect(r.logoChurnMonthly).toBeNull();
    expect(r.revenueChurnMonthly).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest admin-metrics.util -t normalizeMrr`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Append to `admin-metrics.util.ts`:

```ts
export function normalizeMrr(subs: PaidSubRow[]): { mrrUsd: number; approximate: boolean; payingUsers: number } {
  let mrrUsd = 0;
  let approximate = false;
  for (const s of subs) {
    const interval = subInterval(s.currentPeriodStart, s.currentPeriodEnd);
    mrrUsd += MRR_MONTHLY_USD[s.tier][interval];
    if (s.currencyCode !== 'USD') approximate = true;
  }
  return { mrrUsd: Math.round(mrrUsd * 100) / 100, approximate, payingUsers: subs.length };
}

export function computeTrialConversion(endedTrialPaidFlags: boolean[]): number | null {
  if (endedTrialPaidFlags.length === 0) return null;
  const paid = endedTrialPaidFlags.filter(Boolean).length;
  return paid / endedTrialPaidFlags.length;
}

export function computeChurn(params: {
  payingNow: number;
  churnedThisMonth: PaidSubRow[];
  mrrNow: number;
}): { logoChurnMonthly: number | null; revenueChurnMonthly: number | null } {
  const { payingNow, churnedThisMonth, mrrNow } = params;
  const payingAtStart = payingNow + churnedThisMonth.length;
  const churnedMrr = normalizeMrr(churnedThisMonth).mrrUsd;
  return {
    logoChurnMonthly: payingAtStart > 0 ? churnedThisMonth.length / payingAtStart : null,
    revenueChurnMonthly: mrrNow + churnedMrr > 0 ? churnedMrr / (mrrNow + churnedMrr) : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest admin-metrics.util`
Expected: PASS (all util suites green).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/admin-metrics.util.ts apps/api/src/modules/admin/admin-metrics.util.spec.ts
git commit -m "feat(api): MRR normalization, trial conversion, churn"
```

---

### Task 8: AdminInvestorMetricsService (IO + assembly + cache + segments)

**Files:**
- Create: `apps/api/src/modules/admin/admin-investor-metrics.service.ts`
- Test: `apps/api/src/modules/admin/admin-investor-metrics.service.spec.ts`

**Interfaces:**
- Consumes: all pure fns from Tasks 2–7, `estimateCost` (exported from `admin-analytics.service.ts`), `PrismaService`, `CacheService`.
- Produces: `AdminInvestorMetricsService.getInvestorMetrics(params: { months: number; weeks: number; activationDays: number }): Promise<AdminInvestorMetricsResponse>` — consumed by Task 9.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/admin/admin-investor-metrics.service.spec.ts`:

```ts
import { AdminInvestorMetricsService } from './admin-investor-metrics.service';

function makePrisma() {
  return {
    user: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    account: { count: jest.fn().mockResolvedValue(0) },
    expense: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    income: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    subscription: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    usageLog: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;
}

describe('AdminInvestorMetricsService', () => {
  const params = { months: 6, weeks: 12, activationDays: 3 };

  it('returns a cached response without querying prisma', async () => {
    const cached = { generatedAt: 'x', params } as any;
    const cache = { get: jest.fn().mockResolvedValue(cached), set: jest.fn() } as any;
    const prisma = makePrisma();
    const svc = new AdminInvestorMetricsService(prisma, cache);
    const res = await svc.getInvestorMetrics(params);
    expect(res).toBe(cached);
    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  it('on cache miss, queries prisma, assembles all blocks, and caches', async () => {
    const cache = { get: jest.fn().mockResolvedValue(null), set: jest.fn() } as any;
    const prisma = makePrisma();
    const svc = new AdminInvestorMetricsService(prisma, cache);
    const res = await svc.getInvestorMetrics(params);
    expect(res.retention).toBeDefined();
    expect(res.activation).toBeDefined();
    expect(res.engagement).toBeDefined();
    expect(res.growth).toBeDefined();
    expect(res.monetization).toBeDefined();
    expect(res.segments.map((s) => s.segment)).toEqual(['pl', 'other']);
    expect(res.scale).toBeDefined();
    expect(cache.set).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest admin-investor-metrics.service`
Expected: FAIL ("Cannot find module './admin-investor-metrics.service'").

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/modules/admin/admin-investor-metrics.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { estimateCost } from './admin-analytics.service';
import type {
  AdminInvestorMetricsResponse,
  SegmentMetrics,
  MonetizationBlock,
} from '@budget/shared-types';
import {
  buildActiveDays,
  computeActivation,
  computeChurn,
  computeEngagement,
  computeGrowth,
  computeTrialConversion,
  computeWeeklyRetention,
  normalizeMrr,
  utcDay,
  type ActivityEvent,
  type PaidSubRow,
  type SignupRow,
} from './admin-metrics.util';

interface Params { months: number; weeks: number; activationDays: number }

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AdminInvestorMetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  async getInvestorMetrics(params: Params): Promise<AdminInvestorMetricsResponse> {
    const key = `admin:investor-metrics:${params.months}:${params.weeks}:${params.activationDays}`;
    const cached = await this.cacheService.get<AdminInvestorMetricsResponse>(key);
    if (cached) return cached;

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    // Activity lookback: enough for the retention window plus a margin.
    const lookbackStart = new Date(now.getTime() - (params.weeks + 4) * 7 * DAY_MS);

    const [
      totalUsers, totalAccounts, totalTransactions,
      users, expenses, incomes, subs, usageLogs,
    ] = await Promise.all([
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.account.count(),
      Promise.all([
        this.prisma.expense.count({ where: { isDeleted: false } }),
        this.prisma.income.count({ where: { isDeleted: false } }),
      ]).then(([e, i]) => e + i),
      this.prisma.user.findMany({ select: { id: true, createdAt: true, language: true } }),
      this.prisma.expense.findMany({
        where: { isDeleted: false, createdAt: { gte: lookbackStart } },
        select: { userId: true, createdAt: true },
      }),
      this.prisma.income.findMany({
        where: { isDeleted: false, createdAt: { gte: lookbackStart } },
        select: { userId: true, createdAt: true },
      }),
      this.prisma.subscription.findMany({
        select: {
          userId: true, tier: true, status: true,
          currentPeriodStart: true, currentPeriodEnd: true,
          trialStart: true, trialEnd: true, canceledAt: true,
          user: { select: { language: true, currencyCode: true } },
        },
      }),
      this.prisma.usageLog.findMany({
        where: { createdAt: { gte: monthStart } },
        select: { featureType: true },
      }),
    ]);

    const signups: SignupRow[] = users.map((u) => ({ userId: u.id, createdAt: u.createdAt }));
    const activity: ActivityEvent[] = [
      ...expenses.map((e) => ({ userId: e.userId, createdAt: e.createdAt })),
      ...incomes.map((i) => ({ userId: i.userId, createdAt: i.createdAt })),
    ];
    const langById = new Map(users.map((u) => [u.id, u.language]));

    const monetization = this.buildMonetization(subs, usageLogs, totalUsers, activity, now, monthStart);

    const segment = (which: 'pl' | 'other'): SegmentMetrics => {
      const inSeg = (lang: string | null | undefined) => (which === 'pl' ? lang === 'pl' : lang !== 'pl');
      const segSignups = signups.filter((s) => inSeg(langById.get(s.userId)));
      const segUserIds = new Set(segSignups.map((s) => s.userId));
      const segActivity = activity.filter((a) => segUserIds.has(a.userId));
      const segActive = buildActiveDays(segActivity);
      const ret = computeWeeklyRetention(segSignups, segActive, params.weeks, now);
      const act = computeActivation(segSignups, segActive, params.activationDays, now);
      const segPaid = this.paidRows(subs.filter((s) => inSeg(s.user?.language)));
      const segMrr = normalizeMrr(segPaid).mrrUsd;
      return {
        segment: which,
        users: segSignups.length,
        retentionHeadline: ret.headline,
        activationRate: act.activationRate,
        freeToPaidConversion: segSignups.length > 0 ? segPaid.length / segSignups.length : 0,
        mrrUsd: Math.round(segMrr * 100) / 100,
      };
    };

    const active = buildActiveDays(activity);
    const response: AdminInvestorMetricsResponse = {
      generatedAt: now.toISOString(),
      params,
      retention: computeWeeklyRetention(signups, active, params.weeks, now),
      activation: computeActivation(signups, active, params.activationDays, now),
      engagement: computeEngagement(active, now),
      growth: computeGrowth(signups, params.months, now),
      monetization,
      segments: [segment('pl'), segment('other')],
      scale: { totalUsers, totalAccounts, totalTransactions },
    };

    await this.cacheService.set(key, response, 3600);
    return response;
  }

  // Maps active paid subscription rows to the pure PaidSubRow shape.
  private paidRows(
    subs: Array<{
      tier: string; status: string;
      currentPeriodStart: Date | null; currentPeriodEnd: Date | null;
      user?: { currencyCode?: string } | null;
    }>,
  ): PaidSubRow[] {
    return subs
      .filter((s) => (s.tier === 'pro' || s.tier === 'business') && s.status === 'active')
      .map((s) => ({
        tier: s.tier as 'pro' | 'business',
        currentPeriodStart: s.currentPeriodStart,
        currentPeriodEnd: s.currentPeriodEnd,
        currencyCode: s.user?.currencyCode ?? 'USD',
      }));
  }

  private buildMonetization(
    subs: Array<any>,
    usageLogs: Array<{ featureType: string }>,
    totalUsers: number,
    activity: ActivityEvent[],
    now: Date,
    monthStart: Date,
  ): MonetizationBlock {
    const paid = this.paidRows(subs);
    const { mrrUsd, approximate, payingUsers } = normalizeMrr(paid);
    const trialingUsers = subs.filter((s) => s.status === 'trialing').length;

    const mau = computeEngagement(buildActiveDays(activity), now).mau;
    const aiCogsUsd = Math.round(
      usageLogs.reduce((sum, l) => sum + estimateCost(l.featureType, 1), 0) * 10000,
    ) / 10000;

    const endedTrialFlags = subs
      .filter((s) => s.trialEnd && s.trialEnd.getTime() < now.getTime())
      .map((s) => (s.tier === 'pro' || s.tier === 'business') && s.status === 'active');
    const trialToPaidConversion = computeTrialConversion(endedTrialFlags);

    const churnedThisMonth = this.paidRowsRaw(
      subs.filter((s) => s.canceledAt && s.canceledAt.getTime() >= monthStart.getTime()),
    );
    const churn = computeChurn({ payingNow: payingUsers, churnedThisMonth, mrrNow: mrrUsd });

    return {
      // normalizeMrr returns the EXACT monthly-equivalent sum (a pure function,
      // no cents rounding — see Task 7); round to cents here at the presentation
      // boundary, consistent with arpu/arppu/aiCogs below.
      mrrUsd: Math.round(mrrUsd * 100) / 100, mrrApproximate: approximate, payingUsers, trialingUsers,
      arpuUsd: mau > 0 ? Math.round((mrrUsd / mau) * 100) / 100 : 0,
      arppuUsd: payingUsers > 0 ? Math.round((mrrUsd / payingUsers) * 100) / 100 : 0,
      freeToPaidConversion: totalUsers > 0 ? payingUsers / totalUsers : 0,
      trialToPaidConversion,
      logoChurnMonthly: churn.logoChurnMonthly,
      revenueChurnMonthly: churn.revenueChurnMonthly,
      aiCogsUsd,
      grossMargin: mrrUsd > 0 ? (mrrUsd - aiCogsUsd) / mrrUsd : null,
    };
  }

  // Churned subs keep their last tier/period; map without the active-status filter.
  private paidRowsRaw(
    subs: Array<{
      tier: string;
      currentPeriodStart: Date | null; currentPeriodEnd: Date | null;
      user?: { currencyCode?: string } | null;
    }>,
  ): PaidSubRow[] {
    return subs
      .filter((s) => s.tier === 'pro' || s.tier === 'business')
      .map((s) => ({
        tier: s.tier as 'pro' | 'business',
        currentPeriodStart: s.currentPeriodStart,
        currentPeriodEnd: s.currentPeriodEnd,
        currencyCode: s.user?.currencyCode ?? 'USD',
      }));
  }
}
```

> **Note on `utcDay` import:** it is imported for parity with the util surface; if the linter flags it as unused, remove it from the import list. Keep `estimateCost`, all `compute*`, `buildActiveDays`, `normalizeMrr`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest admin-investor-metrics.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/admin-investor-metrics.service.ts apps/api/src/modules/admin/admin-investor-metrics.service.spec.ts
git commit -m "feat(api): AdminInvestorMetricsService (IO + cache + segments)"
```

---

### Task 9: Controller endpoint + module registration

**Files:**
- Modify: `apps/api/src/modules/admin/admin.controller.ts` (add route + constructor injection)
- Modify: `apps/api/src/modules/admin/admin.module.ts` (register provider)
- Test: `apps/api/src/modules/admin/admin.controller.spec.ts` (create or extend)

**Interfaces:**
- Consumes: `AdminInvestorMetricsService.getInvestorMetrics(params)`.
- Produces: `GET /admin/metrics/investor?months&weeks&activationDays`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/admin/admin.controller.spec.ts` (if it exists, append this describe block):

```ts
import { AdminController } from './admin.controller';

describe('AdminController investor metrics', () => {
  it('parses and clamps query params, delegates to the service', async () => {
    const investor = { getInvestorMetrics: jest.fn().mockResolvedValue({ ok: true }) } as any;
    const ctrl = new AdminController({} as any, {} as any, {} as any, {} as any, investor);
    const res = await ctrl.getInvestorMetrics('99', '99', '99'); // over clamp
    expect(investor.getInvestorMetrics).toHaveBeenCalledWith({ months: 24, weeks: 26, activationDays: 30 });
    expect(res).toEqual({ ok: true });
  });

  it('applies defaults when params are missing', async () => {
    const investor = { getInvestorMetrics: jest.fn().mockResolvedValue({}) } as any;
    const ctrl = new AdminController({} as any, {} as any, {} as any, {} as any, investor);
    await ctrl.getInvestorMetrics(undefined, undefined, undefined);
    expect(investor.getInvestorMetrics).toHaveBeenCalledWith({ months: 6, weeks: 12, activationDays: 3 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest admin.controller`
Expected: FAIL ("getInvestorMetrics is not a function" / constructor arity).

- [ ] **Step 3: Write minimal implementation**

In `admin.controller.ts`, add the import near the other service imports:

```ts
import { AdminInvestorMetricsService } from './admin-investor-metrics.service';
```

Add the constructor parameter (append after `referralsService`):

```ts
    private readonly referralsService: ReferralsService,
    private readonly investorMetricsService: AdminInvestorMetricsService,
  ) {}
```

Add the route (place it in the Dashboard section, after `getDashboard`):

```ts
  @Get('metrics/investor')
  async getInvestorMetrics(
    @Query('months') months?: string,
    @Query('weeks') weeks?: string,
    @Query('activationDays') activationDays?: string,
  ) {
    const clamp = (v: string | undefined, def: number, lo: number, hi: number) => {
      const n = parseInt(v ?? '', 10);
      return Number.isNaN(n) ? def : Math.min(hi, Math.max(lo, n));
    };
    return this.investorMetricsService.getInvestorMetrics({
      months: clamp(months, 6, 1, 24),
      weeks: clamp(weeks, 12, 1, 26),
      activationDays: clamp(activationDays, 3, 1, 30),
    });
  }
```

In `admin.module.ts`, import and register the provider:

```ts
import { AdminInvestorMetricsService } from './admin-investor-metrics.service';
```

Add `AdminInvestorMetricsService` to the `providers` array:

```ts
  providers: [AdminService, AdminAnalyticsService, AdminNotificationService, AdminInvestorMetricsService, AdminGuard, AdminGateway],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest admin.controller`
Expected: PASS.

- [ ] **Step 5: Verify the whole API still typechecks & tests green**

Run: `cd apps/api && npx tsc --noEmit && npx jest admin`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/admin/admin.controller.ts apps/api/src/modules/admin/admin.module.ts apps/api/src/modules/admin/admin.controller.spec.ts
git commit -m "feat(api): GET /admin/metrics/investor endpoint"
```

---

### Task 10: Admin UI — nav + hook + page

**Files:**
- Modify: `apps/admin/src/components/layout/app-sidebar.tsx` (nav item)
- Create: `apps/admin/src/hooks/use-investor-metrics.ts`
- Create: `apps/admin/src/app/metrics/page.tsx`

**Interfaces:**
- Consumes: `GET /admin/metrics/investor`, `AdminInvestorMetricsResponse` (type-only from `@budget/shared-types`).

- [ ] **Step 1: Add the nav item**

In `apps/admin/src/components/layout/app-sidebar.tsx`, add `LineChart` to the `lucide-react` import list, and add this entry to `navItems` (after the Dashboard entry):

```ts
  { href: "/metrics", label: "Investor Metrics", icon: LineChart },
```

- [ ] **Step 2: Create the hook**

Create `apps/admin/src/hooks/use-investor-metrics.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AdminInvestorMetricsResponse } from "@budget/shared-types";

export function useInvestorMetrics(months = 6, weeks = 12, activationDays = 3) {
  return useQuery<AdminInvestorMetricsResponse>({
    queryKey: ["admin", "investor-metrics", months, weeks, activationDays],
    queryFn: () =>
      api
        .get(`admin/metrics/investor?months=${months}&weeks=${weeks}&activationDays=${activationDays}`)
        .json(),
  });
}
```

- [ ] **Step 3: Create the page**

Create `apps/admin/src/app/metrics/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useInvestorMetrics } from "@/hooks/use-investor-metrics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/common/loading-skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency, formatPercent } from "@/lib/utils";
import type { SegmentMetrics } from "@budget/shared-types";

function pct(v: number | null | undefined): string {
  return v == null ? "—" : formatPercent(v);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent><div className="text-2xl font-bold">{value}</div></CardContent>
    </Card>
  );
}

function heat(v: number | null): string {
  if (v == null) return "bg-transparent text-muted-foreground";
  if (v >= 0.4) return "bg-green-500/30";
  if (v >= 0.2) return "bg-green-500/15";
  if (v > 0) return "bg-yellow-500/15";
  return "bg-red-500/10";
}

export default function MetricsPage() {
  const { data, isLoading } = useInvestorMetrics();
  const [segment, setSegment] = useState<"all" | "pl" | "other">("all");

  if (isLoading || !data) return <PageSkeleton />;

  const m = data.monetization;
  const seg: SegmentMetrics | undefined =
    segment === "all" ? undefined : data.segments.find((s) => s.segment === segment);
  const headline = seg ? seg.retentionHeadline : data.retention.headline;
  const activation = seg ? seg.activationRate : data.activation.activationRate;
  const conversion = seg ? seg.freeToPaidConversion : m.freeToPaidConversion;
  const mrr = seg ? seg.mrrUsd : m.mrrUsd;

  const weekCount = data.retention.weekly.reduce((mx, r) => Math.max(mx, r.retention.length), 0);

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Investor Metrics</h1>
        <div className="flex gap-1">
          {(["all", "pl", "other"] as const).map((s) => (
            <Button key={s} variant={segment === s ? "default" : "outline"} size="sm" onClick={() => setSegment(s)}>
              {s === "all" ? "All" : s.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="W4 Retention" value={pct(headline.w4)} />
        <Stat label="Activation" value={pct(activation)} />
        <Stat label={`MRR${m.mrrApproximate ? " ≈" : ""}`} value={formatCurrency(mrr)} />
        <Stat label="MoM Growth" value={pct(data.growth.momGrowthRate)} />
        <Stat label="DAU/MAU" value={pct(data.engagement.dauMauRatio)} />
        <Stat label="Gross Margin" value={pct(m.grossMargin)} />
      </div>

      <Card>
        <CardHeader><CardTitle>Weekly cohort retention</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cohort week</TableHead>
                <TableHead>Users</TableHead>
                {Array.from({ length: weekCount }).map((_, i) => <TableHead key={i}>W{i}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...data.retention.weekly].reverse().map((row) => (
                <TableRow key={row.cohortWeekStart} className={row.cohortSize < 5 ? "opacity-50" : ""}>
                  <TableCell>{row.cohortWeekStart}</TableCell>
                  <TableCell>{row.cohortSize}</TableCell>
                  {row.retention.map((v, i) => (
                    <TableCell key={i} className={heat(v)}>{v == null ? "" : formatPercent(v)}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>New users per month</CardTitle></CardHeader>
        <CardContent style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.growth.monthly}>
              <XAxis dataKey="period" fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip />
              <Bar dataKey="newUsers" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Paying users" value={String(m.payingUsers)} />
        <Stat label="Trialing" value={String(m.trialingUsers)} />
        <Stat label="ARPU" value={formatCurrency(m.arpuUsd)} />
        <Stat label="ARPPU" value={formatCurrency(m.arppuUsd)} />
        <Stat label="Free→Paid" value={pct(conversion)} />
        <Stat label="Trial→Paid" value={pct(m.trialToPaidConversion)} />
        <Stat label="Logo churn" value={pct(m.logoChurnMonthly)} />
        <Stat label="Revenue churn" value={pct(m.revenueChurnMonthly)} />
        <Stat label="AI COGS (mo)" value={formatCurrency(m.aiCogsUsd)} />
        <Stat label="Total users" value={String(data.scale.totalUsers)} />
        <Stat label="Total accounts" value={String(data.scale.totalAccounts)} />
        <Stat label="Transactions" value={String(data.scale.totalTransactions)} />
      </div>
    </div>
  );
}
```

> **Verify before build:** `formatCurrency` and `formatPercent` are exported from `apps/admin/src/lib/utils.ts` (used by `ai-usage/page.tsx`). If `formatPercent` expects a whole number vs a fraction, adjust the `pct`/heat call sites to match its contract (open `lib/utils.ts` to confirm — the metrics are fractions 0..1).

- [ ] **Step 4: Verify the admin app typechecks**

Run: `cd apps/admin && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/components/layout/app-sidebar.tsx apps/admin/src/hooks/use-investor-metrics.ts apps/admin/src/app/metrics/page.tsx
git commit -m "feat(admin): investor metrics page"
```

---

### Task 11: Full verification + finish

**Files:** none (verification + docs)

- [ ] **Step 1: Run the full API test + typecheck**

Run: `cd apps/api && npx jest admin && npx tsc --noEmit`
Expected: all admin suites PASS, no type errors.

- [ ] **Step 2: Root typecheck**

Run: `npm run typecheck`
Expected: PASS across packages.

- [ ] **Step 3: Manual smoke (optional, if a dev DB is available)**

Start the API, obtain an admin JWT, and:
`curl -H "Authorization: Bearer <admin-jwt>" "http://localhost:3000/api/v1/admin/metrics/investor"`
Expected: 200 with all blocks (`retention`, `activation`, `engagement`, `growth`, `monetization`, `segments`, `scale`).

- [ ] **Step 4: Finish the task (issue + docs)**

Invoke the **finish-aba-task** skill to create the ABA-{N} GitHub issue and update `CLAUDE.md` + `user_docs/` (admin section) describing the new endpoint and page. (Per project convention; run `gh issue list --limit 1` first to number correctly.)

---

## Self-Review

**Spec coverage:**
- Endpoint + guards + params + cache → Tasks 8, 9. ✅
- DTO → Task 1. ✅
- Retention (weekly + headline) → Task 4. ✅
- Activation → Task 5. ✅
- Engagement DAU/WAU/MAU → Task 3. ✅
- Growth + MoM → Task 6. ✅
- MRR (interval-normalized, approximate flag) → Task 7. ✅
- ARPU/ARPPU/conversion/trial→paid/churn/gross margin → Tasks 7 (pure) + 8 (assembly). ✅
- PL/other segments → Task 8. ✅
- Scale context → Task 8. ✅
- Pure-util + tests → Tasks 2–7. ✅
- Admin UI (nav/hook/page, heatmap, growth chart, segment toggle) → Task 10. ✅
- Out-of-scope (CAC/LTV, K-factor, mobile, precise per-currency MRR) → not implemented, as specified. ✅

**Placeholder scan:** No TBD/TODO; every code step has full code. The two `> Note`/`> Verify` callouts are guidance, not placeholders (they point at a concrete check, with the fallback action stated).

**Type consistency:** `SignupRow`/`ActivityEvent`/`PaidSubRow` defined in Task 2 and used verbatim in Tasks 3–8. `compute*`/`normalizeMrr`/`computeChurn`/`computeTrialConversion` signatures match between their defining task and the Task 8 call sites. DTO block names (`retention`/`activation`/`engagement`/`growth`/`monetization`/`segments`/`scale`) match between Task 1, Task 8 assembly, and Task 10 consumption. Controller constructor arity (5 params) matches Task 9 test instantiation.

## Notes / follow-ups (not in this plan)

- The **existing** `getAnalyticsOverview()` MRR (`PRO_MONTHLY_USD=999`, ignores yearly) is still stale on the dashboard. Left untouched to avoid scope creep; fix in a follow-up so the dashboard MRR matches the honest one here.
- Phase 2 (from the spec): materialized daily-activity rollup if scans get slow, precise per-currency MRR from Stripe, referral K-factor, CSV/PNG export.
