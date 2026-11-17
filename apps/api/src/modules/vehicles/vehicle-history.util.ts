import { computeFuelStats } from './fuel-stats.util';

/** The periods the vehicle screen offers, in months; 0 = everything ever recorded. */
export const HISTORY_PERIODS = [3, 6, 12, 24, 0] as const;
export type HistoryPeriod = (typeof HISTORY_PERIODS)[number];

export const COST_KINDS = ['fuel', 'service', 'insurance', 'parking', 'tax', 'other'] as const;

/** One fill-up, its amount already in the display currency (null = no known rate). */
export interface HistoryFuelInput {
  expenseId: string;
  clientId: string | null;
  date: Date;
  amount: number;
  currencyCode: string;
  amountBase: number | null;
  merchant: string | null;
  description: string | null;
  liters: number;
  odometerKm: number;
  isFullTank: boolean;
}

/** One non-fill-up cost (a `VehicleCost` row other than `none`). */
export interface HistoryCostInput {
  expenseId: string;
  clientId: string | null;
  date: Date;
  amount: number;
  currencyCode: string;
  amountBase: number | null;
  merchant: string | null;
  description: string | null;
  kind: string;
}

export interface VehicleHistoryItem {
  expenseId: string;
  clientId: string | null;
  date: string;
  kind: string;
  amount: number;
  currencyCode: string;
  /** In the display currency; null when the rate is unknown (then left out of every total). */
  amountBase: number | null;
  merchant: string | null;
  description: string | null;
  liters?: number;
  odometerKm?: number;
  isFullTank?: boolean;
}

export interface VehicleHistory {
  /** The period asked for; 0 = all time. */
  months: number;
  /** First day of the window (`YYYY-MM-DD`); null for all time with nothing recorded. */
  from: string | null;
  total: number;
  /** `total` over the months in the window (`monthly.length`). */
  perMonth: number;
  byKind: Record<string, number>;
  /** Odometer span of the window's fill-ups; 0 under two of them. */
  km: number;
  costPerKm: number | null;
  /** Full-tank consumption over the window's segments; null without one. */
  consumptionLPer100Km: number | null;
  /** Every calendar month of the window, oldest first, empty months included. */
  monthly: { month: string; total: number; byKind: Record<string, number> }[];
  /** One point per full-tank segment ending in the window. */
  consumption: { date: string; lPer100Km: number; costPer100Km: number }[];
  /** Every fill-up and cost in the window, newest first. */
  items: VehicleHistoryItem[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const monthKey = (d: Date) => d.toISOString().slice(0, 7);

/**
 * First day (UTC) of a window of `months` calendar months ending with the
 * current one. Shared with the ownership figure on `GET /vehicles/:id/stats`,
 * so the Analytics card and the vehicle screen's 12 months are the same months.
 */
export function windowStart(now: Date, months: number): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
}

function emptyKinds(): Record<string, number> {
  return Object.fromEntries(COST_KINDS.map((k) => [k, 0]));
}

/** Pure: the vehicle screen's figures for one period. Amounts arrive converted. */
export function computeVehicleHistory(
  fuel: HistoryFuelInput[],
  costs: HistoryCostInput[],
  months: number,
  now: Date = new Date(),
): VehicleHistory {
  const all = [...fuel.map((f) => f.date), ...costs.map((c) => c.date)];
  let from: Date | null;
  if (months > 0) from = windowStart(now, months);
  else if (all.length > 0) {
    const first = new Date(Math.min(...all.map((d) => d.getTime())));
    from = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
  } else from = null;

  const inWindow = (d: Date) => from !== null && d.getTime() >= from.getTime();

  // Calendar months from the window's start through the current one.
  const monthly: VehicleHistory['monthly'] = [];
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

  const items: VehicleHistoryItem[] = [];
  const add = (date: Date, kind: string, amountBase: number | null) => {
    if (amountBase === null) return;
    byKind[kind] = (byKind[kind] ?? 0) + amountBase;
    total += amountBase;
    const m = byMonth.get(monthKey(date));
    if (m) {
      m.byKind[kind] = (m.byKind[kind] ?? 0) + amountBase;
      m.total += amountBase;
    }
  };

  const windowFuel = fuel.filter((f) => inWindow(f.date));
  for (const f of windowFuel) {
    add(f.date, 'fuel', f.amountBase);
    items.push({
      expenseId: f.expenseId,
      clientId: f.clientId,
      date: f.date.toISOString().slice(0, 10),
      kind: 'fuel',
      amount: f.amount,
      currencyCode: f.currencyCode,
      amountBase: f.amountBase,
      merchant: f.merchant,
      description: f.description,
      liters: f.liters,
      odometerKm: f.odometerKm,
      isFullTank: f.isFullTank,
    });
  }
  for (const c of costs.filter((x) => inWindow(x.date))) {
    add(c.date, c.kind, c.amountBase);
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

  // Segments are computed over ALL fill-ups (a segment's baseline may predate
  // the window) and kept when the segment ends inside it.
  const stats = computeFuelStats(
    fuel.map((f) => ({
      date: f.date,
      odometerKm: f.odometerKm,
      liters: f.liters,
      amount: f.amountBase ?? 0,
      isFullTank: f.isFullTank,
    })),
  );
  const fromDay = from ? from.toISOString().slice(0, 10) : null;
  const segments = stats.series.filter((s) => fromDay !== null && s.date >= fromDay);
  const segKm = segments.reduce((s, p) => s + (p.km ?? 0), 0);
  const segLiters = segments.reduce((s, p) => s + (p.liters ?? 0), 0);

  const odo = windowFuel.map((f) => f.odometerKm);
  const km = odo.length >= 2 ? Math.max(...odo) - Math.min(...odo) : 0;

  return {
    months,
    from: fromDay,
    total: r2(total),
    perMonth: monthly.length > 0 ? r2(total / monthly.length) : 0,
    byKind: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, r2(v)])),
    km,
    costPerKm: km > 0 ? Math.round((total / km) * 1000) / 1000 : null,
    consumptionLPer100Km: segKm > 0 ? r2((segLiters / segKm) * 100) : null,
    monthly: monthly.map((m) => ({
      month: m.month,
      total: r2(m.total),
      byKind: Object.fromEntries(Object.entries(m.byKind).map(([k, v]) => [k, r2(v)])),
    })),
    consumption: segments.map(({ date, lPer100Km, costPer100Km }) => ({ date, lPer100Km, costPer100Km })),
    items,
  };
}
