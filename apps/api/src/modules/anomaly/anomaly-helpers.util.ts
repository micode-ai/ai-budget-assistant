/**
 * Pure helpers shared by the anomaly detectors and by other modules that need
 * the same "who is this charge from" / "same calendar day" primitives
 * (import-bank's dedup pass, the expense post-create hook chain). Kept
 * dependency-free on purpose — no Prisma, no NestJS DI — so any module can
 * import these without pulling in the detector or alert-writing machinery.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Milliseconds in one calendar day — exported so other modules can reuse the same constant. */
export const DUP_DAY_MS = DAY_MS;

export const PRICE_INCREASE_FACTOR = 1.1;
export const SPIKE_THRESHOLD_PERCENT = 30;

/**
 * Canonical payee label for dedup predicates P and Q.
 * Prefers merchant over description, trims whitespace, lowercases.
 * Returns '' when both fields are absent/empty — callers must treat '' as "unidentifiable"
 * and must NOT match it against another '' (empty-vs-empty is NOT a match).
 */
export function expensePayee(e: { merchant?: string | null; description?: string | null }): string {
  return (e.merchant?.trim() || e.description?.trim() || '').toLowerCase();
}

export function normalizeMerchant(merchant: string): string {
  return merchant.trim().toLowerCase();
}

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * 3+ same-amount charges form a series when every gap between the 3 most
 * recent consecutive charges falls in the monthly (25–35 d) or weekly (6–8 d) window.
 */
export function detectCycle(dates: Date[]): 'monthly' | 'weekly' | null {
  if (dates.length < 3) return null;
  const last = dates.slice(-3);
  const gaps = [
    (last[1].getTime() - last[0].getTime()) / DAY_MS,
    (last[2].getTime() - last[1].getTime()) / DAY_MS,
  ];
  if (gaps.every((g) => g >= 25 && g <= 35)) return 'monthly';
  if (gaps.every((g) => g >= 6 && g <= 8)) return 'weekly';
  return null;
}
