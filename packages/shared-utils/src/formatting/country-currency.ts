import type { Currency } from '@budget/shared-types';

/**
 * ISO 3166-1 alpha-2 country -> the supported currency used there (travel-currency-suggestion).
 * Only countries whose national currency is one of the 15 supported `Currency` codes are listed;
 * anything absent means "no suggestion" (an unsupported currency must never be guessed).
 * A currency used in several countries (EUR, CHF, USD, ...) simply appears on several rows.
 */
export const COUNTRY_CURRENCY: Readonly<Record<string, Currency>> = {
  // Eurozone
  AT: 'EUR', BE: 'EUR', HR: 'EUR', CY: 'EUR', EE: 'EUR', FI: 'EUR', FR: 'EUR', DE: 'EUR',
  GR: 'EUR', IE: 'EUR', IT: 'EUR', LV: 'EUR', LT: 'EUR', LU: 'EUR', MT: 'EUR', NL: 'EUR',
  PT: 'EUR', SK: 'EUR', SI: 'EUR', ES: 'EUR', AD: 'EUR', MC: 'EUR', SM: 'EUR', VA: 'EUR',
  ME: 'EUR', XK: 'EUR',
  US: 'USD', EC: 'USD', PR: 'USD',
  PL: 'PLN',
  GB: 'GBP', GG: 'GBP', JE: 'GBP', IM: 'GBP',
  UA: 'UAH',
  RU: 'RUB',
  BY: 'BYN',
  CZ: 'CZK',
  SE: 'SEK',
  NO: 'NOK',
  DK: 'DKK',
  HU: 'HUF',
  RO: 'RON',
  CH: 'CHF', LI: 'CHF',
  BR: 'BRL',
};

/** Supported currency for an ISO country code (case-insensitive), or null. */
export function currencyForCountry(countryCode: string | null | undefined): Currency | null {
  if (!countryCode) return null;
  return COUNTRY_CURRENCY[countryCode.trim().toUpperCase()] ?? null;
}

export interface LocalCurrencySuggestion {
  countryCode: string;
  currency: Currency;
}

/**
 * Pure decision: should the create form nudge towards the local currency?
 * Null when the country is unknown/unsupported, matches the base currency, was dismissed,
 * or the form already uses that currency.
 */
export function suggestLocalCurrency(input: {
  countryCode: string | null | undefined;
  baseCurrency: string;
  currentCurrency: string;
  dismissedCountries: readonly string[];
}): LocalCurrencySuggestion | null {
  const cc = input.countryCode?.trim().toUpperCase();
  if (!cc) return null;
  const currency = currencyForCountry(cc);
  if (!currency) return null;
  if (currency === input.baseCurrency || currency === input.currentCurrency) return null;
  if (input.dismissedCountries.includes(cc)) return null;
  return { countryCode: cc, currency };
}
