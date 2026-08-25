// Pure calculators for the investor-metrics endpoint. No Prisma, no I/O.
// All boundaries are UTC. `now` is always injected so tests are deterministic.

import type { EngagementBlock, RetentionBlock, ActivationBlock, GrowthBlock } from '@budget/shared-types';

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

  // Pool headline weeks (1/4/8) independently of the row-table depth `weeks`.
  const poolLen = Math.max(weeks, 9); // ensure index 8 is always covered
  const pooledActive: number[] = Array(poolLen).fill(0);
  const pooledSize: number[] = Array(poolLen).fill(0);

  const rows = kept.map((c) => {
    const retention: Array<number | null> = [];
    for (let n = 0; n < poolLen; n++) {
      const winStart = new Date(c.start.getTime() + n * 7 * DAY_MS);
      const winEnd = new Date(c.start.getTime() + (n + 1) * 7 * DAY_MS);
      let rate: number | null = null;
      if (now.getTime() >= winEnd.getTime()) {
        const startStr = utcDay(winStart);
        const endStr = utcDay(winEnd);
        let count = 0;
        for (const uid of c.users) {
          const days = active.get(uid);
          if (!days) continue;
          for (const d of days) { if (d >= startStr && d < endStr) { count++; break; } }
        }
        rate = count / c.users.length;
        pooledActive[n] += count;
        pooledSize[n] += c.users.length;
      }
      if (n < weeks) retention.push(rate);
    }
    return { cohortWeekStart: utcDay(c.start), cohortSize: c.users.length, retention };
  });

  const pooled = (n: number): number | null => (pooledSize[n] > 0 ? pooledActive[n] / pooledSize[n] : null);
  return { weekly: rows, headline: { w1: pooled(1), w4: pooled(4), w8: pooled(8) } };
}

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

// A subscription row as it comes off Prisma, before it is reduced to an MRR row.
export interface RawSubRow {
  tier: string;
  status: string;
  stripeSubscriptionId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  user?: { currencyCode?: string | null } | null;
}

// Reduces Prisma rows to MRR rows under a caller-supplied predicate (see admin-comped.util:
// isStripePaidSub for real revenue, isComplimentarySub for what was given away). One mapper for
// both sets on purpose — two copies would drift on interval or currency handling, and the whole
// point of splitting the sets is that they stay comparable.
export function toMrrRows(subs: RawSubRow[], predicate: (s: RawSubRow) => boolean): PaidSubRow[] {
  return subs.filter(predicate).map((s) => ({
    tier: s.tier as 'pro' | 'business',
    currentPeriodStart: s.currentPeriodStart,
    currentPeriodEnd: s.currentPeriodEnd,
    currencyCode: s.user?.currencyCode ?? 'USD',
  }));
}

export function normalizeMrr(subs: PaidSubRow[]): { mrrUsd: number; approximate: boolean; payingUsers: number } {
  let mrrUsd = 0;
  let approximate = false;
  for (const s of subs) {
    const interval = subInterval(s.currentPeriodStart, s.currentPeriodEnd);
    mrrUsd += MRR_MONTHLY_USD[s.tier][interval];
    if (s.currencyCode !== 'USD') approximate = true;
  }
  return { mrrUsd, approximate, payingUsers: subs.length };
}

export function computeTrialConversion(endedTrialPaidFlags: boolean[]): number | null {
  if (endedTrialPaidFlags.length === 0) return null;
  const paid = endedTrialPaidFlags.filter(Boolean).length;
  return paid / endedTrialPaidFlags.length;
}

export function computeChurn(params: {
  payingNow: number;
  churnedCount: number;
  mrrNow: number;
  churnedMrr?: number | null; // omitted/null ⇒ revenue churn unknowable (v1)
}): { logoChurnMonthly: number | null; revenueChurnMonthly: number | null } {
  const payingAtStart = params.payingNow + params.churnedCount;
  const logoChurnMonthly = payingAtStart > 0 ? params.churnedCount / payingAtStart : null;
  const cm = params.churnedMrr ?? null;
  const revenueChurnMonthly =
    cm != null && params.mrrNow + cm > 0 ? cm / (params.mrrNow + cm) : null;
  return { logoChurnMonthly, revenueChurnMonthly };
}
