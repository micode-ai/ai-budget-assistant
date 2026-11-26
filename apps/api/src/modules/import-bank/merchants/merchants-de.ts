/**
 * German merchant names → the same English category names the Polish
 * dictionary returns (`merchants-pl.ts`), so an import from a German bank lands
 * in the account's existing standard categories.
 *
 * Unlike the Polish dictionary this one matches whole words only. German
 * purpose lines are long ("SEPA-Lastschrift … Mandatsreferenz …"), and a
 * substring match on short keys such as `DM`, `DB` or `JET` would fire inside
 * unrelated words. Brands that are also common surnames or words (Müller,
 * Otto, Norma, real, Spar) are left out: a transfer from a person called
 * Müller is not a drugstore purchase.
 */
export const MERCHANTS_DE: Array<[string, string]> = [
  // Groceries
  ['REWE', 'Groceries'],
  ['EDEKA', 'Groceries'],
  ['ALDI', 'Groceries'],
  ['LIDL', 'Groceries'],
  ['KAUFLAND', 'Groceries'],
  ['NETTO', 'Groceries'],
  ['PENNY', 'Groceries'],
  ['GLOBUS', 'Groceries'],
  ['TEGUT', 'Groceries'],
  ['MARKTKAUF', 'Groceries'],
  ['BILLA', 'Groceries'],
  ['HOFER', 'Groceries'],
  ['FLINK', 'Groceries'],
  // Drugstores / health
  ['DM', 'Health'],
  ['DM-DROGERIE', 'Health'],
  ['ROSSMANN', 'Health'],
  ['APOTHEKE', 'Health'],
  // Shopping
  ['AMAZON', 'Shopping'],
  ['ZALANDO', 'Shopping'],
  ['IKEA', 'Shopping'],
  ['MEDIAMARKT', 'Shopping'],
  ['MEDIA MARKT', 'Shopping'],
  ['SATURN', 'Shopping'],
  ['TCHIBO', 'Shopping'],
  ['DECATHLON', 'Shopping'],
  ['PRIMARK', 'Shopping'],
  ['OBI', 'Shopping'],
  ['BAUHAUS', 'Shopping'],
  ['HORNBACH', 'Shopping'],
  ['TOOM', 'Shopping'],
  ['THALIA', 'Shopping'],
  // Transport / fuel
  ['DB VERTRIEB', 'Transport'],
  ['DEUTSCHE BAHN', 'Transport'],
  ['DB FERNVERKEHR', 'Transport'],
  ['BVG', 'Transport'],
  ['MVG', 'Transport'],
  ['HVV', 'Transport'],
  ['FLIXBUS', 'Transport'],
  ['ARAL', 'Transport'],
  ['SHELL', 'Transport'],
  ['ESSO', 'Transport'],
  ['TOTALENERGIES', 'Transport'],
  ['JET', 'Transport'],
  ['AVIA', 'Transport'],
  ['UBER', 'Transport'],
  ['BOLT', 'Transport'],
  ['FREENOW', 'Transport'],
  // Food delivery / restaurants
  ['LIEFERANDO', 'Cafe & Restaurants'],
  ['WOLT', 'Cafe & Restaurants'],
  ['MCDONALDS', 'Cafe & Restaurants'],
  ["MCDONALD'S", 'Cafe & Restaurants'],
  ['BURGER KING', 'Cafe & Restaurants'],
  ['STARBUCKS', 'Cafe & Restaurants'],
  ['BACKWERK', 'Cafe & Restaurants'],
  // Subscriptions
  ['NETFLIX', 'Subscriptions'],
  ['SPOTIFY', 'Subscriptions'],
  ['DISNEY PLUS', 'Subscriptions'],
  ['AUDIBLE', 'Subscriptions'],
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Longest key first, so "DM-DROGERIE" and "MEDIA MARKT" win over shorter keys.
const PATTERNS: Array<[RegExp, string]> = [...MERCHANTS_DE]
  .sort((a, b) => b[0].length - a[0].length)
  .map(([key, category]) => [new RegExp(`(^|[^A-ZÄÖÜ0-9])${escape(key)}($|[^A-ZÄÖÜ0-9])`), category]);

export function suggestCategoryFromMerchantDE(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const upper = text.toUpperCase();
  for (const [re, category] of PATTERNS) {
    if (re.test(upper)) return category;
  }
  return undefined;
}
