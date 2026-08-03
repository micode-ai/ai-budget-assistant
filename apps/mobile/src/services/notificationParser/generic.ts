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
  // The ISO code matters as much as the symbol: most non-PL European banks write
  // "12,34 EUR", not "€12,34". Without this entry every such push was dropped for
  // "no currency detected" (ABA-387).
  'EUR': 'EUR',
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
  // No unsupported currency is mapped here — this map is symbol → ISO for
  // currencies the app can actually store. See DETECTABLE_UNSUPPORTED below for
  // the ones we recognise only in order to say why we are skipping them.
};

/**
 * Currencies the app cannot store, but still wants to *recognise* so the skip
 * is diagnosable: `extractCurrency` reports them with `supported: false`, and
 * `parseGeneric` logs which currency it refused before returning null. Without
 * this, an unsupported-currency notification is indistinguishable from one
 * where no currency was found at all, and a user in e.g. Switzerland just sees
 * auto-capture silently do nothing.
 *
 * Kept to CHF and CZK on purpose. `CURRENCY_RE` is built without word
 * boundaries, so every token here can also match inside an unrelated word —
 * and a false match makes a perfectly good capture get skipped. `NOK` would hit
 * "NOKIA", `SEK` would hit Polish "SEKTOR", and `RON` would hit "ELEKTRONIKA".
 * Do not extend this list without first anchoring the regex on word boundaries.
 */
const DETECTABLE_UNSUPPORTED = ['CHF', 'CZK'];

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
  // The thousands separator class must include the COMMA. Without it "1,234.56"
  // could not be matched from its first digit — the group stopped at "1", the
  // comma failed the `[.\s]` class, and the scan resumed mid-number and captured
  // "234.56". A bank push for 1 234,56 was therefore captured as 234,56.
  // Both orders stay correct with the comma allowed: "1,234.56" has no
  // `,\d{1,2}$` tail so it takes the Anglo branch (strip commas → 1234.56), and
  // "1.234,56" does, so it takes the European branch (strip dots → 1234.56).
  /(?:[-−–]\s*)?((?:\d{1,3}(?:[.,\s]\d{3})*|\d+)[,.][\d]{1,2})(?!\d)/g;

/**
 * Percentages are never monetary amounts. A Revolut crypto price alert ("Bitcoin is
 * up 5.32% in the past 2 hours…") and a loan ad ("RRSO 7,25%") both contain a
 * decimal number that `AMOUNT_RE` happily reads as an amount — that is how eight
 * phantom USD expenses reached production (ABA-387). Masking them out is done on
 * the text used for AMOUNT matching only; currency and merchant still see the
 * original text.
 *
 * Internal whitespace is deliberately NOT allowed between the digits and the `%`
 * so that "12,34 PLN … 10%" cannot swallow the real amount.
 */
const PERCENT_RE = /\d[\d.,]*\s*%/g;

export function maskPercentages(text: string): string {
  return text.replace(PERCENT_RE, ' ');
}

/**
 * Parse the first plausible monetary amount, reporting whether it carried an
 * explicit debit sign (−/-/–). The sign is the strongest "this is a real charge"
 * signal a terse bank push gives us — see `looksLikeSpendNotification`.
 */
export function extractAmountSigned(text: string): { value: number; negative: boolean } | null {
  const masked = maskPercentages(text);
  AMOUNT_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = AMOUNT_RE.exec(masked)) !== null) {
    const raw = match[1];
    const normalized = /,\d{1,2}$/.test(raw)
      ? raw.replace(/[\s.]/g, '').replace(',', '.')
      : raw.replace(/,/g, '');
    const value = parseFloat(normalized);
    if (isFinite(value) && value > 0) {
      return { value, negative: /^[-−–]/.test(match[0]) };
    }
  }
  return null;
}

/**
 * Parse the first plausible monetary amount out of raw notification text.
 * Returns a positive JS number, or null if none found or the result is
 * non-finite / zero.
 */
export function extractAmount(text: string): number | null {
  const masked = maskPercentages(text);
  // Reset lastIndex before each use (global regex)
  AMOUNT_RE.lastIndex = 0;

  let best: number | null = null;
  let match: RegExpExecArray | null;

  while ((match = AMOUNT_RE.exec(masked)) !== null) {
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

const ALL_CURRENCY_TOKENS = [...Object.keys(SYMBOL_TO_ISO), ...DETECTABLE_UNSUPPORTED];

const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Symbols and non-ASCII abbreviations (€, $, zł, грн, руб …) are matched anywhere —
 * they cannot occur inside an ordinary word.
 * ASCII letter codes (PLN, EUR, USD, Br …) are matched on **word boundaries**: the
 * old boundary-less regex made `Br` match the "br" inside "brutto" and report BYN,
 * and the same trap is why NOK/SEK/RON are still absent from DETECTABLE_UNSUPPORTED
 * (they would hit "NOKIA", "SEKTOR", "ELEKTRONIKA").
 */
const ASCII_WORD_TOKENS = ALL_CURRENCY_TOKENS.filter((t) => /^[A-Za-z]+$/.test(t));
const SYMBOL_TOKENS = ALL_CURRENCY_TOKENS.filter((t) => !/^[A-Za-z]+$/.test(t)).sort(
  (a, b) => b.length - a.length, // longer first: "US$" before "$"
);

// Regex matching any known currency symbol or ISO code that may appear
// adjacent to an amount (before or after, with optional whitespace).
// We test the full text because the currency can appear anywhere.
const CURRENCY_RE = new RegExp(
  '(' +
    [...SYMBOL_TOKENS.map(escapeRe), '\\b(?:' + ASCII_WORD_TOKENS.map(escapeRe).join('|') + ')\\b'].join('|') +
    ')',
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
// Transaction intent
// ---------------------------------------------------------------------------

/**
 * The native allow-list is per **app**, not per **notification** — a bank app also
 * pushes price alerts, balance updates, rate alerts, marketing and login codes. Any
 * of those containing a number and a currency used to become an expense, which is
 * how "The Past 2 Hours. It's Now — 5.32 USD" was booked as spending (ABA-387).
 *
 * Words a debit notification actually uses, in the languages the app supports. The
 * Polish/German/etc. terms deliberately match the keywords the per-bank templates in
 * templates.pl.ts already anchor on, so gating on this never rejects a push those
 * templates were written for. Diacritics are optional throughout ([ea] classes)
 * because notification text is inconsistent about them.
 */
const SPEND_INTENT_RE =
  /(?:paid|pay(?:ment|ing)?|spent|spend|purchase|charged?|withdraw(?:al|n)?|debit(?:ed)?|transaction|p[łl]atno[śs][ćc]|zap[łl]aco|obci[ąa][żz]eni|op[łl]at|wyp[łl]at|przelew|wydatek|transakcj|zakup|zahlung|bezahlt|abbuchung|belastung|umsatz|pago|pagado|compra|cargo|paiement|pay[ée]|achat|pr[ée]l[èe]vement|betaling|betaald|afschrijving|platb|zaplac|опла|списан|покупк|плат[её]ж|перевод|спіс|платіж|переказ|аплат|пакупк)/iu;

/**
 * A declined / rejected / cancelled attempt moved no money. Checked BEFORE the
 * intent words, because such a push usually contains one ("transaction declined").
 */
const DECLINED_RE =
  /(?:declin|reject|refus|fail|cancell?ed|insufficient|odrzucon|nieudan|odmow|anulowan|abgelehnt|fehlgeschlagen|rechazad|geweigerd|отклон|отказ|неудач|відхилен|відмов|адхілен)/iu;

export function hasSpendIntent(text: string): boolean {
  return SPEND_INTENT_RE.test(text);
}

export function isDeclined(text: string): boolean {
  return DECLINED_RE.test(text);
}

/**
 * Whether a notification looks like money actually leaving the account.
 * Accepts either explicit spend wording or an explicit debit sign on the amount
 * (terse pushes like "-12,34 EUR ALBERT HEIJN" carry no keyword at all, while a
 * price/balance/rate alert never shows a minus in front of its number).
 *
 * Shared by BOTH parse paths — see parseNotification in ./index.ts.
 */
export function looksLikeSpendNotification(text: string): boolean {
  if (isDeclined(text)) return false;
  if (hasSpendIntent(text)) return true;
  return /[-−–]\s*\d/.test(maskPercentages(text));
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

  // --- Is this a spend at all? ---
  // Rejects price alerts, balance updates, rate alerts and declined attempts (ABA-387).
  // Deliberately AFTER the currency check: an unsupported-currency notification must
  // still emit its diagnostic warn even in a language whose spend keywords we don't
  // carry (e.g. Czech), otherwise the currency-support gap becomes invisible.
  if (!looksLikeSpendNotification(fullText)) return null;

  // --- Merchant (best-effort, may be null) ---
  const rawMerchant = extractMerchantRaw(fullText);
  const merchant = normalizeMerchant(rawMerchant ?? undefined) ?? null;

  return { amount, currencyCode: currencyResult.code, merchant };
}
