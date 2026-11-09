import { computeActivationReport, inReportWindow, CURVE_WEEKS } from './admin-activation.util';
import { AdminActivationService } from './admin-activation.service';

const DAY = 24 * 60 * 60 * 1000;
// Wednesday 2026-11-11 12:00 UTC
const NOW = new Date('2026-11-11T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);
const day = (d: Date) => d.toISOString().slice(0, 10);

describe('inReportWindow', () => {
  it('covers the last `weeks` Monday-anchored weeks, current week included', () => {
    // Monday of NOW's week is 2026-11-09; 2 weeks back starts Monday 2026-11-02.
    expect(inReportWindow(new Date('2026-11-02T00:00:00Z'), 2, NOW)).toBe(true);
    expect(inReportWindow(new Date('2026-11-01T23:59:59Z'), 2, NOW)).toBe(false);
  });
});

describe('computeActivationReport', () => {
  it('counts D1/D7 activation only over signups old enough for the window', () => {
    const signups = [
      { userId: 'fast', createdAt: daysAgo(30), lastSyncAt: daysAgo(1) },
      { userId: 'slow', createdAt: daysAgo(30), lastSyncAt: daysAgo(1) },
      { userId: 'fresh', createdAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000), lastSyncAt: null },
    ];
    const firstTx = new Map([
      ['fast', { at: new Date(daysAgo(30).getTime() + 60 * 60 * 1000), source: 'ocr' }],
      ['slow', { at: daysAgo(25), source: 'manual' }],
      // Activated within its first two hours, but too young to count toward D1 yet.
      ['fresh', { at: new Date(NOW.getTime() - 60 * 60 * 1000), source: 'manual' }],
    ]);
    const { summary } = computeActivationReport(signups, new Map(), firstTx, NOW);

    expect(summary.signups).toBe(3);
    expect(summary.activated).toBe(3);
    expect(summary.d1Eligible).toBe(2);
    expect(summary.activatedD1).toBe(1);
    expect(summary.d7Eligible).toBe(2);
    expect(summary.activatedD7).toBe(2);
    // delays: 1 h, 120 h, 1 h → median 1
    expect(summary.medianHoursToFirst).toBe(1);
  });

  it('splits never-activated users into "came back" and "never returned"', () => {
    const signups = [
      { userId: 'gone', createdAt: daysAgo(10), lastSyncAt: new Date(daysAgo(10).getTime() + 60_000) },
      { userId: 'nullSync', createdAt: daysAgo(10), lastSyncAt: null },
      { userId: 'lurker', createdAt: daysAgo(10), lastSyncAt: daysAgo(2) },
      // Too young to judge — not counted as never-returned.
      { userId: 'today', createdAt: new Date(NOW.getTime() - 60_000), lastSyncAt: null },
    ];
    const { summary } = computeActivationReport(signups, new Map(), new Map(), NOW);
    expect(summary.neverActivated).toBe(4);
    expect(summary.neverReturned).toBe(2);
    expect(summary.medianHoursToFirst).toBeNull();
  });

  it('groups by first-transaction channel with W4 retention over eligible users', () => {
    const reg = new Date('2026-09-07T10:00:00Z'); // a Monday; week 4 = 2026-10-05..10-12
    const signups = [
      { userId: 'a', createdAt: reg, lastSyncAt: NOW },
      { userId: 'b', createdAt: reg, lastSyncAt: NOW },
      { userId: 'c', createdAt: reg, lastSyncAt: NOW },
    ];
    const activeDays = new Map([
      ['a', new Set(['2026-09-07', '2026-10-06'])], // weeks 0 and 4
      ['b', new Set(['2026-09-08'])],
      ['c', new Set(['2026-09-09', '2026-09-16', '2026-09-23'])],
    ]);
    const firstTx = new Map([
      ['a', { at: new Date('2026-09-07T11:00:00Z'), source: 'ocr' }],
      ['b', { at: new Date('2026-09-08T11:00:00Z'), source: 'ocr' }],
      ['c', { at: new Date('2026-09-09T11:00:00Z'), source: 'manual' }],
    ]);
    const { channels } = computeActivationReport(signups, activeDays, firstTx, NOW);
    expect(channels).toEqual([
      { source: 'ocr', users: 2, activatedD1: 1, avgActiveWeeks: 1.5, w4Retained: 1, w4Eligible: 2 },
      { source: 'manual', users: 1, activatedD1: 0, avgActiveWeeks: 3, w4Retained: 0, w4Eligible: 1 },
    ]);
  });

  it('builds per-week cohorts and a pooled curve that stays null for unfinished weeks', () => {
    const reg = daysAgo(9); // the week before NOW's week
    const signups = [
      { userId: 'a', createdAt: reg, lastSyncAt: NOW },
      { userId: 'b', createdAt: reg, lastSyncAt: NOW },
    ];
    const activeDays = new Map([['a', new Set([day(reg)])]]);
    const firstTx = new Map([['a', { at: reg, source: 'manual' }]]);
    const { cohorts, curve } = computeActivationReport(signups, activeDays, firstTx, NOW);

    expect(cohorts).toEqual([
      { cohortWeekStart: '2026-11-02', size: 2, activatedD1: 1, activatedD7: 1, d7Eligible: 2, activated: 1 },
    ]);
    expect(curve).toHaveLength(CURVE_WEEKS);
    expect(curve[0]).toEqual({ week: 0, rate: 0.5, users: 2 });
    expect(curve[1]).toEqual({ week: 1, rate: null, users: 0 });
  });
});

describe('AdminActivationService', () => {
  const OLD_ENV = process.env.ADMIN_EMAILS;
  afterEach(() => { process.env.ADMIN_EMAILS = OLD_ENV; });

  function make() {
    const recent = new Date(Date.now() - 3 * DAY);
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'u1', email: 'Owner@Team.io', createdAt: recent, lastSyncAt: null },
          { id: 'u2', email: 'someone@x.io', createdAt: recent, lastSyncAt: null },
        ]),
      },
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ user_id: 'u2', day: day(recent) }])
        .mockResolvedValueOnce([{ user_id: 'u2', created_at: recent, source: null }]),
    } as any;
    const cache = { get: jest.fn().mockResolvedValue(null), set: jest.fn() } as any;
    return { svc: new AdminActivationService(prisma, cache), cache };
  }

  it('leaves ADMIN_EMAILS accounts out by default, case-insensitively', async () => {
    process.env.ADMIN_EMAILS = 'owner@team.io';
    const { svc } = make();
    const res = await svc.getReport({ weeks: 26, includeInternal: false });
    expect(res.internalExcluded).toBe(true);
    expect(res.excludedAccounts).toBe(1);
    expect(res.summary.signups).toBe(1);
    // A null source reads as manual.
    expect(res.channels.map((c) => c.source)).toEqual(['manual']);
  });

  it('includes everyone when asked, and caches per parameter set', async () => {
    process.env.ADMIN_EMAILS = 'owner@team.io';
    const { svc, cache } = make();
    const res = await svc.getReport({ weeks: 12, includeInternal: true });
    expect(res.excludedAccounts).toBe(0);
    expect(res.summary.signups).toBe(2);
    expect(cache.set).toHaveBeenCalledWith('admin:activation:12:1', res, 600);
  });
});
