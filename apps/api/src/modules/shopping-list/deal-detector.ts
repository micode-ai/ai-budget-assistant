import type { DealSuggestion } from '@budget/shared-types';

export interface DealRow {
  resolvedName: string;
  date: Date;
  unitPrice: number;
  merchant: string;
  currency: string;
}

const DAY_MS = 86_400_000;
const DROP = 0.15;
const RECENT_DAYS = 14;
const BASELINE_DAYS = 90;
const MIN_POINTS = 3;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function majorityCurrency(rows: DealRow[]): string {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.currency, (counts.get(r.currency) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

export function detectDeals(rows: DealRow[], now: Date = new Date()): DealSuggestion[] {
  const baselineStart = new Date(now.getTime() - BASELINE_DAYS * DAY_MS);
  const recentStart = new Date(now.getTime() - RECENT_DAYS * DAY_MS);

  const byProduct = new Map<string, DealRow[]>();
  for (const row of rows) {
    if (row.date < baselineStart) continue;
    const arr = byProduct.get(row.resolvedName) ?? [];
    arr.push(row);
    byProduct.set(row.resolvedName, arr);
  }

  const deals: DealSuggestion[] = [];
  for (const [name, prs] of byProduct.entries()) {
    const currency = majorityCurrency(prs);
    const pts = prs.filter((p) => p.currency === currency);
    if (pts.length < MIN_POINTS) continue;
    const avg = pts.reduce((s, p) => s + p.unitPrice, 0) / pts.length;
    if (avg <= 0) continue;

    const latestByStore = new Map<string, { price: number; date: Date }>();
    for (const p of pts) {
      if (p.date < recentStart) continue;
      const cur = latestByStore.get(p.merchant);
      if (!cur || p.date > cur.date) latestByStore.set(p.merchant, { price: p.unitPrice, date: p.date });
    }

    for (const [merchant, l] of latestByStore.entries()) {
      if (l.price <= avg * (1 - DROP)) {
        deals.push({
          canonicalName: name,
          merchant,
          price: round2(l.price),
          avgPrice: round2(avg),
          dropPct: Math.round((1 - l.price / avg) * 100),
          currency,
        });
      }
    }
  }

  return deals.sort((a, b) => b.dropPct - a.dropPct);
}
