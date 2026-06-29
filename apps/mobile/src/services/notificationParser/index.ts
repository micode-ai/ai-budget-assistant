/**
 * On-device notification text parser for bank push notifications.
 * All parsing happens here — no notification text ever leaves the device; only
 * the resulting structured expense syncs to the server.
 *
 * Dispatch order:
 *  1. Package-specific PL template (templates.pl.ts) — highest precision.
 *  2. Generic parser (generic.ts) — country-agnostic fallback for European banks.
 *
 * The generic parser only runs for packages that are already in the native
 * allow-list (BankNotificationListenerService.kt) — the allow-list is the
 * privacy/battery boundary and is never bypassed here.
 *
 * Category suggestion uses suggestCategoryFromMerchantPL for all packages
 * (the map covers brands present across Europe too, e.g. Lidl, IKEA, Starbucks).
 * For non-PL merchants not in the map the expense lands uncategorized and the
 * user's merchantRulesStore corrections will improve suggestions over time.
 */
import { TEMPLATES, SYMBOL_TO_CURRENCY } from './templates.pl';
import {
  normalizeMerchantPL,
  normalizeMerchantWithPLOverride,
  suggestCategoryFromMerchantPL,
} from './merchants-pl';
import { parseGeneric } from './generic';

export interface ParsedNotification {
  /** Numeric amount (always positive). */
  amount: number;
  /** Canonical merchant name (normalizer applied). */
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
 *
 * Returns null when:
 *  - No package-specific template exists AND the generic parser finds nothing.
 *  - The amount cannot be parsed or is zero.
 *  - The currency is detected but is not in the app's supported set.
 *
 * Callers should silently skip null results (the notification is not a
 * transaction capture, or the currency is not supported).
 */
export function parseNotification(
  packageName: string,
  title: string,
  text: string,
  postedAt: number,
): ParsedNotification | null {
  try {
    const fullText = `${title}\n${text}`.trim();
    const template = TEMPLATES[packageName];

    let amount: number;
    let currencyCode: string;
    let merchant: string | null = null;

    if (template) {
      // ---------------------------------------------------------------
      // Path A: package-specific PL template
      // ---------------------------------------------------------------
      const amountMatch = fullText.match(template.amountRegex);
      if (!amountMatch || !amountMatch[1]) {
        // Template exists but didn't match — fall through to generic
        return _parseWithGeneric(title, text, postedAt);
      }

      const rawAmount = amountMatch[1]
        .replace(/\s/g, '')   // "1 234,56" → "1234,56"
        .replace(',', '.');    // normalize decimal separator
      const parsed = parseFloat(rawAmount);
      if (!isFinite(parsed) || parsed <= 0) return null;
      amount = parsed;

      // Currency
      let detectedCurrency = template.currencyDefault;
      if (template.currencyRegex) {
        const currMatch = fullText.match(template.currencyRegex);
        if (currMatch) {
          const raw = (currMatch[1] || currMatch[2] || '').trim();
          detectedCurrency =
            SYMBOL_TO_CURRENCY[raw] ?? raw.toUpperCase() ?? template.currencyDefault;
        }
      }
      currencyCode = detectedCurrency;

      // Merchant (PL normalizer)
      if (template.merchantRegex) {
        const merchantMatch = fullText.match(template.merchantRegex);
        if (merchantMatch && merchantMatch[1]) {
          const raw = merchantMatch[1].trim();
          merchant = normalizeMerchantPL(raw) ?? raw;
        }
      }
    } else {
      // ---------------------------------------------------------------
      // Path B: no template — try generic parser
      // ---------------------------------------------------------------
      return _parseWithGeneric(title, text, postedAt);
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

/**
 * Internal helper: run the generic parser and wrap the result in
 * ParsedNotification.  Applies the PL canonical overlay so that European
 * banks whose notifications mention "BIEDRONKA", "IKEA", "Starbucks" etc.
 * still get canonical names even without a PL template.
 */
function _parseWithGeneric(
  title: string,
  text: string,
  postedAt: number,
): ParsedNotification | null {
  const result = parseGeneric(title, text);
  if (!result) return null;

  // Apply PL canonical overlay in case the merchant is a known brand
  const merchant = result.merchant
    ? (normalizeMerchantWithPLOverride(result.merchant) ?? result.merchant)
    : null;

  const suggestedCategory = merchant
    ? suggestCategoryFromMerchantPL(merchant)
    : undefined;

  return {
    amount: result.amount,
    merchant,
    currencyCode: result.currencyCode,
    occurredAt: new Date(postedAt),
    suggestedCategory,
  };
}
