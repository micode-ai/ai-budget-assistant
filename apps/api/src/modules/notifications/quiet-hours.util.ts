/** Quiet-hours window maths in the user's timezone. Unknown timezone falls back to UTC. */

function safeTz(tz: string | null | undefined): string {
  const t = tz || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: t });
    return t;
  } catch {
    return 'UTC';
  }
}

/** Minutes since local midnight at `now` in `tz`. */
export function localMinutes(now: Date, tz: string | null | undefined): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: safeTz(tz),
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return (h % 24) * 60 + m;
}

export function isInQuietHours(now: Date, tz: string | null | undefined, start: number, end: number): boolean {
  if (start === end) return false;
  const cur = localMinutes(now, tz);
  return start < end ? cur >= start && cur < end : cur >= start || cur < end;
}

/** The next instant (strictly after `now`) at which the local clock reads `end`. */
export function quietHoursReleaseAt(now: Date, tz: string | null | undefined, end: number): Date {
  const cur = localMinutes(now, tz);
  let delta = end - cur;
  if (delta <= 0) delta += 24 * 60;
  // Round down to the minute so the release lands exactly on the boundary.
  const base = Math.floor(now.getTime() / 60000) * 60000;
  return new Date(base + delta * 60000);
}

export function isValidMinuteOfDay(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1439;
}
