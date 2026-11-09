/**
 * Copy for the activation e-mail (ABA-738): one message, three days after signup, to a user
 * who has not logged a single transaction. Nine app languages keyed by `user.language`,
 * English fallback — the same shape as `app-connected-email-i18n.ts`.
 *
 * Every string is plain text; MailService HTML-escapes it. Claims stay modest and true:
 * no "in 10 seconds", nothing the product cannot back.
 */
export interface OnboardingEmailCopy {
  subject: string;
  heading: string;
  /** `name` is the raw display name; MailService escapes the whole greeting. */
  greeting: (name: string) => string;
  intro: string;
  tips: [string, string, string];
  cta: string;
  footer: string;
  unsubscribe: string;
  /** Shown by the unsubscribe endpoint once the flag is off. */
  unsubscribedTitle: string;
  unsubscribedBody: string;
}

const translations: Record<string, OnboardingEmailCopy> = {
  en: {
    subject: 'Your first expense takes a few seconds — AI Budget',
    heading: 'Start with one expense',
    greeting: (name) => `Hi ${name},`,
    intro: "You signed up a few days ago but haven't added anything yet. The app only becomes useful once it knows where your money goes — and the first step is small:",
    tips: [
      'Snap any receipt — the app reads the shop, amount and individual items.',
      'Or type one expense by hand, or just write it in the chat, like "coffee 12".',
      'On a computer, import the last 3 months of a bank statement and get a report on where your money went.',
    ],
    cta: 'Add my first expense',
    footer: 'You are receiving this one-time e-mail because you created an AI Budget account.',
    unsubscribe: "Don't want e-mails like this? Unsubscribe",
    unsubscribedTitle: "You're unsubscribed",
    unsubscribedBody: "We won't send you onboarding e-mails anymore. Account and security e-mails are not affected.",
  },
  pl: {
    subject: 'Pierwszy wydatek w kilka sekund — AI Budget',
    heading: 'Zacznij od jednego wydatku',
    greeting: (name) => `Cześć ${name},`,
    intro: 'Założyłeś konto kilka dni temu, ale nic jeszcze nie dodałeś. Aplikacja zaczyna pomagać, gdy wie, na co idą pieniądze — a pierwszy krok jest mały:',
    tips: [
      'Zrób zdjęcie dowolnego paragonu — aplikacja odczyta sklep, kwotę i pozycje.',
      'Albo wpisz jeden wydatek ręcznie lub po prostu napisz go na czacie, np. „kawa 12”.',
      'Na komputerze wgraj wyciąg z ostatnich 3 miesięcy i zobacz raport, na co poszły pieniądze.',
    ],
    cta: 'Dodaj pierwszy wydatek',
    footer: 'Otrzymujesz tę jednorazową wiadomość, ponieważ założyłeś konto w AI Budget.',
    unsubscribe: 'Nie chcesz takich e-maili? Wypisz się',
    unsubscribedTitle: 'Wypisano Cię',
    unsubscribedBody: 'Nie będziemy już wysyłać wiadomości wprowadzających. E-maile dotyczące konta i bezpieczeństwa pozostają bez zmian.',
  },
  ru: {
    subject: 'Первый расход — за пару секунд — AI Budget',
    heading: 'Начните с одного расхода',
    greeting: (name) => `Здравствуйте, ${name}!`,
    intro: 'Вы зарегистрировались несколько дней назад, но пока ничего не добавили. Приложение начинает помогать, когда знает, куда уходят деньги, — и первый шаг совсем небольшой:',
    tips: [
      'Сфотографируйте любой чек — приложение распознает магазин, сумму и позиции.',
      'Или введите один расход вручную, или просто напишите его в чате, например «кофе 12».',
      'На компьютере загрузите банковскую выписку за 3 месяца и получите отчёт, куда ушли деньги.',
    ],
    cta: 'Добавить первый расход',
    footer: 'Вы получили это разовое письмо, потому что создали аккаунт в AI Budget.',
    unsubscribe: 'Не хотите получать такие письма? Отписаться',
    unsubscribedTitle: 'Вы отписаны',
    unsubscribedBody: 'Мы больше не будем присылать вводные письма. Письма об аккаунте и безопасности это не затрагивает.',
  },
  ua: {
    subject: 'Перша витрата — за пару секунд — AI Budget',
    heading: 'Почніть з однієї витрати',
    greeting: (name) => `Вітаємо, ${name}!`,
    intro: 'Ви зареєструвалися кілька днів тому, але ще нічого не додали. Застосунок починає допомагати, коли знає, куди йдуть гроші, — а перший крок зовсім невеликий:',
    tips: [
      'Сфотографуйте будь-який чек — застосунок розпізнає магазин, суму й позиції.',
      'Або введіть одну витрату вручну чи просто напишіть її в чаті, наприклад «кава 12».',
      'На комп’ютері завантажте банківську виписку за 3 місяці й отримайте звіт, куди пішли гроші.',
    ],
    cta: 'Додати першу витрату',
    footer: 'Ви отримали цей одноразовий лист, бо створили акаунт в AI Budget.',
    unsubscribe: 'Не хочете отримувати такі листи? Відписатися',
    unsubscribedTitle: 'Ви відписані',
    unsubscribedBody: 'Ми більше не надсилатимемо вступних листів. Листів про акаунт і безпеку це не стосується.',
  },
  be: {
    subject: 'Першы выдатак — за пару секунд — AI Budget',
    heading: 'Пачніце з аднаго выдатку',
    greeting: (name) => `Вітаем, ${name}!`,
    intro: 'Вы зарэгістраваліся некалькі дзён таму, але яшчэ нічога не дадалі. Праграма пачынае дапамагаць, калі ведае, куды ідуць грошы, — а першы крок зусім невялікі:',
    tips: [
      'Сфатаграфуйце любы чэк — праграма распазнае краму, суму і пазіцыі.',
      'Або ўвядзіце адзін выдатак уручную ці проста напішыце яго ў чаце, напрыклад «кава 12».',
      'На камп’ютары загрузіце банкаўскую выпіску за 3 месяцы і атрымайце справаздачу, куды пайшлі грошы.',
    ],
    cta: 'Дадаць першы выдатак',
    footer: 'Вы атрымалі гэты аднаразовы ліст, бо стварылі акаўнт у AI Budget.',
    unsubscribe: 'Не хочаце атрымліваць такія лісты? Адпісацца',
    unsubscribedTitle: 'Вы адпісаны',
    unsubscribedBody: 'Мы больш не будзем дасылаць уводныя лісты. Лістоў пра акаўнт і бяспеку гэта не тычыцца.',
  },
  de: {
    subject: 'Deine erste Ausgabe in wenigen Sekunden — AI Budget',
    heading: 'Fang mit einer Ausgabe an',
    greeting: (name) => `Hallo ${name},`,
    intro: 'Du hast dich vor ein paar Tagen registriert, aber noch nichts eingetragen. Die App hilft erst, wenn sie weiß, wohin dein Geld geht — und der erste Schritt ist klein:',
    tips: [
      'Fotografiere einen beliebigen Beleg – die App liest Geschäft, Betrag und Positionen aus.',
      'Oder gib eine Ausgabe von Hand ein oder schreib sie einfach in den Chat, z. B. „Kaffee 12“.',
      'Am Computer: Lade einen Kontoauszug der letzten 3 Monate hoch und sieh, wohin dein Geld ging.',
    ],
    cta: 'Erste Ausgabe eintragen',
    footer: 'Du erhältst diese einmalige E-Mail, weil du ein AI-Budget-Konto erstellt hast.',
    unsubscribe: 'Keine solchen E-Mails mehr? Abmelden',
    unsubscribedTitle: 'Du bist abgemeldet',
    unsubscribedBody: 'Wir senden dir keine Einstiegs-E-Mails mehr. E-Mails zu Konto und Sicherheit sind davon nicht betroffen.',
  },
  es: {
    subject: 'Tu primer gasto en unos segundos — AI Budget',
    heading: 'Empieza con un gasto',
    greeting: (name) => `Hola, ${name}:`,
    intro: 'Te registraste hace unos días, pero aún no has añadido nada. La app empieza a ayudarte cuando sabe a dónde va tu dinero, y el primer paso es pequeño:',
    tips: [
      'Haz una foto de cualquier recibo: la app lee la tienda, el importe y los artículos.',
      'O escribe un gasto a mano, o simplemente escríbelo en el chat, por ejemplo «café 12».',
      'En el ordenador, importa un extracto de los últimos 3 meses y obtén un informe de en qué se fue tu dinero.',
    ],
    cta: 'Añadir mi primer gasto',
    footer: 'Recibes este correo único porque creaste una cuenta en AI Budget.',
    unsubscribe: '¿No quieres correos como este? Darte de baja',
    unsubscribedTitle: 'Te has dado de baja',
    unsubscribedBody: 'Ya no te enviaremos correos de bienvenida. Los correos de cuenta y seguridad no cambian.',
  },
  fr: {
    subject: 'Votre première dépense en quelques secondes — AI Budget',
    heading: 'Commencez par une dépense',
    greeting: (name) => `Bonjour ${name},`,
    intro: "Vous vous êtes inscrit il y a quelques jours, mais vous n'avez encore rien ajouté. L'appli devient utile dès qu'elle sait où va votre argent — et la première étape est petite :",
    tips: [
      "Prenez en photo n'importe quel ticket : l'appli lit le magasin, le montant et les articles.",
      'Ou saisissez une dépense à la main, ou écrivez-la simplement dans le chat, par ex. « café 12 ».',
      "Sur ordinateur, importez un relevé des 3 derniers mois et obtenez un rapport sur l'utilisation de votre argent.",
    ],
    cta: 'Ajouter ma première dépense',
    footer: 'Vous recevez cet e-mail unique car vous avez créé un compte AI Budget.',
    unsubscribe: 'Vous ne voulez plus ce type d’e-mails ? Se désabonner',
    unsubscribedTitle: 'Vous êtes désabonné',
    unsubscribedBody: "Nous ne vous enverrons plus d'e-mails de prise en main. Les e-mails liés au compte et à la sécurité ne changent pas.",
  },
  nl: {
    subject: 'Je eerste uitgave in een paar seconden — AI Budget',
    heading: 'Begin met één uitgave',
    greeting: (name) => `Hoi ${name},`,
    intro: 'Je hebt je een paar dagen geleden aangemeld, maar nog niets toegevoegd. De app wordt pas nuttig als hij weet waar je geld heen gaat — en de eerste stap is klein:',
    tips: [
      'Maak een foto van een bon — de app leest de winkel, het bedrag en de artikelen.',
      'Of voer één uitgave met de hand in, of schrijf hem gewoon in de chat, zoals „koffie 12”.',
      'Importeer op een computer een bankafschrift van de laatste 3 maanden en zie waar je geld heen ging.',
    ],
    cta: 'Mijn eerste uitgave toevoegen',
    footer: 'Je ontvangt deze eenmalige e-mail omdat je een AI Budget-account hebt aangemaakt.',
    unsubscribe: 'Geen e-mails zoals deze meer? Afmelden',
    unsubscribedTitle: 'Je bent afgemeld',
    unsubscribedBody: 'We sturen je geen introductie-e-mails meer. E-mails over je account en beveiliging blijven gewoon komen.',
  },
};

export const ONBOARDING_EMAIL_LANGS = Object.keys(translations);

export function onboardingEmailCopy(lang: string | null | undefined): OnboardingEmailCopy {
  // `Object.hasOwn`, not `translations[lang]`: a lookup of `constructor` or `__proto__`
  // must fall back to English, not return an inherited member.
  return lang && Object.prototype.hasOwnProperty.call(translations, lang) ? translations[lang] : translations.en;
}
