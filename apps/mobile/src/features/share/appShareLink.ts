/**
 * Tagged links to the app, for every place the app hands a link to a person.
 *
 * A bare Play link reads `utm_source=(not set)` in Play Console, so an install that came from one
 * person passing the link to another cannot be attributed. The scheme is the same as the landing's
 * `play_url` and the API's `play-store-url.ts`: a URL-encoded `referrer` carrying
 * `src`, `loc`, `lang`, `utm_source`, `utm_medium`. The web app takes the plain `src/loc/lang` query.
 */

export const PLAY_STORE_BASE = 'https://play.google.com/store/apps/details?id=com.budget.assistant';
export const WEB_APP_BASE = 'https://app.ai-budget.pl/';

/** Lowercase a-z, 0-9, `-`, at most 20 chars. */
const TAG_RE = /^[a-z0-9-]{1,20}$/;

export interface AppShareTags {
  src: string;
  loc: string;
  lang: string;
}

export function isValidTag(value: string): boolean {
  return TAG_RE.test(value);
}

/**
 * Normalises a free value (a locale such as `pt-BR` or a UI language) into a valid tag, or
 * `'xx'` if nothing usable is left. Used for `lang` only - `src`/`loc` are fixed constants and
 * are validated strictly instead.
 */
export function toLangTag(value: string | undefined | null): string {
  const cleaned = (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 20);
  return cleaned || 'xx';
}

function assertTags(tags: AppShareTags): void {
  for (const [key, value] of Object.entries(tags)) {
    if (!isValidTag(value)) {
      throw new Error(`Invalid share tag ${key}=${JSON.stringify(value)}`);
    }
  }
}

export function buildTaggedPlayUrl(tags: AppShareTags): string {
  assertTags(tags);
  const referrer = `src=${tags.src}&loc=${tags.loc}&lang=${tags.lang}&utm_source=${tags.src}&utm_medium=${tags.loc}`;
  return `${PLAY_STORE_BASE}&referrer=${encodeURIComponent(referrer)}`;
}

export function buildTaggedWebUrl(tags: AppShareTags): string {
  assertTags(tags);
  return `${WEB_APP_BASE}?src=${tags.src}&loc=${tags.loc}&lang=${tags.lang}`;
}
