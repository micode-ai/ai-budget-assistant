import type { ReceiptExpense } from '../modules/ai/services/ocr.service';

type Translate = (key: string, lang: string | undefined, params?: Record<string, string>) => string;

/**
 * One summary line reporting price-check findings — lines that cost
 * measurably more than the user's usual price for that product in that
 * store. Never phrased as an accusation (no "overcharged"/"scammed"/
 * "promo not applied"); empty string when there is nothing to report so a
 * clean receipt reads exactly as it did before this feature existed.
 *
 * Shared by the Telegram, WhatsApp and Slack photo handlers; each passes its
 * own `t` (the dictionaries differ only in markup).
 */
export function buildPriceCheckLine(
  receipt: Pick<ReceiptExpense, 'priceFindings'>,
  translate: Translate,
  lang: string | undefined,
): string {
  const findings = receipt.priceFindings ?? [];
  if (findings.length === 0) return '';
  const total = findings.reduce((sum, f) => sum + f.overpaidAmount, 0);
  return translate('priceCheckSummary', lang, {
    count: String(findings.length),
    amount: `${total.toFixed(2)} ${findings[0].currencyCode}`,
  });
}
