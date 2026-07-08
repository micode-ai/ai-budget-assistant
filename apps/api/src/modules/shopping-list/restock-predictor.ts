import type { RestockSuggestion } from '@budget/shared-types';

const MIN_PURCHASES = 3;
const DAY_MS = 86_400_000;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function predictRestock(
  purchasesByProduct: Map<string, Date[]>,
  now: Date = new Date(),
): RestockSuggestion[] {
  const out: RestockSuggestion[] = [];
  for (const [canonicalName, datesRaw] of purchasesByProduct.entries()) {
    const dates = [...datesRaw].sort((a, b) => a.getTime() - b.getTime());
    if (dates.length < MIN_PURCHASES) continue;
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      gaps.push((dates[i].getTime() - dates[i - 1].getTime()) / DAY_MS);
    }
    const medianGapDays = median(gaps);
    if (medianGapDays <= 0) continue;
    const last = dates[dates.length - 1];
    const daysSinceLast = (now.getTime() - last.getTime()) / DAY_MS;
    out.push({
      canonicalName,
      lastPurchase: last.toISOString().slice(0, 10),
      medianGapDays: Math.round(medianGapDays * 10) / 10,
      dueInDays: Math.round(medianGapDays - daysSinceLast),
      purchaseCount: dates.length,
    });
  }
  return out.sort((a, b) => a.dueInDays - b.dueInDays);
}
