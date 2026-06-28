/**
 * On-device notification text parser for bank push notifications.
 * All parsing happens here — no notification text ever leaves the device; only
 * the resulting structured expense syncs to the server.
 *
 * Uses per-package regex templates from templates.pl.ts and the merchant
 * normalization utility from the bank-import module (mobile-local copy in
 * src/utils/merchants-pl.ts, which mirrors the API's merchants-pl.ts for
 * use without crossing the apps/api/ boundary — mobile engineer scope only).
 */
import { TEMPLATES, SYMBOL_TO_CURRENCY } from './templates.pl';
import {
  normalizeMerchantPL,
  suggestCategoryFromMerchantPL,
} from './merchants-pl';

export interface ParsedNotification {
  /** Numeric amount (always positive). */
  amount: number;
  /** Canonical merchant name (normalizeMerchantPL applied). */
  merchant: string | null;
  /** ISO 4217 currency code. */
  currencyCode: string;
  /** When the notification was posted (ms since epoch). */
  occurredAt: Date;
  /** Suggested category name from merchants-pl hints (or undefined). */
  suggestedCategory: string | undefined;
}

/**
 * Parse a raw bank notification into a structured expense candidate.
 * Returns null if the package is not known, the template doesn't match,
 * or the amount cannot be parsed — callers should silently skip null results.
 *
 * The full notification body (title + text) is concatenated and tested against
 * the template's regexes in order.
 */
export function parseNotification(
  packageName: string,
  title: string,
  text: string,
  postedAt: number,
): ParsedNotification | null {
  try {
    const template = TEMPLATES[packageName];
    if (!template) return null;

    // Concatenate for flexible matching (some banks put the amount in the title,
    // others put the merchant in the body)
    const fullText = `${title}\n${text}`.trim();

    // --- Amount ---
    const amountMatch = fullText.match(template.amountRegex);
    if (!amountMatch || !amountMatch[1]) return null;

    const rawAmount = amountMatch[1]
      .replace(/\s/g, '')    // strip whitespace separators ("1 234,56" → "1234,56")
      .replace(',', '.');     // normalize decimal separator
    const amount = parseFloat(rawAmount);
    if (!isFinite(amount) || amount <= 0) return null;

    // --- Currency ---
    let currencyCode = template.currencyDefault;
    if (template.currencyRegex) {
      const currMatch = fullText.match(template.currencyRegex);
      if (currMatch) {
        // Group 1 may be a symbol (€, £, $) or a code (EUR, GBP)
        const raw = (currMatch[1] || currMatch[2] || '').trim();
        currencyCode = SYMBOL_TO_CURRENCY[raw] ?? raw.toUpperCase() ?? template.currencyDefault;
      }
    }

    // --- Merchant ---
    let merchant: string | null = null;
    if (template.merchantRegex) {
      const merchantMatch = fullText.match(template.merchantRegex);
      if (merchantMatch && merchantMatch[1]) {
        const raw = merchantMatch[1].trim();
        merchant = normalizeMerchantPL(raw) ?? raw;
      }
    }

    // --- Suggested category ---
    const suggestedCategory = merchant
      ? suggestCategoryFromMerchantPL(merchant)
      : undefined;

    return {
      amount,
      merchant,
      currencyCode,
      occurredAt: new Date(postedAt),
      suggestedCategory,
    };
  } catch {
    // Never throw — be defensive (CLAUDE.md: no crash reporting on mobile)
    return null;
  }
}
