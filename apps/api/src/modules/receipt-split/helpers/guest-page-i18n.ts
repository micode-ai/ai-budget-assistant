/**
 * Strings + language resolution for the public guest split page (`GET /s/:token`).
 * Structured like `modules/notifications/notification-i18n.ts` — a `Record<Lang, {...}>`
 * translations table with a `t(lang)`-style fallback to English — but exposed through a
 * single `getGuestPageStrings(lang)` accessor (one object of pre-bound strings/functions)
 * rather than one exported function per string, since this page owns far fewer strings
 * than the notification catalogue.
 *
 * Tone rule (binding): nothing here may accuse anyone or imply the guest is late or
 * delinquent. This is a neutral "here is your share" page, not a collections notice.
 */

type Lang = string;

export interface GuestPageStrings {
  /** Browser tab title. */
  title: (merchant: string) => string;
  /** Personalized header — the guest's own name (attacker-influenced free text from the
   * payer's split form; MUST be escaped by the caller before interpolating anywhere). */
  greeting: (guestName: string) => string;
  /** "«Payer» paid for everyone". */
  paidByLine: (payerName: string) => string;
  yourItemsHeading: string;
  /** Shown instead of an item list when the split has no assigned line items (equal mode). */
  equalShareNote: string;
  yourShareLabel: string;
  payButton: (payerName: string) => string;
  blikInstructions: (handle: string) => string;
  /** The payer configured no payment method at all — shown instead of a pay button. */
  noPaymentInfo: string;
  iPaidButton: string;
  claimedNotice: string;
  settledNotice: string;
  notFoundTitle: string;
  notFoundBody: string;
  poweredBy: string;
  getAndroid: string;
  getIos: string;
  /** Fallback when the expense has no merchant name recorded. */
  genericMerchant: string;
}

// Same 9 locales the mobile app supports (src/i18n/locales/*.ts). Order mirrors
// notification-i18n.ts (en, ru, ua, pl, es, fr, de, be, nl).
const translations: Record<string, GuestPageStrings> = {
  en: {
    title: (merchant) => `Your share at ${merchant}`,
    greeting: (guestName) => `Hi ${guestName}!`,
    paidByLine: (payerName) => `${payerName} paid for everyone`,
    yourItemsHeading: 'Your items',
    equalShareNote: 'Your equal share of the bill',
    yourShareLabel: 'Your share',
    payButton: (payerName) => `Pay ${payerName}`,
    blikInstructions: (handle) => `Send a BLIK payment to ${handle}`,
    noPaymentInfo: 'No payment details have been shared yet.',
    iPaidButton: 'I already paid',
    claimedNotice: 'Marked as paid — thanks!',
    settledNotice: 'Payment confirmed. Thank you!',
    notFoundTitle: "This link isn't available",
    notFoundBody: 'It may have expired, or the details may have changed.',
    poweredBy: 'Split bills easily with AI Budget Assistant',
    getAndroid: 'Get it on Google Play',
    getIos: 'Download on the App Store',
    genericMerchant: 'your receipt',
  },
  ru: {
    title: (merchant) => `Ваша часть счёта в ${merchant}`,
    greeting: (guestName) => `Привет, ${guestName}!`,
    paidByLine: (payerName) => `${payerName} оплатил(а) за всех`,
    yourItemsHeading: 'Ваши позиции',
    equalShareNote: 'Ваша равная часть счёта',
    yourShareLabel: 'Ваша часть',
    payButton: (payerName) => `Оплатить ${payerName}`,
    blikInstructions: (handle) => `Отправьте платёж BLIK на ${handle}`,
    noPaymentInfo: 'Платёжные данные пока не указаны.',
    iPaidButton: 'Я уже оплатил(а)',
    claimedNotice: 'Отмечено как оплачено — спасибо!',
    settledNotice: 'Оплата подтверждена. Спасибо!',
    notFoundTitle: 'Эта ссылка недоступна',
    notFoundBody: 'Возможно, срок её действия истёк или детали изменились.',
    poweredBy: 'Делите счета легко с AI Budget Assistant',
    getAndroid: 'Доступно в Google Play',
    getIos: 'Загрузить в App Store',
    genericMerchant: 'вашему чеку',
  },
  ua: {
    title: (merchant) => `Ваша частка рахунку в ${merchant}`,
    greeting: (guestName) => `Привіт, ${guestName}!`,
    paidByLine: (payerName) => `${payerName} оплатив(ла) за всіх`,
    yourItemsHeading: 'Ваші позиції',
    equalShareNote: 'Ваша рівна частка рахунку',
    yourShareLabel: 'Ваша частка',
    payButton: (payerName) => `Оплатити ${payerName}`,
    blikInstructions: (handle) => `Надішліть платіж BLIK на ${handle}`,
    noPaymentInfo: 'Платіжні дані ще не вказано.',
    iPaidButton: 'Я вже оплатив(ла)',
    claimedNotice: 'Позначено як оплачено — дякуємо!',
    settledNotice: 'Оплату підтверджено. Дякуємо!',
    notFoundTitle: 'Це посилання недоступне',
    notFoundBody: 'Можливо, термін його дії минув або деталі змінилися.',
    poweredBy: 'Діліть рахунки легко з AI Budget Assistant',
    getAndroid: 'Доступно в Google Play',
    getIos: 'Завантажити в App Store',
    genericMerchant: 'вашому чеку',
  },
  pl: {
    title: (merchant) => `Twoja część rachunku w ${merchant}`,
    greeting: (guestName) => `Cześć, ${guestName}!`,
    paidByLine: (payerName) => `${payerName} zapłacił(a) za wszystkich`,
    yourItemsHeading: 'Twoje pozycje',
    equalShareNote: 'Twoja równa część rachunku',
    yourShareLabel: 'Twoja część',
    payButton: (payerName) => `Zapłać ${payerName}`,
    blikInstructions: (handle) => `Wyślij płatność BLIK na ${handle}`,
    noPaymentInfo: 'Nie udostępniono jeszcze danych do płatności.',
    iPaidButton: 'Już zapłaciłem(am)',
    claimedNotice: 'Oznaczono jako zapłacone — dziękujemy!',
    settledNotice: 'Płatność potwierdzona. Dziękujemy!',
    notFoundTitle: 'Ten link jest niedostępny',
    notFoundBody: 'Mógł wygasnąć albo szczegóły mogły się zmienić.',
    poweredBy: 'Dziel rachunki łatwo z AI Budget Assistant',
    getAndroid: 'Dostępne w Google Play',
    getIos: 'Pobierz z App Store',
    genericMerchant: 'Twojego paragonu',
  },
  es: {
    title: (merchant) => `Tu parte en ${merchant}`,
    greeting: (guestName) => `¡Hola ${guestName}!`,
    paidByLine: (payerName) => `${payerName} pagó por todos`,
    yourItemsHeading: 'Tus artículos',
    equalShareNote: 'Tu parte igual de la cuenta',
    yourShareLabel: 'Tu parte',
    payButton: (payerName) => `Pagar a ${payerName}`,
    blikInstructions: (handle) => `Envía un pago BLIK a ${handle}`,
    noPaymentInfo: 'Aún no se compartieron datos de pago.',
    iPaidButton: 'Ya pagué',
    claimedNotice: 'Marcado como pagado — ¡gracias!',
    settledNotice: '¡Pago confirmado. Gracias!',
    notFoundTitle: 'Este enlace no está disponible',
    notFoundBody: 'Puede haber caducado o los detalles pueden haber cambiado.',
    poweredBy: 'Divide cuentas fácilmente con AI Budget Assistant',
    getAndroid: 'Consíguelo en Google Play',
    getIos: 'Descargar en App Store',
    genericMerchant: 'tu recibo',
  },
  fr: {
    title: (merchant) => `Ta part chez ${merchant}`,
    greeting: (guestName) => `Salut ${guestName} !`,
    paidByLine: (payerName) => `${payerName} a payé pour tout le monde`,
    yourItemsHeading: 'Tes articles',
    equalShareNote: "Ta part égale de l'addition",
    yourShareLabel: 'Ta part',
    payButton: (payerName) => `Payer ${payerName}`,
    blikInstructions: (handle) => `Envoie un paiement BLIK à ${handle}`,
    noPaymentInfo: 'Aucun moyen de paiement partagé pour le moment.',
    iPaidButton: "J'ai déjà payé",
    claimedNotice: 'Marqué comme payé — merci !',
    settledNotice: 'Paiement confirmé. Merci !',
    notFoundTitle: "Ce lien n'est pas disponible",
    notFoundBody: 'Il a peut-être expiré ou les détails ont changé.',
    poweredBy: 'Partagez facilement vos additions avec AI Budget Assistant',
    getAndroid: 'Disponible sur Google Play',
    getIos: "Télécharger sur l'App Store",
    genericMerchant: 'ton ticket',
  },
  de: {
    title: (merchant) => `Dein Anteil bei ${merchant}`,
    greeting: (guestName) => `Hallo ${guestName}!`,
    paidByLine: (payerName) => `${payerName} hat für alle bezahlt`,
    yourItemsHeading: 'Deine Artikel',
    equalShareNote: 'Dein gleicher Anteil der Rechnung',
    yourShareLabel: 'Dein Anteil',
    payButton: (payerName) => `${payerName} bezahlen`,
    blikInstructions: (handle) => `Sende eine BLIK-Zahlung an ${handle}`,
    noPaymentInfo: 'Es wurden noch keine Zahlungsdetails hinterlegt.',
    iPaidButton: 'Ich habe bereits bezahlt',
    claimedNotice: 'Als bezahlt markiert — danke!',
    settledNotice: 'Zahlung bestätigt. Danke!',
    notFoundTitle: 'Dieser Link ist nicht verfügbar',
    notFoundBody: 'Er könnte abgelaufen sein oder sich geändert haben.',
    poweredBy: 'Rechnungen einfach teilen mit AI Budget Assistant',
    getAndroid: 'Bei Google Play',
    getIos: 'Im App Store laden',
    genericMerchant: 'deinem Beleg',
  },
  be: {
    title: (merchant) => `Ваша частка рахунку ў ${merchant}`,
    greeting: (guestName) => `Прывітанне, ${guestName}!`,
    paidByLine: (payerName) => `${payerName} заплаціў(ла) за ўсіх`,
    yourItemsHeading: 'Вашы пазіцыі',
    equalShareNote: 'Ваша роўная частка рахунку',
    yourShareLabel: 'Ваша частка',
    payButton: (payerName) => `Заплаціць ${payerName}`,
    blikInstructions: (handle) => `Адпраўце плацёж BLIK на ${handle}`,
    noPaymentInfo: 'Плацежныя дадзеныя пакуль не паказаны.',
    iPaidButton: 'Я ўжо заплаціў(ла)',
    claimedNotice: 'Пазначана як аплачана — дзякуй!',
    settledNotice: 'Аплата пацверджана. Дзякуй!',
    notFoundTitle: 'Гэта спасылка недаступная',
    notFoundBody: 'Магчыма, тэрмін яе дзеяння скончыўся або дэталі змяніліся.',
    poweredBy: 'Дзяліце рахункі лёгка з AI Budget Assistant',
    getAndroid: 'Даступна ў Google Play',
    getIos: 'Спампаваць у App Store',
    genericMerchant: 'вашаму чэку',
  },
  nl: {
    title: (merchant) => `Jouw deel bij ${merchant}`,
    greeting: (guestName) => `Hoi ${guestName}!`,
    paidByLine: (payerName) => `${payerName} heeft voor iedereen betaald`,
    yourItemsHeading: 'Jouw items',
    equalShareNote: 'Jouw gelijke deel van de rekening',
    yourShareLabel: 'Jouw deel',
    payButton: (payerName) => `${payerName} betalen`,
    blikInstructions: (handle) => `Stuur een BLIK-betaling naar ${handle}`,
    noPaymentInfo: 'Er zijn nog geen betaalgegevens gedeeld.',
    iPaidButton: 'Ik heb al betaald',
    claimedNotice: 'Gemarkeerd als betaald — bedankt!',
    settledNotice: 'Betaling bevestigd. Bedankt!',
    notFoundTitle: 'Deze link is niet beschikbaar',
    notFoundBody: 'Deze kan zijn verlopen of de gegevens kunnen zijn gewijzigd.',
    poweredBy: 'Deel rekeningen eenvoudig met AI Budget Assistant',
    getAndroid: 'Beschikbaar op Google Play',
    getIos: 'Download in de App Store',
    genericMerchant: 'je bonnetje',
  },
};

export function getGuestPageStrings(lang: Lang): GuestPageStrings {
  return translations[lang] || translations.en;
}

const SUPPORTED_LANGS = Object.keys(translations);

// Real browsers send valid BCP-47 tags in Accept-Language. This app's internal locale
// key for Ukrainian is "ua" (matching src/i18n/locales/ua.ts and every other lang-keyed
// table in this codebase, e.g. notification-i18n.ts) — but the correct ISO 639-1 tag for
// Ukrainian is "uk", not "ua" (which is actually Ukraine's ISO 3166-1 country code). Alias
// it here so a browser's real "uk" header resolves to this app's "ua" strings.
const ACCEPT_LANGUAGE_ALIASES: Record<string, string> = { uk: 'ua' };

interface GuestLangRequest {
  query?: Record<string, unknown>;
  headers?: Record<string, unknown>;
}

/**
 * Resolution order (binding, per the task brief): `?lang=` from the shared link first
 * (the payer shares in their own language), then `Accept-Language`, then English.
 */
export function resolveGuestLang(req: GuestLangRequest | undefined | null): Lang {
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
