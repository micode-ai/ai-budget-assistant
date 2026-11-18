/** Renewal reminders for a vehicle (ABA-827). Pure: no I/O, so the cron and its spec share one rule. */
export const RENEWAL_KINDS = ['insurance', 'inspection', 'service'] as const;
export type RenewalKind = (typeof RENEWAL_KINDS)[number];

/** Days before a date on which a push is sent. */
export const REMINDER_DAYS = [14, 2] as const;
/** Kilometres before the service odometer target at which the nudge fires. */
export const ODOMETER_NUDGE_KM = 500;

export interface RenewalVehicle {
  nextInsuranceDate: Date | null;
  nextInspectionDate: Date | null;
  nextServiceDate: Date | null;
}

const DAY_MS = 86_400_000;

function utcDay(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY_MS);
}

/** Whole calendar days from `today` to `date` (negative when past). */
export function daysUntil(date: Date, today: Date): number {
  return utcDay(date) - utcDay(today);
}

/** The pushes due today: a date exactly 14 or 2 days away. Past dates never fire. */
export function dueRenewals(v: RenewalVehicle, today: Date): { kind: RenewalKind; days: number }[] {
  const dates: Record<RenewalKind, Date | null> = {
    insurance: v.nextInsuranceDate,
    inspection: v.nextInspectionDate,
    service: v.nextServiceDate,
  };
  const out: { kind: RenewalKind; days: number }[] = [];
  for (const kind of RENEWAL_KINDS) {
    const d = dates[kind];
    if (!d) continue;
    const days = daysUntil(d, today);
    if ((REMINDER_DAYS as readonly number[]).includes(days)) out.push({ kind, days });
  }
  return out;
}

/** True once the latest odometer is within 500 km of the target (or past it) and not yet nudged for it. */
export function odometerNudgeDue(
  target: number | null,
  latestKm: number | null,
  nudgedFor: number | null,
): boolean {
  if (target == null || latestKm == null || nudgedFor === target) return false;
  return target - latestKm <= ODOMETER_NUDGE_KM;
}

/** Same calendar day one year later; Feb 29 clamps to Feb 28. */
export function rollForwardYear(date: Date): Date {
  const y = date.getUTCFullYear() + 1;
  const m = date.getUTCMonth();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(date.getUTCDate(), last)));
}
