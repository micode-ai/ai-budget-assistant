import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import { secureStorage } from '@/services/secureStorage';
import { api } from '@/services/api';
import { resolveAppLocale } from '@budget/shared-utils';

import en from './locales/en';
import ru from './locales/ru';
import ua from './locales/ua';
import pl from './locales/pl';
import es from './locales/es';
import fr from './locales/fr';
import de from './locales/de';
import be from './locales/be';
import nl from './locales/nl';
import pt from './locales/pt';
import br from './locales/br';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', flag: 'EN' },
  { code: 'ru', label: 'Русский', flag: 'RU' },
  { code: 'ua', label: 'Українська', flag: 'UA' },
  { code: 'pl', label: 'Polski', flag: 'PL' },
  { code: 'es', label: 'Español', flag: 'ES' },
  { code: 'fr', label: 'Français', flag: 'FR' },
  { code: 'de', label: 'Deutsch', flag: 'DE' },
  { code: 'be', label: 'Беларуская', flag: 'BY' },
  { code: 'nl', label: 'Nederlands', flag: 'NL' },
  { code: 'pt', label: 'Português (Portugal)', flag: 'PT' },
  { code: 'br', label: 'Português (Brasil)', flag: 'BR' },
] as const;

const intlLocaleMap: Record<string, string> = {
  en: 'en-US',
  ru: 'ru-RU',
  ua: 'uk-UA',
  pl: 'pl-PL',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  be: 'be-BY',
  nl: 'nl-NL',
  pt: 'pt-PT',
  br: 'pt-BR',
};

export function getIntlLocale(): string {
  return intlLocaleMap[i18n.language] || 'en-US';
}

const resources = {
  en: { translation: en },
  ru: { translation: ru },
  ua: { translation: ua },
  pl: { translation: pl },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
  be: { translation: be },
  nl: { translation: nl },
  pt: { translation: pt },
  br: { translation: br },
};

function getDeviceLanguage(): string {
  const first = getLocales()[0];
  // An external tag: `uk` -> `ua`, `pt-BR`/bare `pt` -> `br`, other `pt-*` -> `pt`.
  const tag = first?.languageTag || [first?.languageCode, first?.regionCode].filter(Boolean).join('-');
  return resolveAppLocale(tag, Object.keys(resources)) ?? 'en';
}

i18n.use(initReactI18next).init({
  resources,
  lng: getDeviceLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

// i18next picks plural forms with `new Intl.PluralRules(lng)`. Raw `br` is Breton to Intl
// (one/two/few/many/other — "2 weeks" would fall through to English) and bare `pt` is ICU's
// Brazilian rule (0 singular). Resolve plurals through the real Intl tags instead.
const pluralLocaleMap: Record<string, string> = { br: 'pt-BR', pt: 'pt-PT' };
const pluralResolver = i18n.services.pluralResolver as {
  getRule: (code: string, options?: object) => Intl.PluralRules | undefined;
};
const getPluralRule = pluralResolver.getRule.bind(pluralResolver);
pluralResolver.getRule = (code, options) => getPluralRule(pluralLocaleMap[code] ?? code, options);

export async function loadSavedLanguage() {
  const saved = await secureStorage.getItem('appLanguage');
  if (saved && Object.keys(resources).includes(saved)) {
    await i18n.changeLanguage(saved);
  }
}

export async function changeLanguage(lang: string) {
  await i18n.changeLanguage(lang);
  await secureStorage.setItem('appLanguage', lang);
  api.updateProfile({ language: lang }).catch(() => {/* non-critical, ignore */});
}

export default i18n;
