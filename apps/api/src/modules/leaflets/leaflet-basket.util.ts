export interface BasketProduct {
  name: string;
  count: number;
}

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 90;

function inWindow(date: Date, now: Date): boolean {
  const age = now.getTime() - date.getTime();
  return age >= 0 && age <= WINDOW_DAYS * DAY_MS;
}

/**
 * The user's usual basket: resolved names bought at least twice in the last 90 days
 * plus unchecked shopping-list names, most frequent first, capped.
 */
export function buildUsualBasket(
  rows: { resolvedName: string; date: Date }[],
  listNames: string[],
  now: Date,
  cap = 150,
): BasketProduct[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.resolvedName || !inWindow(row.date, now)) continue;
    counts.set(row.resolvedName, (counts.get(row.resolvedName) ?? 0) + 1);
  }
  const basket: BasketProduct[] = [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, cap);
  const seen = new Set(basket.map((b) => b.name));
  for (const name of listNames) {
    if (basket.length >= cap) break;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    basket.push({ name, count: counts.get(name) ?? 0 });
  }
  return basket;
}

/** Median per-unit price paid in the last 90 days in `currency` only — no FX conversion. */
export function usualPrice(
  rows: { resolvedName: string; date: Date; unitPrice: number; currency: string }[],
  name: string,
  currency: string,
  now: Date,
): number | null {
  const prices = rows
    .filter((r) => r.resolvedName === name && r.currency === currency && inWindow(r.date, now) && r.unitPrice > 0)
    .map((r) => r.unitPrice)
    .sort((a, b) => a - b);
  if (prices.length === 0) return null;
  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
  return Math.round(median * 100) / 100;
}

/** Closed-set resolution: an integer in range and not yet used, else null. Never guesses. */
export function resolveBasketIndex(index: unknown, basket: BasketProduct[], used: Set<number>): string | null {
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= basket.length) return null;
  if (used.has(index)) return null;
  used.add(index);
  return basket[index].name;
}
