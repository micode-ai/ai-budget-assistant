import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import { secureStorage } from '@/services/secureStorage';

import en from './locales/en';
import ru from './locales/ru';
import ua from './locales/ua';
import pl from './locales/pl';
import es from './locales/es';
import fr from './locales/fr';
import de from './locales/de';
import be from './locales/be';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', flag: 'EN' },
  { code: 'ru', label: 'Русский', flag: 'RU' },
  { code: 'ua', label: 'Українська', flag: 'UA' },
  { code: 'pl', label: 'Polski', flag: 'PL' },
  { code: 'es', label: 'Español', flag: 'ES' },
  { code: 'fr', label: 'Français', flag: 'FR' },
  { code: 'de', label: 'Deutsch', flag: 'DE' },
  { code: 'be', label: 'Беларуская', flag: 'BY' },
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
};

function getDeviceLanguage(): string {
  const locales = getLocales();
  const deviceLang = locales[0]?.languageCode || 'en';
  // Map 'uk' (ISO 639-1 for Ukrainian) to our 'ua' code
  if (deviceLang === 'uk') return 'ua';
  if (Object.keys(resources).includes(deviceLang)) return deviceLang;
  return 'en';
}

i18n.use(initReactI18next).init({
  resources,
  lng: getDeviceLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export async function loadSavedLanguage() {
  const saved = await secureStorage.getItem('appLanguage');
  if (saved && Object.keys(resources).includes(saved)) {
    await i18n.changeLanguage(saved);
  }
}

export async function changeLanguage(lang: string) {
  await i18n.changeLanguage(lang);
  await secureStorage.setItem('appLanguage', lang);
}

export default i18n;
