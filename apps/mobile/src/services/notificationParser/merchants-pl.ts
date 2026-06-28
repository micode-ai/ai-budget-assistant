/**
 * Mobile-local copy of the merchant category / canonical-name utilities.
 * Mirrors apps/api/src/modules/import-bank/merchants/merchants-pl.ts.
 *
 * WHY a copy: the mobile engineer scope does not touch apps/api/ (CLAUDE.md).
 * The notificationParser runs client-side and needs these helpers without crossing
 * the API boundary. Keep in sync manually when the API version is updated.
 *
 * Last synced from API version: 2026-06-28.
 */

export const MERCHANTS_PL: Record<string, string> = {
  // Groceries
  BIEDRONKA: 'Groceries',
  ZABKA: 'Groceries',
  'ŻABKA': 'Groceries',
  LIDL: 'Groceries',
  KAUFLAND: 'Groceries',
  CARREFOUR: 'Groceries',
  AUCHAN: 'Groceries',
  TESCO: 'Groceries',
  NETTO: 'Groceries',
  STOKROTKA: 'Groceries',
  DINO: 'Groceries',
  ALDI: 'Groceries',
  // Pharmacy / Health
  ROSSMANN: 'Health',
  HEBE: 'Health',
  SUPERPHARM: 'Health',
  APTEKA: 'Health',
  // Shopping / E-commerce
  ALLEGRO: 'Shopping',
  EMPIK: 'Shopping',
  'MEDIA MARKT': 'Shopping',
  MEDIAMARKT: 'Shopping',
  'RTV EURO': 'Shopping',
  IKEA: 'Shopping',
  ZARA: 'Shopping',
  HM: 'Shopping',
  RESERVED: 'Shopping',
  CCC: 'Shopping',
  // Transport / Fuel
  ORLEN: 'Transport',
  BP: 'Transport',
  LOTOS: 'Transport',
  SHELL: 'Transport',
  CIRCLE: 'Transport',
  UBER: 'Transport',
  BOLT: 'Transport',
  FREENOW: 'Transport',
  PKP: 'Transport',
  // Food delivery / Restaurants
  'PYSZNE.PL': 'Cafe & Restaurants',
  GLOVO: 'Cafe & Restaurants',
  WOLT: 'Cafe & Restaurants',
  MCDONALD: 'Cafe & Restaurants',
  KFC: 'Cafe & Restaurants',
  STARBUCKS: 'Cafe & Restaurants',
  // Subscriptions
  NETFLIX: 'Subscriptions',
  SPOTIFY: 'Subscriptions',
  HBO: 'Subscriptions',
  DISNEY: 'Subscriptions',
  APPLE: 'Subscriptions',
  GOOGLE: 'Subscriptions',
};

export function suggestCategoryFromMerchantPL(merchant: string | undefined): string | undefined {
  if (!merchant) return undefined;
  const upper = merchant.toUpperCase();
  for (const key of Object.keys(MERCHANTS_PL)) {
    if (upper.includes(key)) return MERCHANTS_PL[key];
  }
  return undefined;
}

export const MERCHANT_CANONICAL_PL: Record<string, string> = {
  // Groceries
  BIEDRONKA: 'Biedronka',
  'ŻABKA': 'Żabka',
  ZABKA: 'Żabka',
  LIDL: 'Lidl',
  KAUFLAND: 'Kaufland',
  CARREFOUR: 'Carrefour',
  AUCHAN: 'Auchan',
  TESCO: 'Tesco',
  STOKROTKA: 'Stokrotka',
  DINO: 'Dino',
  ALDI: 'Aldi',
  // Pharmacy / Health
  ROSSMANN: 'Rossmann',
  HEBE: 'Hebe',
  SUPERPHARM: 'Super-Pharm',
  // Shopping / E-commerce
  ALLEGRO: 'Allegro',
  EMPIK: 'Empik',
  'MEDIA MARKT': 'Media Markt',
  MEDIAMARKT: 'Media Markt',
  'RTV EURO': 'RTV Euro AGD',
  IKEA: 'IKEA',
  ZARA: 'Zara',
  RESERVED: 'Reserved',
  CCC: 'CCC',
  // Transport / Fuel
  ORLEN: 'Orlen',
  LOTOS: 'Lotos',
  SHELL: 'Shell',
  CIRCLE: 'Circle K',
  UBER: 'Uber',
  BOLT: 'Bolt',
  FREENOW: 'FreeNow',
  // Food delivery / Restaurants
  'PYSZNE.PL': 'Pyszne.pl',
  GLOVO: 'Glovo',
  WOLT: 'Wolt',
  MCDONALD: "McDonald's",
  KFC: 'KFC',
  STARBUCKS: 'Starbucks',
  // Subscriptions
  NETFLIX: 'Netflix',
  SPOTIFY: 'Spotify',
  DISNEY: 'Disney+',
};

const CANONICAL_KEYS_BY_LENGTH = Object.keys(MERCHANT_CANONICAL_PL).sort(
  (a, b) => b.length - a.length,
);

/**
 * If `name` contains a known brand substring, return its canonical display name;
 * otherwise return `name` unchanged. Undefined passes through. Idempotent.
 */
export function normalizeMerchantPL(name: string | undefined): string | undefined {
  if (!name) return name;
  const upper = name.toUpperCase();
  for (const key of CANONICAL_KEYS_BY_LENGTH) {
    if (upper.includes(key)) return MERCHANT_CANONICAL_PL[key];
  }
  return name;
}
