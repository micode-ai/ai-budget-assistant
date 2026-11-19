import type { Vehicle, VehicleCostKind } from '@budget/shared-types';
import { toDateInputValue } from '@/utils/dateInput';

/**
 * Renewal dates of a vehicle in the app (ABA-829): the "due soon" chips and
 * the form's PATCH body. The pushes themselves are the API's
 * (`vehicle-renewal.util.ts`, ABA-827); these rules only decide what the
 * screens show. Every date is a calendar day (`YYYY-MM-DD`), compared by its
 * components — never through `toISOString()` / `new Date(string)`.
 */

export type RenewalKind = 'insurance' | 'inspection' | 'service';
export const RENEWAL_KINDS: RenewalKind[] = ['insurance', 'inspection', 'service'];

/** A date this close (or past) shows as a chip. */
export const DUE_SOON_DAYS = 30;
/** Kilometres before the service target that show as a chip — the API's nudge threshold. */
export const ODOMETER_SOON_KM = 500;

export type RenewalField = 'nextInsuranceDate' | 'nextInspectionDate' | 'nextServiceDate';

export const RENEWAL_FIELD: Record<RenewalKind, RenewalField> = {
  insurance: 'nextInsuranceDate',
  inspection: 'nextInspectionDate',
  service: 'nextServiceDate',
};

export type RenewalDue =
  | { kind: RenewalKind; by: 'date'; date: string; days: number }
  | { kind: 'service'; by: 'odometer'; targetKm: number; kmLeft: number };

type RenewalVehicle = Pick<Vehicle, RenewalField | 'nextServiceOdometer'>;

/** `YYYY-MM-DD` of a date-only value as the API sends it (a bare day or a midnight-UTC ISO stamp). */
export function dayKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function dayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Whole calendar days from `from` to `to` (negative when `to` is past). */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

/** Today as the device's local calendar day. */
export function todayKey(now: Date = new Date()): string {
  return toDateInputValue(now);
}

/**
 * What to show as due: dates within {@link DUE_SOON_DAYS} or overdue, and the
 * service by odometer once the latest reading is within
 * {@link ODOMETER_SOON_KM} of the target (or past it). Most urgent first.
 */
export function dueRenewals(vehicle: RenewalVehicle, today: string, latestOdometerKm: number | null | undefined): RenewalDue[] {
  const out: RenewalDue[] = [];
  for (const kind of RENEWAL_KINDS) {
    const date = dayKey(vehicle[RENEWAL_FIELD[kind]]);
    if (!date) continue;
    const days = daysBetween(today, date);
    if (days <= DUE_SOON_DAYS) out.push({ kind, by: 'date', date, days });
  }
  const target = vehicle.nextServiceOdometer;
  if (target != null && latestOdometerKm != null) {
    const kmLeft = target - latestOdometerKm;
    if (kmLeft <= ODOMETER_SOON_KM) out.push({ kind: 'service', by: 'odometer', targetKm: target, kmLeft });
  }
  // Overdue first, then dates soonest first; the odometer (no day to compare) after the dates.
  const rank = (r: RenewalDue) => (isOverdue(r) ? 0 : 1);
  const days = (r: RenewalDue) => (r.by === 'date' ? r.days : Number.MAX_SAFE_INTEGER);
  return out.sort((a, b) => rank(a) - rank(b) || days(a) - days(b));
}

/** Overdue (a past date, or the odometer at/past the target): drawn in the danger colour. */
export function isOverdue(r: RenewalDue): boolean {
  return r.by === 'date' ? r.days < 0 : r.kmLeft <= 0;
}

/** Same calendar day one year later; Feb 29 clamps to Feb 28 (the API's `rollForwardYear`). */
export function rollForwardYear(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const last = new Date(Date.UTC(y + 1, m, 0)).getUTCDate();
  return `${y + 1}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** Form state of the four renewal fields: days as `YYYY-MM-DD` or null, odometer as typed. */
export interface RenewalForm {
  nextInsuranceDate: string | null;
  nextInspectionDate: string | null;
  nextServiceDate: string | null;
  nextServiceOdometer: string;
}

export function renewalFormFrom(vehicle: RenewalVehicle | null): RenewalForm {
  return {
    nextInsuranceDate: dayKey(vehicle?.nextInsuranceDate),
    nextInspectionDate: dayKey(vehicle?.nextInspectionDate),
    nextServiceDate: dayKey(vehicle?.nextServiceDate),
    nextServiceOdometer: vehicle?.nextServiceOdometer != null ? String(vehicle.nextServiceOdometer) : '',
  };
}

export type RenewalPatch = Partial<Record<RenewalField, string | null>> & { nextServiceOdometer?: number | null };

/**
 * The PATCH body for what changed — only changed fields, a cleared one as
 * `null` (an omitted field keeps the server's value). `odometer` is the parsed
 * form value: null when empty, `undefined` when the text is not a reading
 * (the caller blocks saving then). Sending an unchanged odometer would re-arm
 * the server's nudge, hence the diff.
 */
export function renewalPatch(
  initial: RenewalForm,
  form: RenewalForm,
  odometer: number | null | undefined,
): RenewalPatch {
  const patch: RenewalPatch = {};
  for (const kind of RENEWAL_KINDS) {
    const f = RENEWAL_FIELD[kind];
    if (form[f] !== initial[f]) patch[f] = form[f];
  }
  const before = initial.nextServiceOdometer.trim() === '' ? null : Number(initial.nextServiceOdometer);
  if (odometer !== undefined && odometer !== before) patch.nextServiceOdometer = odometer;
  return patch;
}

/**
 * The odometer the service chip compares against: the server's reading over
 * every fill-up, else (an API that predates the field) the highest in the
 * listed items.
 */
export function latestOdometer(source: {
  latestOdometerKm?: number | null;
  items?: { odometerKm?: number }[];
}): number | null {
  if (source.latestOdometerKm != null) return source.latestOdometerKm;
  const readings = (source.items ?? []).map((i) => i.odometerKm).filter((km): km is number => km != null);
  return readings.length > 0 ? Math.max(...readings) : null;
}

/**
 * An expense's calendar day. Typed `Date`, but a row can still hold the
 * server's string: that one is read by its components, never `new Date(string)`.
 */
export function expenseDayKey(date: Date | string): string | null {
  if (typeof date === 'string') return dayKey(date);
  return Number.isNaN(date.getTime()) ? null : toDateInputValue(date);
}

/** How far ahead a paid renewal may already be set and still be offered a roll-forward. */
export const ROLL_FORWARD_WINDOW_DAYS = 60;

/** The renewal field a cost kind pays for; inspection has no cost kind of its own. */
export function renewalFieldForCost(kind: VehicleCostKind): RenewalField | null {
  if (kind === 'insurance') return 'nextInsuranceDate';
  if (kind === 'service') return 'nextServiceDate';
  return null;
}

/**
 * The next date to offer after an insurance or service cost is logged, or
 * null for no offer. With a date set it is rolled a year forward only while
 * it is due (within {@link ROLL_FORWARD_WINDOW_DAYS} or past) — a date
 * already a year out was rolled before. With none set, a year from the
 * expense's own day.
 */
export function proposedRenewal(current: string | null | undefined, expenseDay: string, today: string): string | null {
  const day = dayKey(current);
  if (!day) {
    const paid = dayKey(expenseDay);
    return paid ? rollForwardYear(paid) : null;
  }
  return daysBetween(today, day) <= ROLL_FORWARD_WINDOW_DAYS ? rollForwardYear(day) : null;
}
