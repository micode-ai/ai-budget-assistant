/**
 * Copy for the "an app was connected to your account" e-mail (Public API, spec §9), in the nine
 * app languages keyed by `user.language`, English fallback — the same `Record<lang, …>` + `t(lang)`
 * shape as `notifications/notification-i18n.ts`.
 *
 * Every param is RAW text; the caller (MailService) HTML-escapes it. `appName` is chosen by a
 * third-party developer, so it must never reach the HTML unescaped.
 */
export interface AppConnectedParams {
  appName: string;
  /** Every connected account name, quoted and joined with the language's list conjunction. */
  accounts: string;
  count: number;
  connectedByName: string;
}

interface AppConnectedCopy {
  subject: (p: AppConnectedParams) => string;
  heading: string;
  /** Opening and closing quote the caller wraps each account name in. */
  quote: [string, string];
  body: (p: AppConnectedParams) => string;
  warning: string;
  manage: string;
}

const translations: Record<string, AppConnectedCopy> = {
  en: {
    subject: ({ appName }) => `${appName} was connected to your account — AI Budget`,
    heading: 'A new app was connected',
    quote: ['“', '”'],
    body: ({ appName, accounts, count, connectedByName }) =>
      count === 1
        ? `${connectedByName} connected ${appName} to the account ${accounts}. The app can now access this account's data within the permissions that were granted.`
        : `${connectedByName} connected ${appName} to the accounts ${accounts}. The app can now access the data of these accounts within the permissions that were granted.`,
    warning: "If this wasn't you or you don't recognise this app, disconnect it now.",
    manage: 'Manage connected apps',
  },
  pl: {
    subject: ({ appName }) => `Aplikacja ${appName} została połączona z Twoim kontem — AI Budget`,
    heading: 'Połączono nową aplikację',
    quote: ['„', '”'],
    body: ({ appName, accounts, count, connectedByName }) =>
      count === 1
        ? `${connectedByName} połączył(a) aplikację ${appName} z kontem ${accounts}. Aplikacja ma teraz dostęp do danych tego konta w zakresie przyznanych uprawnień.`
        : `${connectedByName} połączył(a) aplikację ${appName} z kontami ${accounts}. Aplikacja ma teraz dostęp do danych tych kont w zakresie przyznanych uprawnień.`,
    warning: 'Jeśli to nie Ty albo nie rozpoznajesz tej aplikacji, odłącz ją teraz.',
    manage: 'Zarządzaj połączonymi aplikacjami',
  },
  ru: {
    subject: ({ appName }) => `Приложение ${appName} подключено к вашему счёту — AI Budget`,
    heading: 'Подключено новое приложение',
    quote: ['«', '»'],
    body: ({ appName, accounts, count, connectedByName }) =>
      count === 1
        ? `${connectedByName} подключил(а) приложение ${appName} к счёту ${accounts}. Теперь приложение имеет доступ к данным этого счёта в пределах выданных разрешений.`
        : `${connectedByName} подключил(а) приложение ${appName} к счетам ${accounts}. Теперь приложение имеет доступ к данным этих счетов в пределах выданных разрешений.`,
    warning: 'Если это были не вы или вы не узнаёте это приложение, отключите его сейчас.',
    manage: 'Управлять подключёнными приложениями',
  },
  ua: {
    subject: ({ appName }) => `Застосунок ${appName} підключено до вашого рахунку — AI Budget`,
    heading: 'Підключено новий застосунок',
    quote: ['«', '»'],
    body: ({ appName, accounts, count, connectedByName }) =>
      count === 1
        ? `${connectedByName} підключив(ла) застосунок ${appName} до рахунку ${accounts}. Тепер застосунок має доступ до даних цього рахунку в межах наданих дозволів.`
        : `${connectedByName} підключив(ла) застосунок ${appName} до рахунків ${accounts}. Тепер застосунок має доступ до даних цих рахунків у межах наданих дозволів.`,
    warning: 'Якщо це були не ви або ви не впізнаєте цей застосунок, відключіть його зараз.',
    manage: 'Керувати підключеними застосунками',
  },
  be: {
    subject: ({ appName }) => `Праграма ${appName} падключана да вашага рахунку — AI Budget`,
    heading: 'Падключана новая праграма',
    quote: ['«', '»'],
    body: ({ appName, accounts, count, connectedByName }) =>
      count === 1
        ? `${connectedByName} падключыў(ла) праграму ${appName} да рахунку ${accounts}. Цяпер праграма мае доступ да даных гэтага рахунку ў межах выдадзеных дазволаў.`
        : `${connectedByName} падключыў(ла) праграму ${appName} да рахункаў ${accounts}. Цяпер праграма мае доступ да даных гэтых рахункаў у межах выдадзеных дазволаў.`,
    warning: 'Калі гэта былі не вы або вы не пазнаяце гэтую праграму, адключыце яе зараз.',
    manage: 'Кіраваць падключанымі праграмамі',
  },
  de: {
    subject: ({ appName }) => `${appName} wurde mit deinem Konto verbunden — AI Budget`,
    heading: 'Eine neue App wurde verbunden',
    quote: ['„', '“'],
    body: ({ appName, accounts, count, connectedByName }) =>
      count === 1
        ? `${connectedByName} hat ${appName} mit dem Konto ${accounts} verbunden. Die App kann jetzt im Rahmen der erteilten Berechtigungen auf die Daten dieses Kontos zugreifen.`
        : `${connectedByName} hat ${appName} mit den Konten ${accounts} verbunden. Die App kann jetzt im Rahmen der erteilten Berechtigungen auf die Daten dieser Konten zugreifen.`,
    warning: 'Wenn du das nicht warst oder diese App nicht kennst, trenne sie jetzt.',
    manage: 'Verbundene Apps verwalten',
  },
  es: {
    subject: ({ appName }) => `${appName} se ha conectado a tu cuenta — AI Budget`,
    heading: 'Se ha conectado una nueva aplicación',
    quote: ['«', '»'],
    body: ({ appName, accounts, count, connectedByName }) =>
      count === 1
        ? `${connectedByName} ha conectado ${appName} a la cuenta ${accounts}. La aplicación ya puede acceder a los datos de esta cuenta dentro de los permisos concedidos.`
        : `${connectedByName} ha conectado ${appName} a las cuentas ${accounts}. La aplicación ya puede acceder a los datos de estas cuentas dentro de los permisos concedidos.`,
    warning: 'Si no has sido tú o no reconoces esta aplicación, desconéctala ahora.',
    manage: 'Gestionar aplicaciones conectadas',
  },
  fr: {
    subject: ({ appName }) => `${appName} a été connectée à votre compte — AI Budget`,
    heading: 'Une nouvelle application a été connectée',
    quote: ['«', '»'],
    body: ({ appName, accounts, count, connectedByName }) =>
      count === 1
        ? `${connectedByName} a connecté ${appName} au compte ${accounts}. L'application peut désormais accéder aux données de ce compte dans la limite des autorisations accordées.`
        : `${connectedByName} a connecté ${appName} aux comptes ${accounts}. L'application peut désormais accéder aux données de ces comptes dans la limite des autorisations accordées.`,
    warning: "Si ce n'était pas vous ou si vous ne reconnaissez pas cette application, déconnectez-la maintenant.",
    manage: 'Gérer les applications connectées',
  },
  nl: {
    subject: ({ appName }) => `${appName} is gekoppeld aan je account — AI Budget`,
    heading: 'Er is een nieuwe app gekoppeld',
    quote: ['‘', '’'],
    body: ({ appName, accounts, count, connectedByName }) =>
      count === 1
        ? `${connectedByName} heeft ${appName} gekoppeld aan het account ${accounts}. De app heeft nu toegang tot de gegevens van dit account binnen de verleende rechten.`
        : `${connectedByName} heeft ${appName} gekoppeld aan de accounts ${accounts}. De app heeft nu toegang tot de gegevens van deze accounts binnen de verleende rechten.`,
    warning: 'Was jij dit niet of herken je deze app niet? Ontkoppel hem dan nu.',
    manage: 'Gekoppelde apps beheren',
  },
};

export const APP_CONNECTED_LANGS = Object.keys(translations);

export function appConnectedCopy(lang: string | null | undefined): AppConnectedCopy {
  return (lang && Object.prototype.hasOwnProperty.call(translations, lang) && translations[lang]) || translations.en;
}
