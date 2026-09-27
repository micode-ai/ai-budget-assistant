import type { CoicopDivision, RealSalaryBreakdownRow } from '@budget/shared-types';

/** The receipt index replaces official CP01 only when it rests on this many products. */
export const RECEIPT_MIN_PRODUCTS = 10;

/**
 * How far (percentage points, annual) the receipt food rate may sit from the
 * official CP01 rate — or the country's TOTAL when there is no CP01 cell —
 * and still replace it (ABA-618). The receipt index is a weighted mean of
 * per-product price changes over a handful of products, so ONE product whose
 * pack size or unit changed under the same name (two sizes merged into one
 * product, a loose-weight item read as a piece) moves it by double digits, and
 * annualising the half-year figure doubles that. A real household's food basket
 * does not run 10+ pp away from national food inflation for a year; a data
 * break does. Beyond the gap the official rate is used.
 */
export const RECEIPT_MAX_GAP_PP = 10;

/**
 * With no official data to compare against, the largest annual receipt rate
 * (either sign) still believed — beyond it the answer is `no_inflation_source`
 * rather than a number built on a data break (ABA-618).
 */
export const RECEIPT_MAX_ABS_PCT = 30;

export interface SpendByDivision {
  division: CoicopDivision;
  /** Base currency, positive. */
  amount: number;
}

export interface InflationInputs {
  spend: SpendByDivision[];
  /** Official annual rates for the user's country (percent). Empty = no official coverage. */
  officialRates: Partial<Record<CoicopDivision, number>>;
  receiptIndexPct: number | null;
  receiptProductCount: number;
}

export function round1(x: number): number {
  const r = Math.round(x * 10) / 10;
  return r === 0 ? 0 : r;
}

/**
 * Laspeyres-style personal index: Σ(wᵢ·rᵢ)/Σwᵢ over the account's own spend.
 * With official data every division counts (a missing cell falls back to the
 * national TOTAL). Without it (outside Eurostat coverage) only food can be
 * priced — from the receipt index — so only CP01 spend is weighted and the
 * response says "receipts only". The receipt index is used only when it rests
 * on RECEIPT_MIN_PRODUCTS products and is plausible (RECEIPT_MAX_GAP_PP /
 * RECEIPT_MAX_ABS_PCT). Returns null when nothing can be priced.
 */
export function computePersonalInflation(
  i: InflationInputs,
): { inflationPct: number; breakdown: RealSalaryBreakdownRow[]; topDrivers: CoicopDivision[] } | null {
  const hasOfficial = i.officialRates.TOTAL !== undefined && Number.isFinite(i.officialRates.TOTAL);
  const officialFood = Number.isFinite(i.officialRates.CP01) ? (i.officialRates.CP01 as number) : (i.officialRates.TOTAL as number);
  const receipt = i.receiptIndexPct;
  const receiptsOk =
    receipt !== null && Number.isFinite(receipt) && i.receiptProductCount >= RECEIPT_MIN_PRODUCTS &&
    // Plausibility (ABA-618): a data break in a few products, not a real
    // basket, is what puts the receipt rate far from national food inflation.
    (hasOfficial ? Math.abs(receipt - officialFood) <= RECEIPT_MAX_GAP_PP : Math.abs(receipt) <= RECEIPT_MAX_ABS_PCT);

  const totals = new Map<CoicopDivision, number>();
  for (const row of i.spend) {
    if (!(row.amount > 0)) continue;
    totals.set(row.division, (totals.get(row.division) ?? 0) + row.amount);
  }

  const rows: { division: CoicopDivision; amount: number; ratePct: number; source: 'official' | 'receipts' }[] = [];
  for (const [division, amount] of totals) {
    if (division === 'CP01' && receiptsOk) {
      rows.push({ division, amount, ratePct: i.receiptIndexPct as number, source: 'receipts' });
    } else if (hasOfficial) {
      const divisionRate = i.officialRates[division];
      const rate = Number.isFinite(divisionRate) ? (divisionRate as number) : (i.officialRates.TOTAL as number);
      rows.push({ division, amount, ratePct: rate, source: 'official' });
    }
  }
  if (rows.length === 0) return null;

  const sum = rows.reduce((s, r) => s + r.amount, 0);
  const inflation = rows.reduce((s, r) => s + r.amount * r.ratePct, 0) / sum;

  const ordered = [...rows].sort((a, b) => (a.division < b.division ? -1 : a.division > b.division ? 1 : 0));
  const breakdown = ordered.map((r) => ({
    division: r.division,
    weight: Math.round((r.amount / sum) * 1000) / 1000,
    ratePct: round1(r.ratePct),
    source: r.source,
  }));
  const topDrivers = rows
    .filter((r) => r.division !== 'TOTAL' && r.ratePct > 0)
    .sort((a, b) => b.amount * b.ratePct - a.amount * a.ratePct)
    .slice(0, 3)
    .map((r) => r.division);

  return { inflationPct: round1(inflation), breakdown, topDrivers };
}

/**
 * PriceHistoryService's '12m' inflationIndex compares mean prices in
 * [12 months ago .. 6 months ago] with [6 months ago .. now] — the two window
 * midpoints are ~6 months apart, so it is a HALF-YEAR change. Official rates
 * (Eurostat RCH_A) are year-on-year, so compound it over two half-years before
 * it may stand in for CP01: (1 + p)² − 1.
 */
export function annualiseHalfYearPct(pct: number | null): number | null {
  return pct === null ? null : ((1 + pct / 100) ** 2 - 1) * 100;
}

/** Real change divides (the honest formula); required raise is on CURRENT pay. */
export function realChange(nominalPct: number, inflationPct: number): { realChangePct: number; requiredRaisePct: number } {
  const n = 1 + nominalPct / 100;
  const p = 1 + inflationPct / 100;
  return {
    realChangePct: round1((n / p - 1) * 100),
    requiredRaisePct: round1((p / n - 1) * 100),
  };
}
