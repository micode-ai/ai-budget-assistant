import type { LeafletResult } from '@budget/shared-types';
import { formatCurrency } from '@budget/shared-utils';
import i18n, { getIntlLocale } from '@/i18n';
import type { LeafletReader } from './useLeafletReader';

/** "Lidl leaflet", or a plain "Leaflet" while the chain is unknown. */
export function leafletTitle(result: LeafletResult | null): string {
  return result?.chain ? i18n.t('leaflets.headerChain', { chain: result.chain }) : i18n.t('leaflets.headerNoChain');
}

/** "valid until Sun 16.11", or null when the leaflet states no end date. */
export function leafletValidUntil(result: LeafletResult | null): string | null {
  if (!result?.validTo) return null;
  // A date-only value: noon local keeps the calendar day on any UTC offset.
  const date = new Date(`${result.validTo}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const label = date.toLocaleDateString(getIntlLocale(), { weekday: 'short', day: '2-digit', month: '2-digit' });
  return i18n.t('leaflets.validUntil', { date: label });
}

export function formatLeafletPrice(amount: number, currencyCode: string): string {
  return formatCurrency(amount, currencyCode);
}

/** Pages not read for any reason: refused by the server (cap, budget) plus never sent by the client. */
export function droppedPages(reader: Pick<LeafletReader, 'result' | 'dropped'>): number {
  return (reader.result?.pagesDropped ?? 0) + reader.dropped;
}

/** Progress line while reading: "Reading page 3 of 7", or pages read so far for a PDF. */
export function progressLabel(progress: { done: number; total: number }): string {
  return progress.total > 0
    ? i18n.t('leaflets.reading', { done: Math.min(progress.done + 1, progress.total), total: progress.total })
    : i18n.t('leaflets.readingPdf', { count: progress.done });
}
