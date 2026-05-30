export const MERCHANTS_PL: Record<string, string> = {
  // Groceries
  BIEDRONKA: 'Groceries',
  ZABKA: 'Groceries',
  ŻABKA: 'Groceries',
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
  // Revolut-specific descriptions
  TOPUP: 'Income',
  'TOP-UP': 'Income',
  CASHBACK: 'Income',
  REFUND: 'Income',
  EXCHANGE: 'Currency Exchange',
  REVOLUT: 'Transfers',
};

export function suggestCategoryFromMerchantPL(merchant: string | undefined): string | undefined {
  if (!merchant) return undefined;
  const upper = merchant.toUpperCase();
  for (const key of Object.keys(MERCHANTS_PL)) {
    if (upper.includes(key)) return MERCHANTS_PL[key];
  }
  return undefined;
}
