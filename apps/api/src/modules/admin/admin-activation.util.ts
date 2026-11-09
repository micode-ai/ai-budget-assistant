// Pure calculator for the activation & retention report (ABA-731). No Prisma, no I/O;
// `now` is injected so specs are deterministic. All boundaries are UTC.
//
// Definitions are shared with the investor metrics on purpose — a user is "active in
// week n" when they logged a non-deleted expense or income during the n-th week after
// the Monday of their signup week (`computeWeeklyRetention`) — so the two pages agree.

import type {
  ActivationChannelRow,
  ActivationCohortRow,
  ActivationSummary,
  RetentionCurvePoint,
} from '@budget/shared-types';
import { computeWeeklyRetention, utcDay, utcMonday } from './admin-metrics.util';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** Weeks 0..CURVE_WEEKS-1 on the retention curve. */
export const CURVE_WEEKS = 13;

export interface ActivationSignup {
  userId: string;
  createdAt: Date;
  lastSyncAt: Date | null;
}

export interface FirstTransaction {
  at: Date;
  source: string;
}

export interface ActivationReport {
  summary: ActivationSummary;
  cohorts: ActivationCohortRow[];
  channels: ActivationChannelRow[];
  curve: RetentionCurvePoint[];
}

/** Signups whose signup week is one of the last `weeks` Monday-anchored weeks, current included. */
export function inReportWindow(createdAt: Date, weeks: number, now: Date): boolean {
  const firstMonday = utcMonday(now).getTime() - (weeks - 1) * 7 * DAY_MS;
  return createdAt.getTime() >= firstMonday && createdAt.getTime() <= now.getTime();
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * @param signups   the report's population — already windowed and with internal accounts removed
 * @param activeDays userId → set of UTC days (`YYYY-MM-DD`) with at least one transaction
 * @param firstTx    userId → the user's first transaction ever (time + source)
 */
export function computeActivationReport(
  signups: ActivationSignup[],
  activeDays: Map<string, Set<string>>,
  firstTx: Map<string, FirstTransaction>,
  now: Date,
): ActivationReport {
  const nowMs = now.getTime();

  const summary: ActivationSummary = {
    signups: signups.length,
    activated: 0,
    activatedD1: 0,
    d1Eligible: 0,
    activatedD7: 0,
    d7Eligible: 0,
    medianHoursToFirst: null,
    neverActivated: 0,
    neverReturned: 0,
  };
  const hoursToFirst: number[] = [];
  const cohorts = new Map<string, ActivationCohortRow>();
  const channels = new Map<string, { users: number; d1: number; weeks: number; w4: number; w4Eligible: number }>();

  for (const s of signups) {
    const reg = s.createdAt.getTime();
    const age = nowMs - reg;
    const first = firstTx.get(s.userId);
    // `createdAt` of a transaction is when it was logged, not its date, so it normally
    // follows signup; clamp anyway so a restored backup cannot produce a negative delay.
    const delay = first ? Math.max(0, first.at.getTime() - reg) : null;
    const d1 = delay != null && delay < DAY_MS;
    const d7 = delay != null && delay < 7 * DAY_MS;

    const cohortKey = utcDay(utcMonday(s.createdAt));
    let row = cohorts.get(cohortKey);
    if (!row) {
      row = { cohortWeekStart: cohortKey, size: 0, activatedD1: 0, activatedD7: 0, d7Eligible: 0, activated: 0 };
      cohorts.set(cohortKey, row);
    }
    row.size++;

    // A rate is only honest over users old enough to have had the whole window.
    if (age >= DAY_MS) {
      summary.d1Eligible++;
      if (d1) summary.activatedD1++;
    }
    if (age >= 7 * DAY_MS) {
      summary.d7Eligible++;
      row.d7Eligible++;
      if (d7) {
        summary.activatedD7++;
        row.activatedD7++;
      }
    }
    if (d1 && age >= DAY_MS) row.activatedD1++;

    if (!first) {
      summary.neverActivated++;
      const seenLater = s.lastSyncAt != null && s.lastSyncAt.getTime() - reg >= DAY_MS;
      if (age >= DAY_MS && !seenLater) summary.neverReturned++;
      continue;
    }

    summary.activated++;
    row.activated++;
    hoursToFirst.push(delay! / HOUR_MS);

    // Channel = how the very first transaction was entered.
    const ch = channels.get(first.source) ?? { users: 0, d1: 0, weeks: 0, w4: 0, w4Eligible: 0 };
    ch.users++;
    if (d1) ch.d1++;
    const days = activeDays.get(s.userId) ?? new Set<string>();
    const weeksSeen = new Set<string>();
    for (const d of days) weeksSeen.add(utcDay(utcMonday(new Date(`${d}T00:00:00Z`))));
    ch.weeks += weeksSeen.size;
    const start = utcMonday(s.createdAt).getTime();
    const w4Start = start + 28 * DAY_MS;
    const w4End = start + 35 * DAY_MS;
    if (nowMs >= w4End) {
      ch.w4Eligible++;
      const a = utcDay(new Date(w4Start));
      const b = utcDay(new Date(w4End));
      for (const d of days) if (d >= a && d < b) { ch.w4++; break; }
    }
    channels.set(first.source, ch);
  }

  const med = median(hoursToFirst);
  summary.medianHoursToFirst = med == null ? null : Math.round(med * 10) / 10;

  // The curve pools every cohort's week-n rate, weighted by cohort size, over the
  // cohorts whose week n has fully elapsed — the same pooling as the investor headline.
  const retention = computeWeeklyRetention(
    signups.map((s) => ({ userId: s.userId, createdAt: s.createdAt })),
    activeDays,
    Math.max(CURVE_WEEKS, cohorts.size),
    now,
  );
  const curve: RetentionCurvePoint[] = [];
  for (let n = 0; n < CURVE_WEEKS; n++) {
    let active = 0;
    let users = 0;
    for (const r of retention.weekly) {
      const rate = r.retention[n];
      if (rate == null) continue;
      active += Math.round(rate * r.cohortSize);
      users += r.cohortSize;
    }
    curve.push({ week: n, rate: users > 0 ? active / users : null, users });
  }

  return {
    summary,
    cohorts: [...cohorts.values()].sort((a, b) => a.cohortWeekStart.localeCompare(b.cohortWeekStart)),
    channels: [...channels.entries()]
      .map(([source, c]) => ({
        source,
        users: c.users,
        activatedD1: c.d1,
        avgActiveWeeks: Math.round((c.weeks / c.users) * 10) / 10,
        w4Retained: c.w4,
        w4Eligible: c.w4Eligible,
      }))
      .sort((a, b) => b.users - a.users || a.source.localeCompare(b.source)),
    curve,
  };
}
