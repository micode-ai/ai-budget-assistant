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

/**
 * The bank's own copy of this purchase — a push captured on the device or a
 * row from an imported statement.
 */
export function bankCopySource(match: ReceiptDuplicateMatch | null | undefined): 'notification' | 'import' | null {
  if (!match || match.kind !== 'likely') return null;
  return match.source === 'notification' || match.source === 'import' ? match.source : null;
}

/** Sources whose payee the user typed or said: the app form, voice, bot text. */
const USER_ENTERED_SOURCES = new Set(['manual', 'voice', 'telegram', 'whatsapp', 'slack']);

/**
 * A row the scan screen may fold into this receipt: the bank's copy, or the
 * same purchase the user entered earlier — typed, spoken or sent to a bot
 * (ABA-743). The server refuses to fold anything else.
 */
export function mergeableSource(
  match: ReceiptDuplicateMatch | null | undefined,
): 'notification' | 'import' | 'userEntered' | null {
  const bank = bankCopySource(match);
  if (bank) return bank;
  return match?.kind === 'likely' && USER_ENTERED_SOURCES.has(match.source ?? '') ? 'userEntered' : null;
}

/**
 * The merge box starts ticked only for a bank copy matched on the payee. A
 * user-entered row can be a genuine second purchase, so the user ticks it.
 */
export function defaultMergeWithBank(match: ReceiptDuplicateMatch | null | undefined): boolean {
  return bankCopySource(match) !== null && !match?.amountOnly;
}
