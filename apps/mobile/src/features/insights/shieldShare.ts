import type { InflationShieldResponse } from '@budget/shared-types';

export interface ShieldShareLine {
  emoji: string;
  label: string;
  value: string; // reserved for the image renderer's optional bold value column; usually ''
}

export interface ShieldSharePayload {
  fileTag: string; // used only to name the file (inflation-shield-<fileTag>.png)
  title: string;
  lines: ShieldShareLine[];
  footer: string;
}

interface BuildOpts {
  hideAmounts: boolean;
  money: (n: number) => string; // already hide-aware in callers; tests pass their own
  t: (key: string, params?: Record<string, unknown>) => string;
}

// Up to 3 rising items on the card, biggest projected saving first (server already sorts,
// but we defensively slice).
const MAX_ITEMS = 3;

function buildLines(data: InflationShieldResponse, { money, t }: BuildOpts): ShieldShareLine[] {
  const lines: ShieldShareLine[] = [];
  if (data.savedSoFar > 0) {
    lines.push({ emoji: '💰', label: t('inflationShield.shareSaved', { value: money(data.savedSoFar) }), value: '' });
  }
  if (data.basketMonthlyForecastPct != null) {
    lines.push({ emoji: '📈', label: t('inflationShield.shareBasket', { pct: data.basketMonthlyForecastPct.toFixed(1) }), value: '' });
  }
  for (const it of data.items.slice(0, MAX_ITEMS)) {
    lines.push({
      emoji: '🛒',
      label: t('inflationShield.shareItem', {
        product: it.canonicalName,
        pct: it.monthlyChangePct.toFixed(0),
        save: money(it.projectedSaving),
      }),
      value: '',
    });
  }
  if (data.totalProjectedSaving > 0) {
    lines.push({ emoji: '🛡️', label: t('inflationShield.shareTotal', { value: money(data.totalProjectedSaving) }), value: '' });
  }
  return lines;
}

/** Story-card payload, or null when there's nothing worth sharing. */
export function buildShieldSharePayload(data: InflationShieldResponse, opts: BuildOpts): ShieldSharePayload | null {
  if (!data.hasEnoughData) return null;
  const lines = buildLines(data, opts);
  if (lines.length === 0) return null;
  return {
    fileTag: 'shield',
    title: opts.t('inflationShield.shareTitle'),
    lines,
    footer: opts.t('inflationShield.shareCta'),
  };
}

/** Plain-text fallback for Share.share, or "" below the data threshold. */
export function buildShieldShareMessage(data: InflationShieldResponse, opts: BuildOpts): string {
  if (!data.hasEnoughData) return '';
  const lines = buildLines(data, opts);
  if (lines.length === 0) return '';
  return [opts.t('inflationShield.shareTitle'), ...lines.map((l) => `${l.emoji} ${l.label}`), opts.t('inflationShield.shareCta')].join('\n');
}
