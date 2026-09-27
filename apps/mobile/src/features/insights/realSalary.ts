import type { RealSalaryResponse, RealSalaryStatus, SalaryCandidate } from '@budget/shared-types';

/** Same list as the API's EUROSTAT_COUNTRIES (Greece is EL in Eurostat). */
export const REAL_SALARY_COUNTRIES: readonly string[] = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR', 'HR', 'HU',
  'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
  'IS', 'NO', 'CH',
];

/** Intl names where the runtime has them (web, recent Hermes); the code otherwise. */
export function countryName(code: string, locale: string): string {
  try {
    const DN = (Intl as unknown as { DisplayNames?: new (l: string[], o: { type: 'region' }) => { of(c: string): string | undefined } }).DisplayNames;
    if (!DN) return code;
    const name = new DN([locale], { type: 'region' }).of(code === 'EL' ? 'GR' : code);
    return name && name !== code ? name : code;
  } catch {
    return code;
  }
}

export function formatSignedPct(x: number | null): string {
  if (x === null || !Number.isFinite(x)) return '—';
  const r = Math.round(x * 10) / 10;
  if (r === 0) return '0.0%';
  return `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(1)}%`;
}

export type Tone = 'positive' | 'negative' | 'neutral';

export function toneOf(realChangePct: number | null): Tone {
  if (realChangePct === null || Math.round(realChangePct * 10) === 0) return 'neutral';
  return realChangePct > 0 ? 'positive' : 'negative';
}

export type StatusCopy = { titleKey: string; bodyKey: string; action: 'setup' | 'settings' | null };

const STATUS_COPY: Record<Exclude<RealSalaryStatus, 'ready'>, StatusCopy> = {
  no_salary_confirmed: { titleKey: 'realSalary.status.noSalaryTitle', bodyKey: 'realSalary.status.noSalaryBody', action: 'setup' },
  salary_history_short: { titleKey: 'realSalary.status.historyShortTitle', bodyKey: 'realSalary.status.historyShortBody', action: 'setup' },
  spend_under_3_months: { titleKey: 'realSalary.status.spendShortTitle', bodyKey: 'realSalary.status.spendShortBody', action: null },
  no_inflation_source: { titleKey: 'realSalary.status.noSourceTitle', bodyKey: 'realSalary.status.noSourceBody', action: 'settings' },
  encrypted: { titleKey: 'realSalary.status.encryptedTitle', bodyKey: 'realSalary.status.encryptedBody', action: null },
};

export function statusCopy(status: RealSalaryStatus): StatusCopy | null {
  return status === 'ready' ? null : STATUS_COPY[status];
}

export function requiredRaiseKey(requiredRaisePct: number | null): 'realSalary.requiredRaise' | 'realSalary.ahead' {
  return requiredRaisePct !== null && Math.round(requiredRaisePct * 10) > 0 ? 'realSalary.requiredRaise' : 'realSalary.ahead';
}

/** "Last year's salary" is in the salary's own currency — the key's third segment. */
export function manualCurrency(candidates: SalaryCandidate[], salaryKey: string | null): string | null {
  if (!salaryKey) return null;
  const hit = candidates.find((c) => c.key === salaryKey);
  if (hit) return hit.currencyCode;
  const suffix = salaryKey.split('|')[2];
  return suffix && /^[A-Z]{3}$/.test(suffix) ? suffix : null;
}

/** 1–3 digits, then every remaining part exactly 3 digits — a valid thousands grouping. */
function isValidGrouping(parts: string[]): boolean {
  return parts.length > 1 && /^\d{1,3}$/.test(parts[0]) && parts.slice(1).every((p) => /^\d{3}$/.test(p));
}

/**
 * Parses a monthly amount typed in any of the European number formats this
 * app's users write salaries in — comma OR dot as the decimal separator,
 * dot/comma/space/NBSP/apostrophe as a thousands grouping mark — into a
 * plain number.
 *
 * Returns `null` for an empty/whitespace-only input (nothing typed — a valid,
 * absent answer). Returns `NaN` for anything that cannot be read as a single
 * non-negative amount; callers treat NaN the same as a failed `Number()`
 * parse (invalid input).
 */
export function parseMonthlyAmount(text: string): number | null {
  if (text.trim() === '') return null;

  // Strip whitespace (incl. NBSP / narrow NBSP) and apostrophes used as a
  // thousands grouping mark ("8'400") — none of these carry meaning here.
  const s0 = text.replace(/[\s  '’]/g, '');

  const hasDot = s0.includes('.');
  const hasComma = s0.includes(',');

  let s: string;

  if (hasDot && hasComma) {
    // The later of the two separators is the decimal point; the earlier kind
    // is a thousands grouping mark over the integer part — but only if that
    // integer part actually groups validly ("84.00,5" does not: "00" is not
    // a 3-digit group), otherwise the whole thing is unparsable.
    const decimalChar = s0.lastIndexOf(',') > s0.lastIndexOf('.') ? ',' : '.';
    const otherChar = decimalChar === ',' ? '.' : ',';
    const halves = s0.split(decimalChar);
    if (halves.length !== 2) return NaN;
    const [integerPart, decimalPart] = halves;
    const groups = integerPart.split(otherChar);
    if (groups.length > 1 && !isValidGrouping(groups)) return NaN;
    s = `${groups.join('')}.${decimalPart}`;
  } else if (hasDot || hasComma) {
    const sep = hasDot ? '.' : ',';
    const parts = s0.split(sep);
    if (parts.length > 2) {
      // The separator occurs more than once: only a valid thousands grouping
      // ("1.234.567") collapses it. Anything else ("8.4.0") is left as-is,
      // which then fails the final shape check below.
      s = isValidGrouping(parts) ? parts.join('') : s0;
    } else {
      const [whole, frac] = parts;
      // A single occurrence followed by exactly 3 digits at the end is a
      // thousands separator ("8.400"), not a decimal point.
      s = /^\d{3}$/.test(frac) ? whole + frac : `${whole}.${frac}`;
    }
  } else {
    s = s0;
  }

  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

export interface ShareLine {
  emoji: string;
  label: string;
  value: string;
}

/** Percentages only — salary is the most sensitive number in the app. */
export function buildShareLines(data: RealSalaryResponse, t: (k: string) => string): ShareLine[] {
  return [
    { emoji: '💶', label: t('realSalary.share.real'), value: formatSignedPct(data.realChangePct) },
    { emoji: '📈', label: t('realSalary.share.pay'), value: formatSignedPct(data.nominalChangePct) },
    { emoji: '🛒', label: t('realSalary.share.inflation'), value: formatSignedPct(data.personalInflationPct) },
  ];
}

export function briefErrorKind(e: unknown): 'paywall' | 'not_ready' | 'failed' {
  const err = e as { status?: number; code?: string } | null;
  if (!err || typeof err !== 'object') return 'failed';
  if (err.status === 403 && err.code === 'TIER_REQUIRED') return 'paywall';
  if (err.status === 409) return 'not_ready';
  return 'failed';
}
