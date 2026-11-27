export interface SupportLanguage {
  iso: string;
  name: string;
}

/** App locale code -> ISO 639-1 code and the language name used in the translation prompt. */
const SUPPORT_LANGUAGES: Record<string, SupportLanguage> = {
  en: { iso: 'en', name: 'English' },
  de: { iso: 'de', name: 'German' },
  es: { iso: 'es', name: 'Spanish' },
  fr: { iso: 'fr', name: 'French' },
  pl: { iso: 'pl', name: 'Polish' },
  ru: { iso: 'ru', name: 'Russian' },
  ua: { iso: 'uk', name: 'Ukrainian' },
  be: { iso: 'be', name: 'Belarusian' },
  nl: { iso: 'nl', name: 'Dutch' },
  pt: { iso: 'pt', name: 'European Portuguese' },
  br: { iso: 'pt', name: 'Brazilian Portuguese' },
};

export function supportTargetLanguage(appLocale: string): SupportLanguage {
  return SUPPORT_LANGUAGES[appLocale] ?? SUPPORT_LANGUAGES.en;
}
