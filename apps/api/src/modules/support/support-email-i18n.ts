/**
 * Copy for the "reply from the developer" e-mail fallback (contact-developer addendum
 * 2026-11-28). Eleven app locales keyed by `user.language`, English fallback — the same
 * shape as `onboarding-email-i18n.ts`. Every string is plain text; MailService escapes it.
 */
export interface SupportEmailCopy {
  subject: string;
  heading: string;
  /** `name` is the raw display name; MailService escapes the whole greeting. */
  greeting: (name: string) => string;
  intro: string;
  /** Label above the developer's original wording when a translation is shown first. */
  original: string;
  cta: string;
  footer: string;
  unsubscribe: string;
  /** Shown by the unsubscribe endpoint once the flag is off. */
  unsubscribedTitle: string;
  unsubscribedBody: string;
}

const translations: Record<string, SupportEmailCopy> = {
  en: {
    subject: 'Reply from the developer',
    heading: 'The developer replied to you',
    greeting: (name) => `Hi ${name},`,
    intro: 'Here is what you have not read yet:',
    original: 'Original',
    cta: 'Open the conversation',
    footer: 'You are receiving this e-mail because you wrote to the developer in AI Budget.',
    unsubscribe: 'Do not want e-mails about replies? Unsubscribe',
    unsubscribedTitle: 'You are unsubscribed',
    unsubscribedBody: 'We will no longer e-mail you about replies. You will still see them in the app. E-mails about your account and security continue as usual.',
  },
  de: {
    subject: 'Antwort vom Entwickler',
    heading: 'Der Entwickler hat Ihnen geantwortet',
    greeting: (name) => `Hallo ${name},`,
    intro: 'Das haben Sie noch nicht gelesen:',
    original: 'Original',
    cta: 'Unterhaltung öffnen',
    footer: 'Sie erhalten diese E-Mail, weil Sie dem Entwickler in AI Budget geschrieben haben.',
    unsubscribe: 'Keine E-Mails zu Antworten mehr? Abmelden',
    unsubscribedTitle: 'Sie sind abgemeldet',
    unsubscribedBody: 'Wir senden Ihnen keine E-Mails mehr zu Antworten. In der App sehen Sie sie weiterhin. E-Mails zu Konto und Sicherheit bleiben unverändert.',
  },
  es: {
    subject: 'Respuesta del desarrollador',
    heading: 'El desarrollador te ha respondido',
    greeting: (name) => `Hola ${name}:`,
    intro: 'Esto es lo que aún no has leído:',
    original: 'Original',
    cta: 'Abrir la conversación',
    footer: 'Recibes este correo porque escribiste al desarrollador en AI Budget.',
    unsubscribe: '¿No quieres correos sobre respuestas? Darte de baja',
    unsubscribedTitle: 'Te has dado de baja',
    unsubscribedBody: 'Ya no te enviaremos correos sobre respuestas. Las seguirás viendo en la aplicación. Los correos sobre la cuenta y la seguridad continúan con normalidad.',
  },
  fr: {
    subject: 'Réponse du développeur',
    heading: 'Le développeur vous a répondu',
    greeting: (name) => `Bonjour ${name},`,
    intro: 'Voici ce que vous n’avez pas encore lu :',
    original: 'Original',
    cta: 'Ouvrir la conversation',
    footer: 'Vous recevez cet e-mail parce que vous avez écrit au développeur dans AI Budget.',
    unsubscribe: 'Vous ne voulez plus d’e-mails sur les réponses ? Se désabonner',
    unsubscribedTitle: 'Vous êtes désabonné',
    unsubscribedBody: 'Nous ne vous enverrons plus d’e-mails sur les réponses. Vous les verrez toujours dans l’application. Les e-mails sur le compte et la sécurité continuent normalement.',
  },
  pl: {
    subject: 'Odpowiedź od dewelopera',
    heading: 'Deweloper odpowiedział na Twoją wiadomość',
    greeting: (name) => `Cześć ${name},`,
    intro: 'Oto, czego jeszcze nie przeczytałeś(-aś):',
    original: 'Oryginał',
    cta: 'Otwórz rozmowę',
    footer: 'Dostajesz tę wiadomość, ponieważ kontaktowałeś(-aś) się z deweloperem w AI Budget.',
    unsubscribe: 'Nie chcesz e-maili o odpowiedziach? Wypisz się',
    unsubscribedTitle: 'Wypisano z listy',
    unsubscribedBody: 'Nie będziemy już wysyłać e-maili o odpowiedziach. Nadal zobaczysz je w aplikacji. E-maile o koncie i bezpieczeństwie przychodzą jak dotąd.',
  },
  ru: {
    subject: 'Ответ от разработчика',
    heading: 'Разработчик ответил вам',
    greeting: (name) => `Здравствуйте, ${name}!`,
    intro: 'Вот что вы ещё не прочитали:',
    original: 'Оригинал',
    cta: 'Открыть переписку',
    footer: 'Вы получили это письмо, потому что написали разработчику в AI Budget.',
    unsubscribe: 'Не хотите письма об ответах? Отписаться',
    unsubscribedTitle: 'Вы отписаны',
    unsubscribedBody: 'Мы больше не будем присылать письма об ответах. В приложении вы их по-прежнему увидите. Письма об аккаунте и безопасности это не затрагивает.',
  },
  ua: {
    subject: 'Відповідь від розробника',
    heading: 'Розробник відповів вам',
    greeting: (name) => `Вітаємо, ${name}!`,
    intro: 'Ось що ви ще не прочитали:',
    original: 'Оригінал',
    cta: 'Відкрити листування',
    footer: 'Ви отримали цей лист, бо написали розробнику в AI Budget.',
    unsubscribe: 'Не хочете листів про відповіді? Відписатися',
    unsubscribedTitle: 'Ви відписані',
    unsubscribedBody: 'Ми більше не надсилатимемо листи про відповіді. У застосунку ви їх, як і раніше, побачите. Листи про акаунт і безпеку це не стосується.',
  },
  be: {
    subject: 'Адказ ад распрацоўшчыка',
    heading: 'Распрацоўшчык адказаў вам',
    greeting: (name) => `Вітаем, ${name}!`,
    intro: 'Вось што вы яшчэ не прачыталі:',
    original: 'Арыгінал',
    cta: 'Адкрыць перапіску',
    footer: 'Вы атрымалі гэты ліст, бо напісалі распрацоўшчыку ў AI Budget.',
    unsubscribe: 'Не хочаце лістоў пра адказы? Адпісацца',
    unsubscribedTitle: 'Вы адпісаны',
    unsubscribedBody: 'Мы больш не будзем дасылаць лісты пра адказы. У дадатку вы іх па-ранейшаму ўбачыце. Лісты пра ўліковы запіс і бяспеку гэта не кранае.',
  },
  nl: {
    subject: 'Antwoord van de ontwikkelaar',
    heading: 'De ontwikkelaar heeft je geantwoord',
    greeting: (name) => `Hallo ${name},`,
    intro: 'Dit heb je nog niet gelezen:',
    original: 'Origineel',
    cta: 'Gesprek openen',
    footer: 'Je ontvangt deze e-mail omdat je de ontwikkelaar hebt geschreven in AI Budget.',
    unsubscribe: 'Geen e-mails over antwoorden meer? Uitschrijven',
    unsubscribedTitle: 'Je bent uitgeschreven',
    unsubscribedBody: 'We sturen je geen e-mails meer over antwoorden. Je ziet ze nog steeds in de app. E-mails over je account en beveiliging gaan gewoon door.',
  },
  pt: {
    subject: 'Resposta do programador',
    heading: 'O programador respondeu-lhe',
    greeting: (name) => `Olá ${name},`,
    intro: 'Isto ainda não leu:',
    original: 'Original',
    cta: 'Abrir a conversa',
    footer: 'Está a receber este e-mail porque escreveu ao programador no AI Budget.',
    unsubscribe: 'Não quer e-mails sobre respostas? Cancelar a subscrição',
    unsubscribedTitle: 'Subscrição cancelada',
    unsubscribedBody: 'Deixaremos de lhe enviar e-mails sobre respostas. Continuará a vê-las na aplicação. Os e-mails sobre a conta e a segurança continuam normalmente.',
  },
  br: {
    subject: 'Resposta do desenvolvedor',
    heading: 'O desenvolvedor respondeu você',
    greeting: (name) => `Olá, ${name}!`,
    intro: 'Isto você ainda não leu:',
    original: 'Original',
    cta: 'Abrir a conversa',
    footer: 'Você está recebendo este e-mail porque escreveu para o desenvolvedor no AI Budget.',
    unsubscribe: 'Não quer e-mails sobre respostas? Cancelar a inscrição',
    unsubscribedTitle: 'Inscrição cancelada',
    unsubscribedBody: 'Não vamos mais enviar e-mails sobre respostas. Você continua vendo as respostas no app. Os e-mails sobre a conta e a segurança continuam normalmente.',
  },
};

export const SUPPORT_EMAIL_LANGS = Object.keys(translations);

export function supportEmailCopy(lang: string | null | undefined): SupportEmailCopy {
  // hasOwnProperty, not `translations[lang]`: `constructor` / `__proto__` must fall back to English.
  return lang && Object.prototype.hasOwnProperty.call(translations, lang) ? translations[lang] : translations.en;
}
