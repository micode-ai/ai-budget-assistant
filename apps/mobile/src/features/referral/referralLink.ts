/**
 * The referral share message.
 *
 * Until now `shareCode` sent a hard-coded English sentence carrying a bare
 * six-character code and no link at all, so the friend on the other end had to
 * find the app themselves and then remember to type the code into a field they
 * had never seen. That is the whole viral loop, and it did not work.
 *
 * Two things are fixed here, and both matter separately:
 *  - the message is localized (the `referral.shareText` key existed in all nine
 *    locales the entire time and was simply never used);
 *  - it carries a real link that pre-fills the code on arrival.
 *
 * The code stays VISIBLE in the text as well as embedded in the link. That
 * duplication is deliberate: a friend who installs from Play instead of opening
 * the link gets no query string on the other side (that would need the Play
 * Install Referrer API), so the printed code is their only way to claim the
 * bonus.
 */

/** The web app, which is where a link can actually pre-fill anything. */
export const REFERRAL_LINK_BASE = 'https://app.ai-budget.pl';

/** Query key the web build reads on first arrival — see `attribution.web.ts`. */
export const REFERRAL_PARAM = 'ref';

/**
 * `src`/`loc` ride along so this channel shows up in the same acquisition
 * columns as every marketing CTA (ABA-436) instead of counting as direct.
 * `src=referral` is a new source rather than a reused landing section, so it
 * cannot split the landing funnel's own `loc` vocabulary.
 */
export function buildReferralUrl(code: string): string {
  const params = new URLSearchParams({
    [REFERRAL_PARAM]: code,
    src: 'referral',
    loc: 'share',
  });
  return `${REFERRAL_LINK_BASE}/?${params.toString()}`;
}

/**
 * Link on its own line, after a blank one: every messenger linkifies a URL that
 * ends a line, and several mangle one glued to punctuation.
 */
export function buildReferralShareMessage(code: string, text: string): string {
  return `${text}\n\n${buildReferralUrl(code)}`;
}
