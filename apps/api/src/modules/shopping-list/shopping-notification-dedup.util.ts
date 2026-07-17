const DAY_MS = 86_400_000;

/** Monday (UTC) of the week containing `d`, as an ISO date string YYYY-MM-DD. */
export function weekBucket(d: Date): string {
  const utcMidnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dayNum = (new Date(utcMidnight).getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  const monday = new Date(utcMidnight - dayNum * DAY_MS);
  return monday.toISOString().slice(0, 10);
}

export function restockDedupKey(canonicalName: string, lastPurchaseISO: string): string {
  return `restock:${canonicalName}:${lastPurchaseISO}`;
}

export function dealDedupKey(canonicalName: string, merchant: string, week: string): string {
  return `deal:${canonicalName}:${merchant}:${week}`;
}
