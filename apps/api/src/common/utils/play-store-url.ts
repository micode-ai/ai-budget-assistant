/** The bare Play listing. Kept untagged for identity claims (an app-update prompt to an existing user). */
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.budget.assistant';

/**
 * A Play listing link tagged so the INSTALL it leads to can be attributed (ABA-734).
 *
 * Play passes the `referrer` parameter to the app once, at install, through the
 * Install Referrer API; the app reads it with `parseAcquisition` and stores it
 * first-touch. Without it the install reads `utm_source=(not set)`, which is how
 * every guest-page install landed in the `not-set` bucket — Play's "direct".
 *
 * Same two schemes as the landing generator's `play_url`: our own src/loc/lang,
 * which `parseAcquisition` prefers, and the `utm_*` pair, which Play Console's
 * own acquisition reports read. A referrer can never be re-tagged after the
 * install, so both are written now.
 *
 * Returns a raw URL — escape it before putting it in an HTML attribute.
 */
export function playStoreUrl(tags: { src: string; loc: string; lang?: string }): string {
  const ref = new URLSearchParams({ src: tags.src, loc: tags.loc });
  if (tags.lang) ref.set('lang', tags.lang);
  ref.set('utm_source', tags.src);
  ref.set('utm_medium', tags.loc);
  return `${PLAY_STORE_URL}&referrer=${encodeURIComponent(ref.toString())}`;
}
