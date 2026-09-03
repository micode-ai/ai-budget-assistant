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
  /** Button label naming the destination METHOD (e.g. "Pay via Revolut"), not the payer —
   * the payer is already named in `paidByLine` above it on the card, so repeating it here
   * would be redundant AND (with two link-capable methods configured) produce two
   * identical-looking buttons with no way to tell which account either one pays into.
   * Takes an already-resolved display name from `methodLabel` below, never a raw
   * method key. */
  payButton: (methodLabel: string) => string;
  /** Short display name for one payment method — shown as the button label (via
   * `payButton`) for link-capable methods, and as a heading above the instructions box
   * for blik/other/cash, so multiple methods offered together read apart at a glance.
   * Brand names (Revolut/PayPal/BLIK) are identical across every language by design —
   * same precedent as the untranslated URL shapes in `buildGuestPayLink` — only 'cash'
   * and 'other' are actually translated. Called with the enum-constrained `method` key
   * from `GuestPaymentMethodBlock.method` (a Prisma `SettleMethod` column) — never
   * free text a user typed, unlike `handle`. */
  methodLabel: (method: string) => string;
  blikInstructions: (handle: string) => string;
  /** 'other' method — the handle is free-text payment details the payer typed (an
   * IBAN, a card number, a note). */
  otherInstructions: (handle: string) => string;
  /** 'cash' method — the handle describes an in-person arrangement. */
  cashInstructions: (handle: string) => string;
  /** The payer configured no payment method at all — shown instead of a pay button. */
  noPaymentInfo: string;
  iPaidButton: string;
  claimedNotice: string;
  settledNotice: string;
  notFoundTitle: string;
  notFoundBody: string;
  /** Doubles as the heading of the acquisition card at the foot of a guest page. */
  poweredBy: string;
  /** Primary CTA on that card. Points at the web app — see guest-page.ts. */
  ctaButton: string;
  getAndroid: string;
  /** Fallback when the expense has no merchant name recorded. */
  genericMerchant: string;

  // --- Group picker (ABA — QR-code bill split): GET /s/g/:groupToken and
  // GET /s/g/:groupToken/:seq. A names-only page — never renders an amount
  // or a payment status, see docs/contracts/qr-code-bill-split-api.md. ---
  /** Browser tab title + heading for the group picker page. */
  groupPickerTitle: (merchant: string) => string;
  groupPickerHint: string;
  /** "You are «Name» — is that you?" confirm step before landing on that
   * person's own (real, unchanged) guest page. */
  pickedConfirmQuestion: (name: string) => string;
  pickedConfirmYes: string;
  pickedConfirmNo: string;
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
    payButton: (methodLabel) => `Pay via ${methodLabel}`,
    methodLabel: (method) =>
      ({ revolut: 'Revolut', paypal: 'PayPal', blik: 'BLIK', cash: 'Cash', other: 'Other' } as Record<string, string>)[method] ?? method,
    blikInstructions: (handle) => `Send a BLIK payment to ${handle}`,
    otherInstructions: (handle) => `Pay directly: ${handle}`,
    cashInstructions: (handle) => `Settle in cash: ${handle}`,
    noPaymentInfo: 'No payment details have been shared yet.',
    iPaidButton: 'I already paid',
    claimedNotice: 'Marked as paid — thanks!',
    settledNotice: 'Payment confirmed. Thank you!',
    notFoundTitle: "This link isn't available",
    notFoundBody: 'It may have expired, or the details may have changed.',
    poweredBy: 'Split bills easily with AI Budget Assistant',
    ctaButton: 'Split your own bill',
    getAndroid: 'Get it on Google Play',
    genericMerchant: 'your receipt',
    groupPickerTitle: (merchant) => `Who are you? — ${merchant}`,
    groupPickerHint: 'Tap your name to see your share',
    pickedConfirmQuestion: (name) => `You are ${name} — is that you?`,
    pickedConfirmYes: "Yes, that's me",
    pickedConfirmNo: 'No, go back',
  },
  ru: {
    title: (merchant) => `Ваша часть счёта в ${merchant}`,
    greeting: (guestName) => `Привет, ${guestName}!`,
    paidByLine: (payerName) => `${payerName} оплатил(а) за всех`,
    yourItemsHeading: 'Ваши позиции',
    equalShareNote: 'Ваша равная часть счёта',
    yourShareLabel: 'Ваша часть',
    payButton: (methodLabel) => `Оплатить через ${methodLabel}`,
    methodLabel: (method) =>
      ({ revolut: 'Revolut', paypal: 'PayPal', blik: 'BLIK', cash: 'Наличные', other: 'Другое' } as Record<string, string>)[method] ?? method,
    blikInstructions: (handle) => `Отправьте платёж BLIK на ${handle}`,
    otherInstructions: (handle) => `Оплатите напрямую: ${handle}`,
    cashInstructions: (handle) => `Рассчитайтесь наличными: ${handle}`,
    noPaymentInfo: 'Платёжные данные пока не указаны.',
    iPaidButton: 'Я уже оплатил(а)',
    claimedNotice: 'Отмечено как оплачено — спасибо!',
    settledNotice: 'Оплата подтверждена. Спасибо!',
    notFoundTitle: 'Эта ссылка недоступна',
    notFoundBody: 'Возможно, срок её действия истёк или детали изменились.',
    poweredBy: 'Делите счета легко с AI Budget Assistant',
    ctaButton: 'Разделить свой счёт',
    getAndroid: 'Доступно в Google Play',
    genericMerchant: 'вашему чеку',
    groupPickerTitle: (merchant) => `Кто вы? — ${merchant}`,
    groupPickerHint: 'Нажмите на своё имя, чтобы увидеть свою часть',
    pickedConfirmQuestion: (name) => `Это вы — ${name}?`,
    pickedConfirmYes: 'Да, это я',
    pickedConfirmNo: 'Нет, назад',
  },
  ua: {
    title: (merchant) => `Ваша частка рахунку в ${merchant}`,
    greeting: (guestName) => `Привіт, ${guestName}!`,
    paidByLine: (payerName) => `${payerName} оплатив(ла) за всіх`,
    yourItemsHeading: 'Ваші позиції',
    equalShareNote: 'Ваша рівна частка рахунку',
    yourShareLabel: 'Ваша частка',
    payButton: (methodLabel) => `Оплатити через ${methodLabel}`,
    methodLabel: (method) =>
      ({ revolut: 'Revolut', paypal: 'PayPal', blik: 'BLIK', cash: 'Готівка', other: 'Інше' } as Record<string, string>)[method] ?? method,
    blikInstructions: (handle) => `Надішліть платіж BLIK на ${handle}`,
    otherInstructions: (handle) => `Оплатіть напряму: ${handle}`,
    cashInstructions: (handle) => `Розрахуйтеся готівкою: ${handle}`,
    noPaymentInfo: 'Платіжні дані ще не вказано.',
    iPaidButton: 'Я вже оплатив(ла)',
    claimedNotice: 'Позначено як оплачено — дякуємо!',
    settledNotice: 'Оплату підтверджено. Дякуємо!',
    notFoundTitle: 'Це посилання недоступне',
    notFoundBody: 'Можливо, термін його дії минув або деталі змінилися.',
    poweredBy: 'Діліть рахунки легко з AI Budget Assistant',
    ctaButton: 'Розділити свій рахунок',
    getAndroid: 'Доступно в Google Play',
    genericMerchant: 'вашому чеку',
    groupPickerTitle: (merchant) => `Хто ви? — ${merchant}`,
    groupPickerHint: 'Натисніть на своє ім’я, щоб побачити свою частку',
    pickedConfirmQuestion: (name) => `Це ви — ${name}?`,
    pickedConfirmYes: 'Так, це я',
    pickedConfirmNo: 'Ні, назад',
  },
  pl: {
    title: (merchant) => `Twoja część rachunku w ${merchant}`,
    greeting: (guestName) => `Cześć, ${guestName}!`,
    paidByLine: (payerName) => `${payerName} zapłacił(a) za wszystkich`,
    yourItemsHeading: 'Twoje pozycje',
    equalShareNote: 'Twoja równa część rachunku',
    yourShareLabel: 'Twoja część',
    payButton: (methodLabel) => `Zapłać przez ${methodLabel}`,
    methodLabel: (method) =>
      ({ revolut: 'Revolut', paypal: 'PayPal', blik: 'BLIK', cash: 'Gotówka', other: 'Inne' } as Record<string, string>)[method] ?? method,
    blikInstructions: (handle) => `Wyślij płatność BLIK na ${handle}`,
    otherInstructions: (handle) => `Zapłać bezpośrednio: ${handle}`,
    cashInstructions: (handle) => `Rozlicz się gotówką: ${handle}`,
    noPaymentInfo: 'Nie udostępniono jeszcze danych do płatności.',
    iPaidButton: 'Już zapłaciłem(am)',
    claimedNotice: 'Oznaczono jako zapłacone — dziękujemy!',
    settledNotice: 'Płatność potwierdzona. Dziękujemy!',
    notFoundTitle: 'Ten link jest niedostępny',
    notFoundBody: 'Mógł wygasnąć albo szczegóły mogły się zmienić.',
    poweredBy: 'Dziel rachunki łatwo z AI Budget Assistant',
    ctaButton: 'Podziel własny rachunek',
    getAndroid: 'Dostępne w Google Play',
    genericMerchant: 'Twojego paragonu',
    groupPickerTitle: (merchant) => `Kim jesteś? — ${merchant}`,
    groupPickerHint: 'Dotknij swojego imienia, aby zobaczyć swoją część',
    pickedConfirmQuestion: (name) => `Czy to Ty — ${name}?`,
    pickedConfirmYes: 'Tak, to ja',
    pickedConfirmNo: 'Nie, wróć',
  },
  es: {
    title: (merchant) => `Tu parte en ${merchant}`,
    greeting: (guestName) => `¡Hola ${guestName}!`,
    paidByLine: (payerName) => `${payerName} pagó por todos`,
    yourItemsHeading: 'Tus artículos',
    equalShareNote: 'Tu parte igual de la cuenta',
    yourShareLabel: 'Tu parte',
    payButton: (methodLabel) => `Pagar con ${methodLabel}`,
    methodLabel: (method) =>
      ({ revolut: 'Revolut', paypal: 'PayPal', blik: 'BLIK', cash: 'Efectivo', other: 'Otro' } as Record<string, string>)[method] ?? method,
    blikInstructions: (handle) => `Envía un pago BLIK a ${handle}`,
    otherInstructions: (handle) => `Paga directamente: ${handle}`,
    cashInstructions: (handle) => `Paga en efectivo: ${handle}`,
    noPaymentInfo: 'Aún no se compartieron datos de pago.',
    iPaidButton: 'Ya pagué',
    claimedNotice: 'Marcado como pagado — ¡gracias!',
    settledNotice: '¡Pago confirmado. Gracias!',
    notFoundTitle: 'Este enlace no está disponible',
    notFoundBody: 'Puede haber caducado o los detalles pueden haber cambiado.',
    poweredBy: 'Divide cuentas fácilmente con AI Budget Assistant',
    ctaButton: 'Divide tu propia cuenta',
    getAndroid: 'Consíguelo en Google Play',
    genericMerchant: 'tu recibo',
    groupPickerTitle: (merchant) => `¿Quién eres? — ${merchant}`,
    groupPickerHint: 'Toca tu nombre para ver tu parte',
    pickedConfirmQuestion: (name) => `¿Eres tú — ${name}?`,
    pickedConfirmYes: 'Sí, soy yo',
    pickedConfirmNo: 'No, volver',
  },
  fr: {
    title: (merchant) => `Ta part chez ${merchant}`,
    greeting: (guestName) => `Salut ${guestName} !`,
    paidByLine: (payerName) => `${payerName} a payé pour tout le monde`,
    yourItemsHeading: 'Tes articles',
    equalShareNote: "Ta part égale de l'addition",
    yourShareLabel: 'Ta part',
    payButton: (methodLabel) => `Payer via ${methodLabel}`,
    methodLabel: (method) =>
      ({ revolut: 'Revolut', paypal: 'PayPal', blik: 'BLIK', cash: 'Espèces', other: 'Autre' } as Record<string, string>)[method] ?? method,
    blikInstructions: (handle) => `Envoie un paiement BLIK à ${handle}`,
    otherInstructions: (handle) => `Paie directement : ${handle}`,
    cashInstructions: (handle) => `Règle en espèces : ${handle}`,
    noPaymentInfo: 'Aucun moyen de paiement partagé pour le moment.',
    iPaidButton: "J'ai déjà payé",
    claimedNotice: 'Marqué comme payé — merci !',
    settledNotice: 'Paiement confirmé. Merci !',
    notFoundTitle: "Ce lien n'est pas disponible",
    notFoundBody: 'Il a peut-être expiré ou les détails ont changé.',
    poweredBy: 'Partagez facilement vos additions avec AI Budget Assistant',
    ctaButton: 'Partage ta propre addition',
    getAndroid: 'Disponible sur Google Play',
    genericMerchant: 'ton ticket',
    groupPickerTitle: (merchant) => `Qui es-tu ? — ${merchant}`,
    groupPickerHint: 'Touche ton nom pour voir ta part',
    pickedConfirmQuestion: (name) => `Es-tu ${name} ?`,
    pickedConfirmYes: "Oui, c'est moi",
    pickedConfirmNo: 'Non, retour',
  },
  de: {
    title: (merchant) => `Dein Anteil bei ${merchant}`,
    greeting: (guestName) => `Hallo ${guestName}!`,
    paidByLine: (payerName) => `${payerName} hat für alle bezahlt`,
    yourItemsHeading: 'Deine Artikel',
    equalShareNote: 'Dein gleicher Anteil der Rechnung',
    yourShareLabel: 'Dein Anteil',
    payButton: (methodLabel) => `Mit ${methodLabel} bezahlen`,
    methodLabel: (method) =>
      ({ revolut: 'Revolut', paypal: 'PayPal', blik: 'BLIK', cash: 'Bargeld', other: 'Andere' } as Record<string, string>)[method] ?? method,
    blikInstructions: (handle) => `Sende eine BLIK-Zahlung an ${handle}`,
    otherInstructions: (handle) => `Zahle direkt: ${handle}`,
    cashInstructions: (handle) => `Begleiche bar: ${handle}`,
    noPaymentInfo: 'Es wurden noch keine Zahlungsdetails hinterlegt.',
    iPaidButton: 'Ich habe bereits bezahlt',
    claimedNotice: 'Als bezahlt markiert — danke!',
    settledNotice: 'Zahlung bestätigt. Danke!',
    notFoundTitle: 'Dieser Link ist nicht verfügbar',
    notFoundBody: 'Er könnte abgelaufen sein oder sich geändert haben.',
    poweredBy: 'Rechnungen einfach teilen mit AI Budget Assistant',
    ctaButton: 'Teile deine eigene Rechnung',
    getAndroid: 'Bei Google Play',
    genericMerchant: 'deinem Beleg',
    groupPickerTitle: (merchant) => `Wer bist du? — ${merchant}`,
    groupPickerHint: 'Tippe auf deinen Namen, um deinen Anteil zu sehen',
    pickedConfirmQuestion: (name) => `Bist du ${name}?`,
    pickedConfirmYes: 'Ja, das bin ich',
    pickedConfirmNo: 'Nein, zurück',
  },
  be: {
    title: (merchant) => `Ваша частка рахунку ў ${merchant}`,
    greeting: (guestName) => `Прывітанне, ${guestName}!`,
    paidByLine: (payerName) => `${payerName} заплаціў(ла) за ўсіх`,
    yourItemsHeading: 'Вашы пазіцыі',
    equalShareNote: 'Ваша роўная частка рахунку',
    yourShareLabel: 'Ваша частка',
    payButton: (methodLabel) => `Заплаціць праз ${methodLabel}`,
    methodLabel: (method) =>
      ({ revolut: 'Revolut', paypal: 'PayPal', blik: 'BLIK', cash: 'Наяўныя', other: 'Іншае' } as Record<string, string>)[method] ?? method,
    blikInstructions: (handle) => `Адпраўце плацёж BLIK на ${handle}`,
    otherInstructions: (handle) => `Заплаціце напрамую: ${handle}`,
    cashInstructions: (handle) => `Разлічыцеся наяўнымі: ${handle}`,
    noPaymentInfo: 'Плацежныя дадзеныя пакуль не паказаны.',
    iPaidButton: 'Я ўжо заплаціў(ла)',
    claimedNotice: 'Пазначана як аплачана — дзякуй!',
    settledNotice: 'Аплата пацверджана. Дзякуй!',
    notFoundTitle: 'Гэта спасылка недаступная',
    notFoundBody: 'Магчыма, тэрмін яе дзеяння скончыўся або дэталі змяніліся.',
    poweredBy: 'Дзяліце рахункі лёгка з AI Budget Assistant',
    ctaButton: 'Падзяліць свой рахунак',
    getAndroid: 'Даступна ў Google Play',
    genericMerchant: 'вашаму чэку',
    groupPickerTitle: (merchant) => `Хто вы? — ${merchant}`,
    groupPickerHint: 'Націсніце на сваё імя, каб убачыць сваю частку',
    pickedConfirmQuestion: (name) => `Гэта вы — ${name}?`,
    pickedConfirmYes: 'Так, гэта я',
    pickedConfirmNo: 'Не, назад',
  },
  nl: {
    title: (merchant) => `Jouw deel bij ${merchant}`,
    greeting: (guestName) => `Hoi ${guestName}!`,
    paidByLine: (payerName) => `${payerName} heeft voor iedereen betaald`,
    yourItemsHeading: 'Jouw items',
    equalShareNote: 'Jouw gelijke deel van de rekening',
    yourShareLabel: 'Jouw deel',
    payButton: (methodLabel) => `Betalen via ${methodLabel}`,
    methodLabel: (method) =>
      ({ revolut: 'Revolut', paypal: 'PayPal', blik: 'BLIK', cash: 'Contant', other: 'Anders' } as Record<string, string>)[method] ?? method,
    blikInstructions: (handle) => `Stuur een BLIK-betaling naar ${handle}`,
    otherInstructions: (handle) => `Betaal direct: ${handle}`,
    cashInstructions: (handle) => `Reken contant af: ${handle}`,
    noPaymentInfo: 'Er zijn nog geen betaalgegevens gedeeld.',
    iPaidButton: 'Ik heb al betaald',
    claimedNotice: 'Gemarkeerd als betaald — bedankt!',
    settledNotice: 'Betaling bevestigd. Bedankt!',
    notFoundTitle: 'Deze link is niet beschikbaar',
    notFoundBody: 'Deze kan zijn verlopen of de gegevens kunnen zijn gewijzigd.',
    poweredBy: 'Deel rekeningen eenvoudig met AI Budget Assistant',
    ctaButton: 'Verdeel je eigen rekening',
    getAndroid: 'Beschikbaar op Google Play',
    genericMerchant: 'je bonnetje',
    groupPickerTitle: (merchant) => `Wie ben jij? — ${merchant}`,
    groupPickerHint: 'Tik op jouw naam om jouw deel te zien',
    pickedConfirmQuestion: (name) => `Ben jij ${name}?`,
    pickedConfirmYes: 'Ja, dat ben ik',
    pickedConfirmNo: 'Nee, terug',
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
