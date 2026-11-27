/**
 * The page's `<html lang>` on web, kept equal to the UI language.
 *
 * The served `index.html` always says `lang="en"`. A page declared English that
 * renders Polish or Russian invites the browser's page translator (Chrome
 * Translate) to rewrite it, and the translator replaces React-owned text nodes
 * with its own `<font>` wrappers — React's next commit then fails with
 * "Failed to execute 'removeChild' on 'Node'" (React issue #11538). Declaring the
 * real language removes the "this page is in a foreign language" trigger.
 *
 * Tags are BCP-47 language tags for the app's internal codes. They agree with the
 * language part of `intlLocaleMap` in `./index.ts`; only Portuguese keeps its
 * region, because the region is what separates `pt` from `br`. Never emit raw
 * `br` (Breton) or `ua` (not a language tag).
 */
const DOCUMENT_LANG: Record<string, string> = {
  en: 'en',
  ru: 'ru',
  ua: 'uk',
  pl: 'pl',
  es: 'es',
  fr: 'fr',
  de: 'de',
  be: 'be',
  nl: 'nl',
  pt: 'pt-PT',
  br: 'pt-BR',
};

/** The BCP-47 tag for an internal app language code, or `undefined` when it is not one. */
export function appLanguageTag(appLanguage: string | null | undefined): string | undefined {
  return appLanguage && Object.prototype.hasOwnProperty.call(DOCUMENT_LANG, appLanguage)
    ? DOCUMENT_LANG[appLanguage]
    : undefined;
}

/** The `<html lang>` value for an internal app language code; unknown → `en`. */
export function documentLangTag(appLanguage: string | null | undefined): string {
  return appLanguageTag(appLanguage) ?? 'en';
}

/** Writes `<html lang>`. A no-op wherever there is no `document` (native, tests). */
export function applyDocumentLang(appLanguage: string | null | undefined): void {
  if (typeof document === 'undefined' || !document.documentElement) return;
  const tag = documentLangTag(appLanguage);
  if (document.documentElement.lang !== tag) document.documentElement.lang = tag;
}
