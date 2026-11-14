/**
 * APP LOCALE RESOLVER - canonical copy. Its twin is
 * packages/shared-utils/src/formatting/app-locale.ts; the two bodies
 * (everything after this header) must stay identical. The API cannot import a
 * runtime value from @budget/shared-utils (no build step for workspace packages).
 */
const INTL_LOCALES: Record<string, string> = {
  en: 'en-US',
  de: 'de-DE',
  es: 'es-ES',
  fr: 'fr-FR',
  pl: 'pl-PL',
  ru: 'ru-RU',
  ua: 'uk-UA',
  be: 'be-BY',
  nl: 'nl-NL',
  pt: 'pt-PT',
  br: 'pt-BR',
};

/**
 * Map one external language tag (pt-BR, pt_br, uk, nl-BE ...) to an app locale
 * code, or null when nothing in `supported` matches. Case-insensitive; `_` and
 * `-` both separate subtags. pt-BR and bare pt are Brazilian (`br`), any other
 * pt-* is European (`pt`), uk is `ua`. Takes one tag, not an Accept-Language header.
 */
export function resolveAppLocale(
  tag: string | null | undefined,
  supported: readonly string[],
): string | null {
  if (!tag) return null;
  const parts = tag.trim().toLowerCase().replace(/_/g, '-').split('-');
  const base = parts[0];
  if (!base) return null;
  let candidate = base;
  if (base === 'pt') candidate = parts.length === 1 || parts[1] === 'br' ? 'br' : 'pt';
  else if (base === 'uk') candidate = 'ua';
  return supported.includes(candidate) ? candidate : null;
}

/** First supported hit walking an Accept-Language header left to right. */
export function resolveAcceptLanguage(
  header: string | undefined,
  supported: readonly string[],
): string | null {
  if (!header) return null;
  for (const item of header.split(',')) {
    const hit = resolveAppLocale(item.split(';')[0], supported);
    if (hit) return hit;
  }
  return null;
}

/** BCP-47 tag safe for Intl.* - never pass `br` raw (Intl reads it as Breton). */
export function toIntlLocale(code: string): string {
  return INTL_LOCALES[code] ?? 'en-US';
}
