/** Pure display helpers for merchant spending caps. */

export interface CapBar {
  /** Bar fill 0..1, clamped. */
  fill: number;
  /** Cap reached or exceeded. */
  over: boolean;
  /** Warning band (80-99%). */
  warn: boolean;
  /** Whole percent, NOT clamped. */
  percent: number;
}

export function capBar(percentUsed: number): CapBar {
  const p = Number.isFinite(percentUsed) ? Math.max(0, percentUsed) : 0;
  return { fill: Math.min(p / 100, 1), over: p >= 100, warn: p >= 80 && p < 100, percent: Math.round(p) };
}
