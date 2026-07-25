import type { ReceiptCheckFinding } from '@budget/shared-types';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReceiptCheckLine {
  canonicalName: string;
  unitPrice: number;
  quantity: number;
}

export interface ReceiptCheckPoint {
  /** ISO date, yyyy-mm-dd. */
  date: string;
  /** Per-unit price. */
  price: number;
}

export interface ReceiptCheckHistory {
  canonicalName: string;
  currency: string;
  points: ReceiptCheckPoint[];
}

export interface CommunityBaseline {
  canonicalName: string;
  medianPrice: number;
  currency: string;
}

export interface ReceiptCheckConfig {
  lookbackWeeks: number;
  minPoints: number;
  minRisePct: number;
  maxRisePct: number;
  minAmount: number;
  maxFindings: number;
}

export const RECEIPT_CHECK_DEFAULTS: ReceiptCheckConfig = {
  lookbackWeeks: 12,
  minPoints: 2,
  minRisePct: 15,
  maxRisePct: 100,
  minAmount: 1.0,
  maxFindings: 5,
};

export interface ReceiptCheckResult {
  findings: ReceiptCheckFinding[];
  stats: {
    /** Grouped receipt lines that had usable history. */
    evaluated: number;
    /** Dropped because the rise exceeded maxRisePct — probably a different pack size. */
    droppedByCap: number;
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Single source of truth for deriving a per-unit price from an item's raw
 * quantity/unitPrice/totalPrice fields. Used by every consumer that reads
 * ExpenseItem-shaped rows (OCR's scan-time check, the persisted detector, and
 * PriceHistoryService's own fetchRows/getProductTrendsFor) so all four agree.
 *
 * quantity > 1: derive from totalPrice / quantity (a multi-unit line's
 * unitPrice, when present at all, is frequently the pack price, not the
 * per-unit price).
 * Otherwise: use unitPrice, but fall back to totalPrice when unitPrice is
 * missing (null/undefined) or not a positive number — ExpenseItem.unitPrice
 * defaults to 0 on the DB column and the OCR model sometimes omits it for a
 * qty-1 line, and a stored 0 must never be reported as "the" price.
 */
export function perUnitPrice(item: {
  quantity?: number | string | null;
  unitPrice?: number | string | null;
  totalPrice?: number | string | null;
}): number {
  const quantity = Number(item.quantity);
  if (quantity > 1) {
    return Number(item.totalPrice) / quantity;
  }
  const unitPrice = Number(item.unitPrice);
  if (Number.isFinite(unitPrice) && unitPrice > 0) {
    return unitPrice;
  }
  return Number(item.totalPrice);
}

export function median(values: number[]): number {
  if (values.length === 0) throw new Error('median of an empty list');
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * A receipt often lists the same product on several lines. Group by
 * normalized name and take the quantity-weighted average unit price, so one
 * product can produce at most one finding.
 */
export function groupReceiptLines(lines: ReceiptCheckLine[]): ReceiptCheckLine[] {
  const groups = new Map<string, { canonicalName: string; quantity: number; total: number }>();

  for (const line of lines) {
    const name = line.canonicalName?.trim();
    if (!name) continue;
    const quantity = line.quantity > 0 ? line.quantity : 1;
    const key = normalizeName(name);
    const group = groups.get(key) ?? { canonicalName: name, quantity: 0, total: 0 };
    group.quantity += quantity;
    group.total += line.unitPrice * quantity;
    groups.set(key, group);
  }

  return [...groups.values()].map((g) => ({
    canonicalName: g.canonicalName,
    quantity: g.quantity,
    unitPrice: g.total / g.quantity,
  }));
}

export function checkReceiptPrices(input: {
  lines: ReceiptCheckLine[];
  history: ReceiptCheckHistory[];
  merchant: string;
  currencyCode: string;
  now: Date;
  community?: CommunityBaseline[];
  config?: ReceiptCheckConfig;
}): ReceiptCheckResult {
  const cfg = input.config ?? RECEIPT_CHECK_DEFAULTS;
  const cutoff = new Date(input.now.getTime() - cfg.lookbackWeeks * 7 * DAY_MS);

  const historyByName = new Map<string, ReceiptCheckHistory>();
  for (const h of input.history) historyByName.set(normalizeName(h.canonicalName), h);

  const communityByName = new Map<string, CommunityBaseline>();
  for (const c of input.community ?? []) communityByName.set(normalizeName(c.canonicalName), c);

  const findings: ReceiptCheckFinding[] = [];
  let evaluated = 0;
  let droppedByCap = 0;

  for (const line of groupReceiptLines(input.lines)) {
    // The line price is LLM output and is not validated upstream — a NaN would
    // otherwise pass every gate below (every comparison against NaN is false),
    // producing a finding with NaN fields ("about NaN PLN more").
    if (!Number.isFinite(line.unitPrice) || line.unitPrice <= 0) continue;

    const normalizedName = normalizeName(line.canonicalName);
    const history = historyByName.get(normalizedName);
    // A product absent from the personal history can still be checked against a
    // community baseline below, so a missing entry is not a skip. A PRESENT
    // entry in another currency is — never compare across currencies.
    if (history && history.currency !== input.currencyCode) continue;

    const points = (history?.points ?? []).filter((p) => new Date(p.date).getTime() >= cutoff.getTime());

    // No pack-size gate: the OCR prompt keeps per-unit size inside canonicalName
    // ("Mleko Łaciate 3,2% 1L"), so different pack sizes are already different
    // products and never match each other. A structured size field would need
    // parsed value+unit for per-litre comparison — a separate piece of work.

    let baseline: number;
    let source: 'personal' | 'community';
    let pointCount: number;

    // The `points.length > 0` guard is required independent of `points.length >=
    // cfg.minPoints`: an operator-configured RECEIPT_CHECK_MIN_POINTS=0 would
    // otherwise let an empty `points` array through to median(), which throws
    // on an empty list. Route the empty case to the community fallback instead.
    if (points.length > 0 && points.length >= cfg.minPoints) {
      baseline = median(points.map((p) => p.price));
      source = 'personal';
      pointCount = points.length;
    } else {
      // Personal history is too thin — fall back to the crowdsourced baseline
      // when one exists for this product in the same currency.
      const community = communityByName.get(normalizedName);
      if (!community || community.currency !== input.currencyCode) continue;
      baseline = community.medianPrice;
      source = 'community';
      // A crowd baseline never earns high confidence on its own.
      pointCount = 0;
    }

    if (baseline <= 0) continue;
    evaluated++;

    const changePct = ((line.unitPrice - baseline) / baseline) * 100;
    if (changePct < cfg.minRisePct) continue;
    if (changePct > cfg.maxRisePct) {
      droppedByCap++;
      continue;
    }

    const overpaidAmount = (line.unitPrice - baseline) * line.quantity;
    if (overpaidAmount < cfg.minAmount) continue;

    findings.push({
      canonicalName: line.canonicalName,
      merchant: input.merchant,
      currencyCode: input.currencyCode,
      paidUnitPrice: round2(line.unitPrice),
      baselineUnitPrice: round2(baseline),
      quantity: line.quantity,
      changePct: round1(changePct),
      overpaidAmount: round2(overpaidAmount),
      source,
      confidence: pointCount >= 3 ? 'high' : 'low',
    });
  }

  findings.sort((a, b) => b.overpaidAmount - a.overpaidAmount);

  return {
    findings: findings.slice(0, cfg.maxFindings),
    stats: { evaluated, droppedByCap },
  };
}

function num(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// A negative override must never invert behavior (e.g. a negative maxFindings
// would slice() from the end, and a negative lookbackWeeks would flip the
// cutoff into the future). 0 stays a legitimate kill-switch for every field —
// clamp to 0, never up to 1.
function nonNegative(n: number): number {
  return Math.max(0, n);
}

export function resolveReceiptCheckConfig(env: Record<string, string | undefined>): ReceiptCheckConfig {
  return {
    lookbackWeeks: nonNegative(num(env.RECEIPT_CHECK_LOOKBACK_WEEKS, RECEIPT_CHECK_DEFAULTS.lookbackWeeks)),
    minPoints: nonNegative(num(env.RECEIPT_CHECK_MIN_POINTS, RECEIPT_CHECK_DEFAULTS.minPoints)),
    minRisePct: nonNegative(num(env.RECEIPT_CHECK_MIN_RISE_PCT, RECEIPT_CHECK_DEFAULTS.minRisePct)),
    maxRisePct: nonNegative(num(env.RECEIPT_CHECK_MAX_RISE_PCT, RECEIPT_CHECK_DEFAULTS.maxRisePct)),
    minAmount: nonNegative(num(env.RECEIPT_CHECK_MIN_AMOUNT, RECEIPT_CHECK_DEFAULTS.minAmount)),
    maxFindings: nonNegative(num(env.RECEIPT_CHECK_MAX_FINDINGS, RECEIPT_CHECK_DEFAULTS.maxFindings)),
  };
}
