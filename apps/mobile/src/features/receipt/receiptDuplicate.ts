import { formatCurrency } from '@budget/shared-utils';
import type { Currency, ReceiptDuplicateMatch } from '@budget/shared-types';

/**
 * "Biedronka · 40,85 zł · 25.09.2026" — how both duplicate warnings name the
 * saved expense (ABA-603). The date is the expense's calendar day read in UTC,
 * matching how a date-only value is stored (noon-UTC on save).
 */
export function describeDuplicateMatch(match: ReceiptDuplicateMatch, locale: string): string {
  const who = match.merchant?.trim() || match.description?.trim() || '';
  const amount = formatCurrency(match.amount, match.currencyCode as Currency);
  const day = new Date(match.date);
  const date = Number.isNaN(day.getTime())
    ? ''
    : day.toLocaleDateString(locale, { timeZone: 'UTC' });
  return [who, amount, date].filter(Boolean).join(' · ');
}
