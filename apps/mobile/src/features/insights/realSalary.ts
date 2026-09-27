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
