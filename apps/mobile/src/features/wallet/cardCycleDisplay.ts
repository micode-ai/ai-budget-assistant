/** Pure display helpers for the card-cycle section. */

export interface UtilisationBar {
  /** Bar fill, 0..1 (clamped; never overflows the track). */
  fill: number;
  /** True when spend is above the limit. */
  over: boolean;
  /** Whole percent for the label, NOT clamped (120 for 120%). */
  percent: number;
}

export function utilisationBar(utilisation: number | null): UtilisationBar | null {
  if (utilisation == null || !Number.isFinite(utilisation)) return null;
  const u = Math.max(0, utilisation);
  return { fill: Math.min(u, 1), over: u > 1, percent: Math.round(u * 100) };
}

/** Day-of-month from a `YYYY-MM-DD` string, without going through `Date` (no UTC shift). */
export function dayOfMonth(ymd: string): number | null {
  const m = /^\d{4}-\d{2}-(\d{2})$/.exec(ymd);
  return m ? Number(m[1]) : null;
}

/** Parses a statement/due day input; null unless an integer in 1..31. */
export function parseDay(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d{1,2}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= 31 ? n : null;
}
