/**
 * Strings + language resolution for the public shopping-list guest page
 * (`GET /sl/:token`) — shopping-list-guest-share-link.
 *
 * Deliberately its OWN small copy of the `resolveGuestLang` shape
 * (query `?lang=`, then `Accept-Language`, then English) rather than an
 * import from `receipt-split/helpers/guest-page-i18n.ts` — the two guest
 * surfaces are unrelated features, and coupling them would make an
 * unrelated payment-page change able to break the shopping-list guest page.
 * See docs/contracts/shopping-list-guest-share-link.md.
 */

type Lang = string;

export interface GuestListPageStrings {
  /** Browser tab title. */
  title: (listName: string) => string;
  heading: (listName: string) => string;
  subheading: string;
  emptyList: string;
  notFoundTitle: string;
  notFoundBody: string;
  /** Bottom-of-page acquisition card, same precedent as the receipt-split
   * guest page's own `poweredBy`/`ctaButton`/`getAndroid`. */
  poweredBy: string;
  ctaButton: string;
  getAndroid: string;
}

// Same 9 locales / same ordering convention as
// receipt-split/helpers/guest-page-i18n.ts (en, ru, ua, pl, es, fr, de, be, nl).
const translations: Record<string, GuestListPageStrings> = {
  en: {
    title: (listName) => `${listName} — Shopping list`,
    heading: (listName) => listName,
    subheading: 'Check items off as you shop',
    emptyList: 'Nothing on this list yet.',
    notFoundTitle: 'Link not available',
    notFoundBody: 'This shopping list link is no longer active.',
    poweredBy: 'Shared with AI Budget Assistant',
    ctaButton: 'Get the app',
    getAndroid: 'Get it on Google Play',
  },
  ru: {
    title: (listName) => `${listName} — Список покупок`,
    heading: (listName) => listName,
    subheading: 'Отмечайте покупки по мере похода в магазин',
    emptyList: 'Список пока пуст.',
    notFoundTitle: 'Ссылка недоступна',
    notFoundBody: 'Эта ссылка на список покупок больше не активна.',
    poweredBy: 'Отправлено через AI Budget Assistant',
    ctaButton: 'Скачать приложение',
    getAndroid: 'Доступно в Google Play',
  },
  ua: {
    title: (listName) => `${listName} — Список покупок`,
    heading: (listName) => listName,
    subheading: 'Позначайте покупки під час походу в магазин',
    emptyList: 'Список поки порожній.',
    notFoundTitle: 'Посилання недоступне',
    notFoundBody: 'Це посилання на список покупок більше не активне.',
    poweredBy: 'Надіслано через AI Budget Assistant',
    ctaButton: 'Завантажити застосунок',
    getAndroid: 'Доступно в Google Play',
  },
  pl: {
    title: (listName) => `${listName} — Lista zakupów`,
    heading: (listName) => listName,
    subheading: 'Odhaczaj produkty podczas zakupów',
    emptyList: 'Ta lista jest jeszcze pusta.',
    notFoundTitle: 'Link niedostępny',
    notFoundBody: 'Ten link do listy zakupów nie jest już aktywny.',
    poweredBy: 'Udostępniono przez AI Budget Assistant',
    ctaButton: 'Pobierz aplikację',
    getAndroid: 'Dostępne w Google Play',
  },
  es: {
    title: (listName) => `${listName} — Lista de compras`,
    heading: (listName) => listName,
    subheading: 'Marca los artículos mientras compras',
    emptyList: 'Esta lista todavía está vacía.',
    notFoundTitle: 'Enlace no disponible',
    notFoundBody: 'Este enlace de lista de compras ya no está activo.',
    poweredBy: 'Compartido con AI Budget Assistant',
    ctaButton: 'Descargar la app',
    getAndroid: 'Disponible en Google Play',
  },
  fr: {
    title: (listName) => `${listName} — Liste de courses`,
    heading: (listName) => listName,
    subheading: 'Cochez les articles au fur et à mesure',
    emptyList: 'Cette liste est encore vide.',
    notFoundTitle: 'Lien indisponible',
    notFoundBody: "Ce lien de liste de courses n'est plus actif.",
    poweredBy: 'Partagé via AI Budget Assistant',
    ctaButton: "Télécharger l'appli",
    getAndroid: 'Disponible sur Google Play',
  },
  de: {
    title: (listName) => `${listName} — Einkaufsliste`,
    heading: (listName) => listName,
    subheading: 'Hake Artikel beim Einkaufen ab',
    emptyList: 'Diese Liste ist noch leer.',
    notFoundTitle: 'Link nicht verfügbar',
    notFoundBody: 'Dieser Einkaufslisten-Link ist nicht mehr aktiv.',
    poweredBy: 'Geteilt über AI Budget Assistant',
    ctaButton: 'App herunterladen',
    getAndroid: 'Bei Google Play erhältlich',
  },
  be: {
    title: (listName) => `${listName} — Спіс пакупак`,
    heading: (listName) => listName,
    subheading: 'Адзначайце пакупкі падчас паходу ў краму',
    emptyList: 'Гэты спіс пакуль пусты.',
    notFoundTitle: 'Спасылка недаступная',
    notFoundBody: 'Гэтая спасылка на спіс пакупак больш не актыўная.',
    poweredBy: 'Адпраўлена праз AI Budget Assistant',
    ctaButton: 'Спампаваць праграму',
    getAndroid: 'Даступна ў Google Play',
  },
  nl: {
    title: (listName) => `${listName} — Boodschappenlijst`,
    heading: (listName) => listName,
    subheading: 'Vink artikelen af tijdens het winkelen',
    emptyList: 'Deze lijst is nog leeg.',
    notFoundTitle: 'Link niet beschikbaar',
    notFoundBody: 'Deze boodschappenlijst-link is niet meer actief.',
    poweredBy: 'Gedeeld via AI Budget Assistant',
    ctaButton: 'App downloaden',
    getAndroid: 'Verkrijgbaar bij Google Play',
  },
};

const SUPPORTED_LANGS = Object.keys(translations);

// Same "ua" vs ISO "uk" alias as receipt-split/helpers/guest-page-i18n.ts.
const ACCEPT_LANGUAGE_ALIASES: Record<string, string> = { uk: 'ua' };

interface GuestLangRequest {
  query?: Record<string, unknown>;
  headers?: Record<string, unknown>;
}

export function resolveGuestListLang(req: GuestLangRequest | undefined | null): Lang {
  const queryLang = req?.query?.lang;
  if (typeof queryLang === 'string') {
    const normalized = queryLang.toLowerCase();
    if (SUPPORTED_LANGS.includes(normalized)) return normalized;
  }

  const acceptLanguage = req?.headers?.['accept-language'];
  if (typeof acceptLanguage === 'string' && acceptLanguage.length > 0) {
    for (const part of acceptLanguage.split(',')) {
      const tag = part.split(';')[0].trim().toLowerCase();
      const primary = tag.split('-')[0];
      const mapped = ACCEPT_LANGUAGE_ALIASES[primary] ?? primary;
      if (SUPPORTED_LANGS.includes(mapped)) return mapped;
    }
  }

  return 'en';
}

export function getGuestListPageStrings(lang: Lang): GuestListPageStrings {
  return translations[lang] ?? translations.en;
}
