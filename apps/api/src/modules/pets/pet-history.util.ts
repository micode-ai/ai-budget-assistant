/** The periods the pet screen offers, in months; 0 = everything ever recorded. */
export const PET_HISTORY_PERIODS = [3, 6, 12, 24, 0] as const;
export const PET_COST_KINDS = ['food', 'vet', 'grooming', 'supplies', 'insurance', 'other'] as const;
export const PET_SPECIES = ['dog', 'cat', 'other'] as const;

export interface PetCostInput {
  expenseId: string;
  clientId: string | null;
  date: Date;
  amount: number;
  currencyCode: string;
  /** In the display currency; null = no known rate. */
  amountBase: number | null;
  merchant: string | null;
  description: string | null;
  kind: string;
}

export interface PetHistoryItem {
  expenseId: string;
  clientId: string | null;
  date: string;
  kind: string;
  amount: number;
  currencyCode: string;
  amountBase: number | null;
  merchant: string | null;
  description: string | null;
}

export interface PetHistory {
  months: number;
  from: string | null;
  total: number;
  perMonth: number;
  byKind: Record<string, number>;
  monthly: { month: string; total: number; byKind: Record<string, number> }[];
  items: PetHistoryItem[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const monthKey = (d: Date) => d.toISOString().slice(0, 7);
const emptyKinds = (): Record<string, number> => Object.fromEntries(PET_COST_KINDS.map((k) => [k, 0]));

/** First day (UTC) of a window of `months` calendar months ending with the current one. */
export function petWindowStart(now: Date, months: number): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
}

/** Pure: one period of a pet's costs by month and kind. Amounts arrive converted. */
export function computePetHistory(costs: PetCostInput[], months: number, now: Date = new Date()): PetHistory {
  let from: Date | null;
  if (months > 0) from = petWindowStart(now, months);
  else if (costs.length > 0) {
    const first = new Date(Math.min(...costs.map((c) => c.date.getTime())));
    from = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
  } else from = null;

  const monthly: PetHistory['monthly'] = [];
  if (from) {
    const end = monthKey(now);
    const cursor = new Date(from.getTime());
    while (monthKey(cursor) <= end) {
      monthly.push({ month: monthKey(cursor), total: 0, byKind: emptyKinds() });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }
  const byMonth = new Map(monthly.map((m) => [m.month, m]));
  const byKind = emptyKinds();
  let total = 0;
  const items: PetHistoryItem[] = [];

  for (const c of costs) {
    if (from === null || c.date.getTime() < from.getTime()) continue;
    if (c.amountBase !== null) {
      byKind[c.kind] = (byKind[c.kind] ?? 0) + c.amountBase;
      total += c.amountBase;
      const m = byMonth.get(monthKey(c.date));
      if (m) {
        m.byKind[c.kind] = (m.byKind[c.kind] ?? 0) + c.amountBase;
        m.total += c.amountBase;
      }
    }
    items.push({
      expenseId: c.expenseId,
      clientId: c.clientId,
      date: c.date.toISOString().slice(0, 10),
      kind: c.kind,
      amount: c.amount,
      currencyCode: c.currencyCode,
      amountBase: c.amountBase,
      merchant: c.merchant,
      description: c.description,
    });
  }
  items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const round = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r2(v)]));
  return {
    months,
    from: from ? from.toISOString().slice(0, 10) : null,
    total: r2(total),
    perMonth: monthly.length > 0 ? r2(total / monthly.length) : 0,
    byKind: round(byKind),
    monthly: monthly.map((m) => ({ month: m.month, total: r2(m.total), byKind: round(m.byKind) })),
    items,
  };
}
