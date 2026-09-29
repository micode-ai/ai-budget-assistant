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

/**
 * Legal-form, generic-venue and city words that say nothing about WHICH shop
 * a charge came from — ignored when two capture channels' payee labels are
 * compared loosely. Folded (no diacritics, lowercase).
 */
const LOOSE_PAYEE_STOPWORDS = new Set([
  'sp', 'spolka', 'zoo', 'z.o.o', 'sa', 'sklep', 'market', 'store', 'shop', 'polska', 'poland',
  'gmbh', 'ltd', 'inc', 'llc', 'the', 'warszawa', 'krakow', 'wroclaw', 'poznan', 'gdansk', 'lodz',
  'katowice', 'lublin', 'szczecin', 'bydgoszcz', 'gdynia', 'card', 'karta', 'platnosc', 'payment',
]);

function foldPayee(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLowerCase();
}

function significantTokens(s: string): string[] {
  return foldPayee(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && /[a-z]/.test(t) && !LOOSE_PAYEE_STOPWORDS.has(t));
}

/**
 * Loose payee comparison for the SAME purchase seen through two different
 * capture channels — a bank push says `ZABKA Z5712 WARSZAWA`, the receipt
 * OCR says `Żabka`. True when any significant token (≥3 chars, has a letter,
 * not a legal-form/city word) of one label appears inside the other's folded,
 * space-free text. Never true for an empty label.
 */
export function payeesLooselyMatch(a: string, b: string): boolean {
  const flatA = foldPayee(a).replace(/[^a-z0-9]/g, '');
  const flatB = foldPayee(b).replace(/[^a-z0-9]/g, '');
  if (!flatA || !flatB) return false;
  return (
    significantTokens(a).some((t) => flatB.includes(t)) || significantTokens(b).some((t) => flatA.includes(t))
  );
}

/**
 * The bank-push ↔ receipt-scan pair: one side `notification`, the other `ocr`.
 * These two channels name the shop differently by nature, so the duplicate
 * detector matches them loosely and offers a merge instead of Tier 1's
 * silent stub deletion.
 */
export function isPushReceiptPair(a?: string | null, b?: string | null): boolean {
  return (a === 'notification' && b === 'ocr') || (a === 'ocr' && b === 'notification');
}

/**
 * Pick the push↔receipt counterpart of `expense` among same-amount,
 * same-currency, ±1-day candidates. A loose payee match wins; failing that,
 * a SINGLE counterpart is accepted on amount + currency + date alone — the
 * push often carries the brand while the receipt carries the legal name
 * (`BIEDRONKA` vs `Jeronimo Martins Polska`), and the result is only ever a
 * suggestion the user confirms. Two or more counterparts with no payee match
 * are ambiguous → null.
 */
export function pickPushReceiptCounterpart<T extends { merchant?: string | null; description?: string | null; source?: string | null }>(
  expense: { merchant?: string | null; description?: string | null; source?: string | null },
  candidates: T[],
): T | null {
  const counterparts = candidates.filter((c) => isPushReceiptPair(expense.source, c.source));
  if (counterparts.length === 0) return null;
  const label = expensePayee(expense);
  const loose = counterparts.find((c) => payeesLooselyMatch(label, expensePayee(c)));
  if (loose) return loose;
  return counterparts.length === 1 ? counterparts[0] : null;
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
