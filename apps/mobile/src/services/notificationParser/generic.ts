/**
 * Generic (country-agnostic) notification parser.
 *
 * Runs when there is no package-specific template in templates.pl.ts, or when
 * the package-specific template fails to match.  The goal is "better than
 * nothing" for the ~30+ European banks now in the allow-list that don't have
 * hand-crafted regexes.  Being conservative is a first-class requirement:
 *   - Return null rather than invent a currency or a wrong amount.
 *   - If the detected currency is not in the app's supported set, warn and
 *     return null (creates no expense rather than a wrong-currency expense).
 *
 * NEVER import from apps/api/.  This module is mobile-engineer scope only.
 */

// Note: no import from merchants-pl.ts here — that file imports from us.
// The PL canonical overlay (normalizeMerchantWithPLOverride) lives in merchants-pl.ts.

// ---------------------------------------------------------------------------
// Supported currencies (matches packages/shared-types/src/entities/primitives.ts
// Currency = 'USD' | 'EUR' | 'PLN' | 'GBP' | 'UAH' | 'RUB' | 'BYN')
// ---------------------------------------------------------------------------
export const SUPPORTED_CURRENCIES = new Set<string>([
  'USD', 'EUR', 'PLN', 'GBP', 'UAH', 'RUB', 'BYN',
]);

// ---------------------------------------------------------------------------
// Symbol / code → ISO 4217 mapping (superset; filtered by SUPPORTED_CURRENCIES)
// ---------------------------------------------------------------------------
export const SYMBOL_TO_ISO: Record<string, string> = {
  '€': 'EUR',
  '$': 'USD',
  'US$': 'USD',
  'zł': 'PLN',
  'PLN': 'PLN',
  '£': 'GBP',
  'GBP': 'GBP',
  '₴': 'UAH',
  'грн': 'UAH',
  'UAH': 'UAH',
  '₽': 'RUB',
  'руб': 'RUB',
  'RUB': 'RUB',
  'BYN': 'BYN',
  'Br': 'BYN', // Belarusian ruble abbreviation used in some apps
  // Deliberately NOT mapping CHF, CZK, SEK, NOK, DKK, HUF — unsupported
};

// ---------------------------------------------------------------------------
// Amount extraction
// ---------------------------------------------------------------------------

/**
 * Regex that captures a monetary amount in both European comma-decimal
 * ("1 234,56", "1.234,56") and Anglo dot-decimal ("1,234.56", "1234.56") styles.
 *
 * Group 1: the raw matched amount string (may contain spaces / separators).
 *
 * Strategy: match the LONGEST candidate that looks like a monetary number
 * (at least one decimal part ≥ 1 digit).  We specifically require a decimal
 * separator so we don't capture PIN digits, reference numbers, etc.
 *
 * Negative/debit prefix (−, -, –) is accepted but the returned amount is
 * always positive.
 */
const AMOUNT_RE =
  /(?:[-−–]\s*)?((?:\d{1,3}(?:[.\s]\d{3})*|\d+)[,.][\d]{1,2})(?!\d)/g;

/**
 * Parse the first plausible monetary amount out of raw notification text.
 * Returns a positive JS number, or null if none found or the result is
 * non-finite / zero.
 */
export function extractAmount(text: string): number | null {
  // Reset lastIndex before each use (global regex)
  AMOUNT_RE.lastIndex = 0;

  let best: number | null = null;
  let match: RegExpExecArray | null;

  while ((match = AMOUNT_RE.exec(text)) !== null) {
    const raw = match[1];

    // Determine decimal style
    let normalized: string;
    if (/,\d{1,2}$/.test(raw)) {
      // European: comma is decimal separator → strip space/dot thousands then swap
      normalized = raw
        .replace(/[\s.]/g, '')   // remove thousands separators
        .replace(',', '.');       // swap decimal
    } else {
      // Anglo: dot is decimal separator → strip comma thousands
      normalized = raw.replace(/,/g, '');
    }

    const value = parseFloat(normalized);
    if (isFinite(value) && value > 0) {
      // Prefer the first match (amounts usually appear near the top of the text)
      if (best === null) best = value;
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// Currency extraction
// ---------------------------------------------------------------------------

// Build a sorted list: longer symbols/codes first to avoid partial matches
// (e.g. "US$" before "$")
const CURRENCY_TOKENS = Object.keys(SYMBOL_TO_ISO).sort((a, b) => b.length - a.length);

// Regex matching any known currency symbol or ISO code that may appear
// adjacent to an amount (before or after, with optional whitespace).
// We test the full text because the currency can appear anywhere.
const CURRENCY_RE = new RegExp(
  '(' + CURRENCY_TOKENS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')',
  'i',
);

/**
 * Detect the currency from the notification text.
 * Returns the ISO 4217 code if supported, or null if not found / not in the
 * supported set.  Callers should also pass the symbol separately if the bank's
 * template already found it.
 */
export function extractCurrency(text: string): { code: string; supported: boolean } | null {
  const m = CURRENCY_RE.exec(text);
  if (!m) return null;

  const token = m[1];
  // Try exact match first, then uppercase
  const iso = SYMBOL_TO_ISO[token] ?? SYMBOL_TO_ISO[token.toUpperCase()] ?? token.toUpperCase();
  return { code: iso, supported: SUPPORTED_CURRENCIES.has(iso) };
}

// ---------------------------------------------------------------------------
// Merchant extraction
// ---------------------------------------------------------------------------

/**
 * Language-aware connector words that typically precede the merchant name in
 * bank push notifications.  Ordered by specificity (longer patterns first to
 * reduce greediness).
 */
const MERCHANT_CONNECTORS: RegExp[] = [
  // Russian / Ukrainian (Cyrillic)
  /(?:в\s+магазине|в\s+|у\s+)([\p{L}][\p{L}\p{N}\s&'.,-]{1,60})/u,
  // Polish
  /(?:w\s+sklepie|przy\s+|w\s+)([\p{L}][\p{L}\p{N}\s&'.,-]{1,60})/iu,
  // German / Dutch
  /(?:bei\s+|in\s+(?:einem\s+|der\s+|dem\s+)?)([\p{L}][\p{L}\p{N}\s&'.,-]{1,60})/iu,
  // French
  /(?:chez\s+|à\s+|au\s+|aux\s+)([\p{L}][\p{L}\p{N}\s&'.,-]{1,60})/iu,
  // Spanish
  /(?:en\s+|comercio\s+)([\p{L}][\p{L}\p{N}\s&'.,-]{1,60})/iu,
  // Dutch
  /(?:bij\s+)([\p{L}][\p{L}\p{N}\s&'.,-]{1,60})/iu,
  // Generic English
  /(?:at\s+|to\s+|@\s*)([\p{L}][\p{L}\p{N}\s&'.,-]{1,60})/iu,
  // Pipe / dash separator used by many Eastern-European banks (e.g. "mBank")
  /[|–—]\s*([\p{L}][\p{L}\p{N}\s&'.,-]{2,60})/u,
];

/** Tokens that are almost certainly NOT a merchant name. */
const NOISE_TOKENS = new Set([
  'bank', 'account', 'card', 'konto', 'karta', 'банк', 'счёт', 'рахунок',
  'card', 'debit', 'credit', 'payment', 'zahlung', 'paiement', 'pago',
  'transaction', 'transaktion', 'transacción', 'transaction',
  'betaling', 'betaal', 'obrót', 'platba',
]);

/**
 * Heuristic merchant extraction from raw notification text.
 * Returns a raw string (not yet normalized) or null.
 */
function extractMerchantRaw(text: string): string | null {
  for (const re of MERCHANT_CONNECTORS) {
    const m = re.exec(text);
    if (m && m[1]) {
      const candidate = m[1].trim();
      const lower = candidate.toLowerCase();
      // Reject obvious noise tokens
      if (NOISE_TOKENS.has(lower)) continue;
      // Must start with a letter (not a digit / symbol)
      if (!/^\p{L}/u.test(candidate)) continue;
      return candidate;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Generic merchant normalizer (language-neutral base)
// ---------------------------------------------------------------------------

/** Card mask patterns like "****1234", "**** 1234", "xxxx1234". */
const CARD_MASK_RE = /(?:\*{4}|x{4})\s*\d{4}/gi;
/** Reference / transaction ID patterns (long digit sequences). */
const REF_NUMBER_RE = /\b\d{6,}\b/g;
/** Trailing country / city tokens (common 2-3 letter codes after whitespace). */
const COUNTRY_CITY_RE = /\s+[A-Z]{2,3}(?:\s|$)/g;
/** Trailing dates like "2024-01-15", "15.01.2024", "15/01/24". */
const DATE_RE = /\b\d{2}[.\-/]\d{2}[.\-/]\d{2,4}\b/g;

/**
 * Base (language-neutral) merchant normalizer.
 *  1. Strip card masks, reference numbers, dates, trailing country codes.
 *  2. Collapse whitespace.
 *  3. Title-case.
 *
 * This is the generic fallback.  PL-specific callers should additionally run
 * normalizeMerchantPL() on top (which applies the MERCHANT_CANONICAL_PL map).
 */
export function normalizeMerchant(raw: string | undefined): string | undefined {
  if (!raw) return raw;

  let s = raw
    .replace(CARD_MASK_RE, '')
    .replace(REF_NUMBER_RE, '')
    .replace(DATE_RE, '')
    .replace(COUNTRY_CITY_RE, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!s) return undefined;

  // Title-case: capitalize first letter of each word
  s = s
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  return s || undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GenericParseResult {
  amount: number;
  currencyCode: string;
  merchant: string | null;
}

/**
 * Attempt to extract a transaction (amount + currency + optional merchant)
 * from raw bank notification text.
 *
 * Returns null when:
 *  - No plausible amount is found.
 *  - No currency is detected (we refuse to guess).
 *  - The detected currency is not in the app's supported set (e.g. CHF, CZK).
 *    A console.warn is emitted so the gap is visible during development.
 *
 * Callers are responsible for the package allow-list check — this function
 * only parses; it doesn't know which package the notification came from.
 */
export function parseGeneric(title: string, text: string): GenericParseResult | null {
  const fullText = `${title}\n${text}`.trim();
  if (!fullText) return null;

  // --- Amount ---
  const amount = extractAmount(fullText);
  if (amount === null) return null;

  // --- Currency ---
  const currencyResult = extractCurrency(fullText);
  if (!currencyResult) {
    // Cannot determine currency — do not create a wrong-currency expense
    return null;
  }
  if (!currencyResult.supported) {
    console.warn(
      `[NotificationParser/generic] Unsupported currency detected: "${currencyResult.code}". ` +
        'This bank/currency combination is not yet supported by the app. ' +
        'No expense will be created. (Currency-support gap: add to shared-types Currency union to enable.)',
    );
    return null;
  }

  // --- Merchant (best-effort, may be null) ---
  const rawMerchant = extractMerchantRaw(fullText);
  const merchant = normalizeMerchant(rawMerchant ?? undefined) ?? null;

  return { amount, currencyCode: currencyResult.code, merchant };
}
