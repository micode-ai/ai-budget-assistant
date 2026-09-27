export const RESEND_GUARD_MS = 6 * 24 * 60 * 60 * 1000;

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function safeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
    return timeZone;
  } catch {
    return 'UTC';
  }
}

export function localParts(now: Date, timeZone: string): { weekday: number; hour: number; date: string } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: safeZone(timeZone), weekday: 'short', hour: 'numeric', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    weekday: WEEKDAYS[parts.weekday as string],
    hour: Number(parts.hour) % 24,
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/** ISO-8601 week of the user's LOCAL date — the lock key, one digest per local week. */
export function isoWeekKey(now: Date, timeZone: string): string {
  const [y, m, d] = localParts(now, timeZone).date.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon = 0
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // Thursday of this week
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

export function isDue(input: { now: Date; timeZone: string; day: number; hour: number; lastSentAt: Date | null }): boolean {
  if (input.lastSentAt && input.now.getTime() - input.lastSentAt.getTime() < RESEND_GUARD_MS) return false;
  const p = localParts(input.now, input.timeZone);
  return p.weekday === input.day && p.hour === input.hour;
}
