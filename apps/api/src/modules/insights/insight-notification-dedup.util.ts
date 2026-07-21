/** UTC calendar month containing `d`, as `YYYY-MM`. */
export function monthBucket(d: Date): string {
  const utcMidnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return new Date(utcMidnight).toISOString().slice(0, 7);
}

export function shieldDedupKey(canonicalName: string, periodMonth: string): string {
  return `shield:${canonicalName}:${periodMonth}`;
}
