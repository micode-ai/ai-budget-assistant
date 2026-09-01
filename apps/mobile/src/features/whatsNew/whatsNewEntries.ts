/**
 * Static "What's New" content — see docs/contracts/whats-new-spotlight.md.
 *
 * Ordered OLDEST → NEWEST, append-only. `id` is permanent once shipped: the
 * spotlight mechanism persists the last-seen `id` on-device, so renaming or
 * removing an existing entry would either replay it for everyone or silently
 * skip whatever came after it for anyone already caught up to it.
 *
 * Every entry has a `route` (a real, already-shipped screen) OR a
 * `helpSectionId` (must exist in `src/help/sections.ts`) — never neither, so
 * the spotlight's "Tell me more" action always goes somewhere.
 *
 * Title/body are plain English content, not i18n keys (see the contract for
 * why) — only the mechanism's own chrome is localized.
 */
export interface WhatsNewEntry {
  id: string;
  title: string;
  body: string;
  tier?: 'pro' | 'business';
  route?: string;
  helpSectionId?: string;
}

export const WHATS_NEW_ENTRIES: WhatsNewEntry[] = [
  {
    id: 'fat-finder',
    title: 'Fat Finder',
    body: 'An AI audit of your spending that finds forgotten subscriptions, price hikes, and one-off charges worth a second look.',
    tier: 'pro',
    route: '/fat-finder',
  },
  {
    id: 'financial-health-score',
    title: 'Financial Health Score',
    body: 'A single 0-100 score on your home screen combining budget adherence, savings rate, goal progress, and debt health.',
    helpSectionId: '02-dashboard',
  },
  {
    id: 'safe-to-spend',
    title: 'Safe-to-Spend',
    body: "See exactly how much you can spend today without risking your bills, goals, or subscriptions — it's the number in your home hero.",
    helpSectionId: '32-safe-to-spend',
  },
  {
    id: 'personal-inflation-index',
    title: 'Personal Inflation Index',
    body: 'Track how prices for the exact products you buy have changed over time, built from your own scanned receipts.',
    helpSectionId: '36-personal-inflation-index',
  },
  {
    id: 'shopping-list-compare',
    title: "Where's cheapest?",
    body: 'Compare your shopping list across stores you actually shop at, using real prices from your receipt history.',
    tier: 'pro',
    route: '/shopping-list/compare',
  },
  {
    id: 'community-price-map',
    title: 'Community Price Map',
    body: 'See where nearby shoppers found the best price on a product, crowdsourced and anonymized — never traceable to anyone.',
    tier: 'pro',
    route: '/price-history/community',
  },
  {
    id: 'financial-wrapped',
    title: 'Financial Wrapped',
    body: 'A Spotify-Wrapped-style year in review of your money — top merchant, biggest month, savings rate, and more.',
    route: '/wrapped',
  },
  {
    id: 'inflation-shield',
    title: 'Inflation Shield',
    body: 'Forecasts which of your regular purchases are about to get more expensive, and suggests stocking up now.',
    route: '/inflation-shield',
  },
  {
    id: 'ai-chat-shopping-tools',
    title: 'Ask the AI to manage your shopping list',
    body: 'Tell the chat "add milk and eggs" or "what should I restock?" — it can add, remove, and suggest items directly.',
    helpSectionId: '07-ai-chat',
  },
  {
    id: 'receipt-price-check',
    title: 'Receipt price-check',
    body: "Every scanned receipt is quietly compared against what you paid last time at the same store — you'll see a note if something costs more than usual.",
    helpSectionId: '41-receipt-price-check',
  },
];
