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
 * Title and body are i18n keys derived from the id, NOT literal content. They
 * were plain English strings until ABA-530, which meant a Polish or Russian
 * user got localized buttons wrapped around English copy — in a section whose
 * whole job is telling people about features they would otherwise never find.
 * The justification on record cited blog/help markdown as precedent for
 * staying out of the 9-locale system; those are in fact the two long-form
 * surfaces this repo does translate into all nine, so it argued the opposite.
 *
 * Adding an entry therefore means adding `whatsNew.entries.<id>.title` and
 * `.body` to all nine locale files. The test in `__tests__` fails otherwise —
 * a missing key renders the key string itself to the user.
 */
export interface WhatsNewEntry {
  /**
   * Also the i18n key segment: the copy lives at
   * `whatsNew.entries.<id>.title` / `.body` in all nine locale files, which is
   * why the id is permanent in two senses now — the persisted last-seen
   * pointer AND the translations.
   */
  id: string;
  tier?: 'pro' | 'business';
  route?: string;
  helpSectionId?: string;
}

export const WHATS_NEW_ENTRIES: WhatsNewEntry[] = [
  {
    id: 'fat-finder',
    tier: 'pro',
    route: '/fat-finder',
  },
  {
    id: 'financial-health-score',
    helpSectionId: '02-dashboard',
  },
  {
    id: 'safe-to-spend',
    helpSectionId: '32-safe-to-spend',
  },
  {
    id: 'personal-inflation-index',
    helpSectionId: '36-personal-inflation-index',
  },
  {
    id: 'shopping-list-compare',
    tier: 'pro',
    route: '/shopping-list/compare',
  },
  {
    id: 'community-price-map',
    tier: 'pro',
    route: '/price-history/community',
  },
  {
    id: 'financial-wrapped',
    route: '/wrapped',
  },
  {
    id: 'inflation-shield',
    route: '/inflation-shield',
  },
  {
    id: 'ai-chat-shopping-tools',
    helpSectionId: '07-ai-chat',
  },
  {
    id: 'receipt-price-check',
    helpSectionId: '41-receipt-price-check',
  },
  {
    id: 'exchange-rate-alerts',
    route: '/wallet/exchange',
  },
  {
    id: 'shopping-list-auto-check',
    route: '/shopping-list',
  },
];
