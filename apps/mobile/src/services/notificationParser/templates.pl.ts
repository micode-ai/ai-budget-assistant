/**
 * Per-package notification parse templates for Polish banks.
 * Keyed by Android package name. Each template contains:
 *  - amountRegex: captures the transaction amount (group 1). Handles PLN "1 234,56" and
 *    other common formats (no space, dot decimal).
 *  - merchantRegex: captures the merchant / payee name (group 1). Optional — some banks
 *    embed it in the title, others in text.
 *  - currencyRegex: captures an explicit currency code (group 1). Optional — falls back to
 *    currencyDefault.
 *  - currencyDefault: the fallback currency when no currency is detected in the text.
 *
 * Amount regex convention:
 *   - Matches "1 234,56", "1234,56", "1 234.56", "1234.56"
 *   - Negative sign optional (debit notifications are always positive amounts for our purposes)
 *   - Named group not used (old-school \d+[\s\d]*[,\.]\d{1,2} pattern for broad compatibility)
 *
 * Sources: manual inspection of sample notifications from each bank's Android app.
 * These are APPROXIMATE — notification format can change with app updates. The parser
 * is fault-tolerant: a null result from parseNotification is silently skipped.
 *
 * Phase 2: move to a server-managed `notification_parse_templates` table + admin UI
 * (spec §2b, deferred). For now, code-shipped is sufficient.
 */

export interface NotificationTemplate {
  /** Regex matching the debit amount. Group 1 = raw amount string. */
  amountRegex: RegExp;
  /** Regex matching the merchant / payee. Group 1 = raw merchant string. Null = not available. */
  merchantRegex: RegExp | null;
  /** Regex matching an explicit currency code. Group 1 = code. Null = use currencyDefault. */
  currencyRegex: RegExp | null;
  /** Default currency when currencyRegex does not match. */
  currencyDefault: string;
}

// Shared amount pattern: "1 234,56 zł", "1234.56 PLN", "50,00", etc.
// Group 1: digits + optional separators + decimal part
const AMOUNT_PATTERN_PL =
  /(?:(?:-)?\s*)((?:\d[\d\s]*)?[\d]+[,.][\d]{1,2})/;

// Currency from text (PLN, EUR, USD, GBP, UAH, RUB, etc.)
const CURRENCY_PATTERN = /\b(PLN|EUR|USD|GBP|UAH|RUB|CHF|CZK|NOK|SEK|DKK|HUF|BYN)\b/i;

export const TEMPLATES: Record<string, NotificationTemplate> = {
  // PKO BP — two notification formats:
  //   New: "Autoryzacja transakcji kartowej" / "Kwota: 2,70 PLN.\nMiejsce: ZABKA ZB817 K.2, GDANSK."
  //   Old: "Płatność kartą -123,45 PLN w SKLEP NAZWA"
  'pl.pkobp.iko': {
    amountRegex: /(?:Kwota\s*:\s*|P[łl]atno[śs][śc][ćc]|Przelew|Wyp[łl]ata|Op[łl]ata|Obci[ąa][żz]enie(?:\s+karty?)?)[^0-9]*([\d][\d\s]*[,.][\d]{1,2})/i,
    // New format: "Miejsce: ZABKA ZB817 K.2, GDANSK." → captures "ZABKA ZB817 K.2"
    // Old format: "... PLN w SKLEP NAZWA" → captures "SKLEP NAZWA"
    merchantRegex: /(?:Miejsce\s*:\s*|\bw\s+)(.+?)(?:,\s*[A-Z]{2,}\.?\s*(?:\n|$)|\.?\s*$|\s+na\s+)/im,
    currencyRegex: CURRENCY_PATTERN,
    currencyDefault: 'PLN',
  },

  // mBank — "Obciążenie -50,00 PLN | ŻABKA 1234"
  'pl.mbank': {
    amountRegex: /(?:Obci[ąa][żz]enie|P[łl]atno[śs][śc][ćc]|Przelew)[^0-9]*([\d][\d\s]*[,.][\d]{1,2})/i,
    merchantRegex: /\|\s*(.+?)(?:\s*$|\s+\d{4})/i,
    currencyRegex: CURRENCY_PATTERN,
    currencyDefault: 'PLN',
  },

  // Bank Pekao — "Transakcja -100,00 PLN. Sklep: BIEDRONKA"
  'eu.eleader.mobilebanking.pekao': {
    amountRegex: AMOUNT_PATTERN_PL,
    merchantRegex: /(?:Sklep|Odbiorca|Tytu[łl])[:\s]+(.+?)(?:\s*$|\s*\.)/i,
    currencyRegex: CURRENCY_PATTERN,
    currencyDefault: 'PLN',
  },

  // Revolut — "You paid €12.34 at Starbucks" or "Spent £50.00 at Amazon"
  'com.revolut.revolut': {
    amountRegex: /(?:paid|spent|You paid|You spent)[^0-9€£$¥₴₽]*([\d][\d\s]*[,.][\d]{1,2})/i,
    merchantRegex: /(?:at|@)\s+(.+?)(?:\s*$)/i,
    currencyRegex: /([€£$¥₴₽])|(\b(?:EUR|GBP|USD|JPY|UAH|RUB|PLN)\b)/i,
    currencyDefault: 'PLN',
  },

  // ING Bank Śląski — "Płatność 75,50 PLN - LIDL SKLEP"
  'pl.ing.mojeing': {
    amountRegex: /P[łl]atno[śs][śc][ćc]\s*([\d][\d\s]*[,.][\d]{1,2})/i,
    merchantRegex: /(?:PLN|EUR|USD|GBP)\s*-\s*(.+?)(?:\s*$)/i,
    currencyRegex: CURRENCY_PATTERN,
    currencyDefault: 'PLN',
  },

  // Millennium Bank — "Obciążenie rachunku -200,00 PLN | Allegro"
  'wit.android.bcpBankingApp.millenniumPL': {
    amountRegex: /(?:Obci[ąa][żz]enie|P[łl]atno[śs][śc][ćc])[^0-9]*([\d][\d\s]*[,.][\d]{1,2})/i,
    merchantRegex: /\|\s*(.+?)(?:\s*$)/i,
    currencyRegex: CURRENCY_PATTERN,
    currencyDefault: 'PLN',
  },

  // Santander Bank Polska — "Transakcja kartą 45,00 PLN ZABKA"
  'pl.bzwbk.bzwbk24': {
    amountRegex: AMOUNT_PATTERN_PL,
    merchantRegex: /(?:PLN|EUR|USD|GBP)\s+(.+?)(?:\s*$)/i,
    currencyRegex: CURRENCY_PATTERN,
    currencyDefault: 'PLN',
  },

  // Alior Bank — "Płatność -30,00 PLN: MCDONALD'S"
  'pl.aliorbank.aib': {
    amountRegex: AMOUNT_PATTERN_PL,
    merchantRegex: /(?:PLN|EUR|USD|GBP)[:\s]+(.+?)(?:\s*$)/i,
    currencyRegex: CURRENCY_PATTERN,
    currencyDefault: 'PLN',
  },

  // BNP Paribas — "Obciążenie 88,99 PLN - Carrefour"
  'com.finanteq.finance.bgz': {
    amountRegex: AMOUNT_PATTERN_PL,
    merchantRegex: /(?:PLN|EUR|USD|GBP)\s*-\s*(.+?)(?:\s*$)/i,
    currencyRegex: CURRENCY_PATTERN,
    currencyDefault: 'PLN',
  },

  // Credit Agricole — "Płatność kartą 22,50 PLN\nOdbiorca: KFC"
  'pl.ca.mobile': {
    amountRegex: AMOUNT_PATTERN_PL,
    merchantRegex: /(?:Odbiorca|Sklep)[:\s]+(.+?)(?:\s*$|\n)/i,
    currencyRegex: CURRENCY_PATTERN,
    currencyDefault: 'PLN',
  },

  // Nest Bank — "Wydatek 15,00 PLN - ZABKA"
  'pl.nestbank.nestbank': {
    amountRegex: AMOUNT_PATTERN_PL,
    merchantRegex: /(?:PLN|EUR|USD|GBP)\s*-\s*(.+?)(?:\s*$)/i,
    currencyRegex: CURRENCY_PATTERN,
    currencyDefault: 'PLN',
  },
};

/** Currency symbol → ISO code mapping for Revolut-style notifications. */
export const SYMBOL_TO_CURRENCY: Record<string, string> = {
  '€': 'EUR',
  '£': 'GBP',
  '$': 'USD',
  '¥': 'JPY',
  '₴': 'UAH',
  '₽': 'RUB',
  'zł': 'PLN',
};
