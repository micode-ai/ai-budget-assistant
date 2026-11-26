import type { UtilityKind, UtilityKindStats, UtilityUnit } from '@budget/shared-types';

export interface UtilityEntry {
  date: Date;
  kind: UtilityKind;
  unit: UtilityUnit;
  consumption: number;
  /** In the display currency; null = unknown FX rate (excluded from cost). */
  cost: number | null;
}

/** A rise above this versus the 3-month average raises the nudge. */
export const PRICE_NUDGE_THRESHOLD_PCT = 10;

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
const monthKey = (d: Date) => d.toISOString().slice(0, 7);
const shiftYear = (m: string) => `${Number(m.slice(0, 4)) - 1}${m.slice(4)}`;
const pct = (now: number | null, before: number | null) =>
  now === null || before === null || before <= 0 ? null : round(((now - before) / before) * 100, 1);

/** See docs/contracts/utility-bill-readings.md. */
export function computeUtilityStats(entries: UtilityEntry[]): UtilityKindStats[] {
  const byKind = new Map<UtilityKind, UtilityEntry[]>();
  for (const e of entries) {
    if (!(e.consumption > 0)) continue;
    byKind.set(e.kind, [...(byKind.get(e.kind) ?? []), e]);
  }
  const result: UtilityKindStats[] = [];
  for (const [kind, list] of byKind) {
    const buckets = new Map<string, { consumption: number; priced: number; cost: number }>();
    for (const e of list) {
      const b = buckets.get(monthKey(e.date)) ?? { consumption: 0, priced: 0, cost: 0 };
      b.consumption += e.consumption;
      if (e.cost !== null) {
        b.priced += e.consumption;
        b.cost += e.cost;
      }
      buckets.set(monthKey(e.date), b);
    }
    const months = [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, b]) => ({
        month,
        consumption: round(b.consumption, 3),
        cost: round(b.cost, 2),
        unitPrice: b.priced > 0 ? round(b.cost / b.priced, 4) : null,
      }));

    const latest = months[months.length - 1];
    let yearOverYear: UtilityKindStats['yearOverYear'] = null;
    if (months.length >= 12) {
      const prev = months.find((m) => m.month === shiftYear(latest.month));
      if (prev) {
        yearOverYear = {
          month: latest.month,
          previousMonth: prev.month,
          unitPriceChangePct: pct(latest.unitPrice, prev.unitPrice),
          consumptionChangePct: pct(latest.consumption, prev.consumption),
        };
      }
    }

    let priceNudge: UtilityKindStats['priceNudge'] = null;
    const before = months
      .slice(0, -1)
      .slice(-3)
      .map((m) => m.unitPrice)
      .filter((p): p is number => p !== null);
    if (latest.unitPrice !== null && before.length >= 2) {
      const baseline = before.reduce((s, p) => s + p, 0) / before.length;
      const risePct = pct(latest.unitPrice, baseline);
      if (risePct !== null && risePct > PRICE_NUDGE_THRESHOLD_PCT) {
        priceNudge = { month: latest.month, unitPrice: latest.unitPrice, baseline: round(baseline, 4), risePct };
      }
    }
    result.push({ kind, unit: list[list.length - 1].unit, months, yearOverYear, priceNudge });
  }
  return result.sort((a, b) => a.kind.localeCompare(b.kind));
}
