/**
 * Pure building blocks for Net Worth (ABA-799): what a debt, a holding or a
 * wallet held at a past month-end. No Prisma, no DI — tested directly.
 * See docs/superpowers/specs/2026-11-16-net-worth-design.md.
 */

export interface NetWorthParts {
  cash: number;
  investments: number;
  owedToMe: number;
  debts: number;
  net: number;
}

export const r2 = (n: number) => Math.round(n * 100) / 100;

export function withNet(p: Omit<NetWorthParts, 'net'>): NetWorthParts {
  return {
    cash: r2(p.cash),
    investments: r2(p.investments),
    owedToMe: r2(p.owedToMe),
    debts: r2(p.debts),
    net: r2(p.cash + p.investments + p.owedToMe - p.debts),
  };
}

/** `YYYY-MM` of a date, local time. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * The last `count` month-ends, oldest first: each past month's last moment,
 * and `now` itself for the current month (its "end" is today).
 */
export function monthEnds(now: Date, count = 12): { month: string; at: Date; current: boolean }[] {
  const out: { month: string; at: Date; current: boolean }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    if (i === 0) {
      out.push({ month: monthKey(now), at: now, current: true });
    } else {
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      out.push({ month: monthKey(end), at: end, current: false });
    }
  }
  return out;
}

export interface DebtRow {
  id: string;
  amount: number;
  currencyCode: string;
  date: Date;
}

export interface RepaymentRow {
  debtId: string;
  amount: number;
  date: Date;
}

/**
 * What each debt still owed at `at`, by currency: debts recorded by then,
 * minus repayments made by then, never below zero.
 */
export function debtRemainingAt(debts: DebtRow[], repayments: RepaymentRow[], at: Date): Map<string, number> {
  const repaid = new Map<string, number>();
  for (const r of repayments) {
    if (r.date <= at) repaid.set(r.debtId, (repaid.get(r.debtId) ?? 0) + r.amount);
  }
  const out = new Map<string, number>();
  for (const d of debts) {
    if (d.date > at) continue;
    const left = Math.max(0, d.amount - (repaid.get(d.id) ?? 0));
    if (left > 0) out.set(d.currencyCode, (out.get(d.currencyCode) ?? 0) + left);
  }
  return out;
}

export interface TradeRow {
  type: string; // buy | sell
  quantity: number;
  date: Date;
}

/**
 * Units held at `at`. A holding with trades is rebuilt from them; one entered
 * as a bare quantity (no trades) counts that quantity from the day it was
 * created.
 */
export function quantityAt(
  holding: { quantity: number; createdAt: Date },
  trades: TradeRow[],
  at: Date,
): number {
  if (trades.length === 0) return holding.createdAt <= at ? holding.quantity : 0;
  let q = 0;
  for (const t of trades) {
    if (t.date > at) continue;
    q += t.type === 'sell' ? -t.quantity : t.quantity;
  }
  return Math.max(0, q);
}

/** The last close on or before `at` from date-ascending prices, or null. */
export function closeOnOrBefore(prices: { date: Date; close: number }[], at: Date): number | null {
  let found: number | null = null;
  for (const p of prices) {
    if (p.date > at) break;
    found = p.close;
  }
  return found;
}

/** Converts with EUR-based rates (1 EUR = rates[X] X); null when either side is unknown. */
export function convertViaEur(amount: number, from: string, to: string, eurRates: Record<string, number>): number | null {
  if (from === to) return amount;
  const f = from === 'EUR' ? 1 : eurRates[from];
  const t = to === 'EUR' ? 1 : eurRates[to];
  if (!f || !t) return null;
  return (amount / f) * t;
}
