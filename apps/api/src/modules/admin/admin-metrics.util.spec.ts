import { utcDay, utcMonday, subInterval, buildActiveDays, computeEngagement, computeWeeklyRetention, computeActivation } from './admin-metrics.util';

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
    expect(row.retention[5]).toBe(0); // window end == now -> elapsed -> non-null (0)
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

  it('headline w4/w8 are computed even when weeks <= 8', () => {
    // Cohort signed up ~14 weeks before now, so week 8 is fully elapsed.
    const start = new Date('2026-04-06T10:00:00Z'); // a Monday, 14 weeks before 2026-07-13
    const signups = [
      { userId: 'a', createdAt: start },
      { userId: 'b', createdAt: start },
    ];
    const active = new Map<string, Set<string>>([
      // a active in week 8 window [start+56d, start+63d) = [2026-06-01, 2026-06-08)
      ['a', new Set(['2026-06-02'])],
    ]);
    const r = computeWeeklyRetention(signups, active, 8, now);
    expect(r.headline.w8).toBeCloseTo(0.5, 5); // 1 of 2 active in week 8
  });
});

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

import { computeGrowth, normalizeMrr, toMrrRows, computeTrialConversion, computeChurn } from './admin-metrics.util';
import { isComplimentarySub, isStripePaidSub } from './admin-comped.util';

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
  it('computes logo churn from count and revenue churn when churnedMrr is supplied', () => {
    const r = computeChurn({ payingNow: 9, churnedCount: 1, mrrNow: 95.05, churnedMrr: 4.99 });
    expect(r.logoChurnMonthly).toBeCloseTo(0.1, 5); // 1 / (9 + 1)
    expect(r.revenueChurnMonthly).toBeCloseTo(4.99 / (95.05 + 4.99), 5);
  });
  it('revenue churn is null when churnedMrr is omitted (v1)', () => {
    const r = computeChurn({ payingNow: 9, churnedCount: 1, mrrNow: 95.05 });
    expect(r.logoChurnMonthly).toBeCloseTo(0.1, 5);
    expect(r.revenueChurnMonthly).toBeNull();
  });
  it('returns null when denominators are zero', () => {
    const r = computeChurn({ payingNow: 0, churnedCount: 0, mrrNow: 0 });
    expect(r.logoChurnMonthly).toBeNull();
    expect(r.revenueChurnMonthly).toBeNull();
  });
});

describe('toMrrRows', () => {
  const subs = [
    { tier: 'pro', status: 'active', stripeSubscriptionId: 'sub_1', currentPeriodStart: new Date('2026-07-01Z'), currentPeriodEnd: new Date('2026-08-01Z'), user: { currencyCode: 'PLN' } },
    { tier: 'business', status: 'active', stripeSubscriptionId: null, currentPeriodStart: null, currentPeriodEnd: null, user: { currencyCode: 'USD' } },
    { tier: 'free', status: 'active', stripeSubscriptionId: null, currentPeriodStart: null, currentPeriodEnd: null, user: { currencyCode: 'USD' } },
    { tier: 'pro', status: 'trialing', stripeSubscriptionId: 'sub_2', currentPeriodStart: null, currentPeriodEnd: null, user: { currencyCode: 'USD' } },
  ];

  it('keeps only rows the predicate accepts and carries the user currency through', () => {
    const paid = toMrrRows(subs, isStripePaidSub);
    expect(paid).toEqual([
      { tier: 'pro', currentPeriodStart: new Date('2026-07-01Z'), currentPeriodEnd: new Date('2026-08-01Z'), currencyCode: 'PLN' },
    ]);
  });

  it('builds the comped set from the same rows, so both sides share interval handling', () => {
    const comped = toMrrRows(subs, isComplimentarySub);
    expect(comped.map((r) => r.tier)).toEqual(['business']);
    // no Stripe period on a hand-granted tier -> subInterval defaults to monthly
    expect(normalizeMrr(comped)).toEqual({ mrrUsd: 19.99, approximate: false, payingUsers: 1 });
  });

  it('paid and comped sets are disjoint and never double-count a subscription', () => {
    const paid = toMrrRows(subs, isStripePaidSub);
    const comped = toMrrRows(subs, isComplimentarySub);
    expect(paid.length + comped.length).toBe(2);
  });

  it('falls back to USD when the user row carries no currency', () => {
    const rows = toMrrRows(
      [{ tier: 'pro', status: 'active', stripeSubscriptionId: 'sub_3', currentPeriodStart: null, currentPeriodEnd: null, user: null }],
      isStripePaidSub,
    );
    expect(rows[0].currencyCode).toBe('USD');
  });
});
