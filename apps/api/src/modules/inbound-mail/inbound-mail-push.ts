type Lang = string;

interface Copy {
  receiptsTitle: (n: number) => string;
  receiptsBody: () => string;
  verificationTitle: () => string;
  verificationBody: () => string;
  quotaTitle: () => string;
  quotaBody: () => string;
}

const copy: Record<string, Copy> = {
  en: {
    receiptsTitle: (n) => (n === 1 ? '1 new e-receipt to confirm' : `${n} new e-receipts to confirm`),
    receiptsBody: () => 'Forwarded by e-mail. Nothing is saved until you confirm it.',
    verificationTitle: () => 'Gmail forwarding confirmation received',
    verificationBody: () => 'Open the app to see your code and finish setting up forwarding.',
    quotaTitle: () => 'An e-receipt is waiting',
    quotaBody: () => 'Your AI quota is used up, so it was not read. Retry it after the quota resets or upgrade.',
  },
  de: {
    receiptsTitle: (n) => (n === 1 ? '1 neuer E-Beleg zur Bestätigung' : `${n} neue E-Belege zur Bestätigung`),
    receiptsBody: () => 'Per E-Mail weitergeleitet. Nichts wird gespeichert, bevor du bestätigst.',
    verificationTitle: () => 'Gmail-Weiterleitungsbestätigung erhalten',
    verificationBody: () => 'Öffne die App, um deinen Code zu sehen und die Weiterleitung einzurichten.',
    quotaTitle: () => 'Ein E-Beleg wartet',
    quotaBody: () => 'Dein KI-Kontingent ist aufgebraucht, daher wurde er nicht gelesen. Wiederhole es nach dem Zurücksetzen.',
  },
  es: {
    receiptsTitle: (n) => (n === 1 ? '1 recibo electrónico por confirmar' : `${n} recibos electrónicos por confirmar`),
    receiptsBody: () => 'Reenviado por correo. No se guarda nada hasta que lo confirmes.',
    verificationTitle: () => 'Confirmación de reenvío de Gmail recibida',
    verificationBody: () => 'Abre la app para ver tu código y terminar de configurar el reenvío.',
    quotaTitle: () => 'Hay un recibo electrónico esperando',
    quotaBody: () => 'Se agotó tu cuota de IA, por lo que no se leyó. Reinténtalo cuando se restablezca.',
  },
  fr: {
    receiptsTitle: (n) => (n === 1 ? '1 e-ticket à confirmer' : `${n} e-tickets à confirmer`),
    receiptsBody: () => 'Transféré par e-mail. Rien n’est enregistré avant votre confirmation.',
    verificationTitle: () => 'Confirmation de transfert Gmail reçue',
    verificationBody: () => 'Ouvrez l’app pour voir votre code et terminer la configuration du transfert.',
    quotaTitle: () => 'Un e-ticket est en attente',
    quotaBody: () => 'Votre quota IA est épuisé, il n’a donc pas été lu. Réessayez après la réinitialisation.',
  },
  pl: {
    receiptsTitle: (n) => (n === 1 ? '1 nowy e-paragon do potwierdzenia' : `${n} nowe e-paragony do potwierdzenia`),
    receiptsBody: () => 'Przekazane e-mailem. Nic nie zostanie zapisane, dopóki nie potwierdzisz.',
    verificationTitle: () => 'Otrzymano potwierdzenie przekazywania Gmail',
    verificationBody: () => 'Otwórz aplikację, aby zobaczyć kod i dokończyć konfigurację przekazywania.',
    quotaTitle: () => 'E-paragon czeka',
    quotaBody: () => 'Limit AI został wyczerpany, więc paragon nie został odczytany. Spróbuj ponownie po odnowieniu limitu.',
  },
  ru: {
    receiptsTitle: (n) => (n === 1 ? '1 новый электронный чек для подтверждения' : `Новых электронных чеков: ${n}`),
    receiptsBody: () => 'Пересланы по почте. Ничего не сохранится, пока вы не подтвердите.',
    verificationTitle: () => 'Получено подтверждение пересылки Gmail',
    verificationBody: () => 'Откройте приложение, чтобы увидеть код и завершить настройку пересылки.',
    quotaTitle: () => 'Электронный чек ждёт',
    quotaBody: () => 'Лимит ИИ исчерпан, поэтому чек не прочитан. Повторите после обновления лимита.',
  },
  ua: {
    receiptsTitle: (n) => (n === 1 ? '1 новий електронний чек для підтвердження' : `Нових електронних чеків: ${n}`),
    receiptsBody: () => 'Переслано поштою. Нічого не збережеться, доки ви не підтвердите.',
    verificationTitle: () => 'Отримано підтвердження пересилання Gmail',
    verificationBody: () => 'Відкрийте застосунок, щоб побачити код і завершити налаштування пересилання.',
    quotaTitle: () => 'Електронний чек чекає',
    quotaBody: () => 'Ліміт ШІ вичерпано, тому чек не прочитано. Повторіть після оновлення ліміту.',
  },
  be: {
    receiptsTitle: (n) => (n === 1 ? '1 новы электронны чэк для пацвярджэння' : `Новых электронных чэкаў: ${n}`),
    receiptsBody: () => 'Пераслана поштай. Нічога не захаваецца, пакуль вы не пацвердзіце.',
    verificationTitle: () => 'Атрымана пацвярджэнне перасылкі Gmail',
    verificationBody: () => 'Адкрыйце праграму, каб убачыць код і завяршыць налады перасылкі.',
    quotaTitle: () => 'Электронны чэк чакае',
    quotaBody: () => 'Ліміт ШІ вычарпаны, таму чэк не прачытаны. Паспрабуйце зноў пасля абнаўлення ліміту.',
  },
  nl: {
    receiptsTitle: (n) => (n === 1 ? '1 nieuwe e-bon om te bevestigen' : `${n} nieuwe e-bonnen om te bevestigen`),
    receiptsBody: () => 'Doorgestuurd per e-mail. Er wordt niets opgeslagen tot je bevestigt.',
    verificationTitle: () => 'Gmail-doorstuurbevestiging ontvangen',
    verificationBody: () => 'Open de app om je code te zien en het doorsturen af te ronden.',
    quotaTitle: () => 'Er wacht een e-bon',
    quotaBody: () => 'Je AI-limiet is op, dus de bon is niet gelezen. Probeer opnieuw na het resetten van de limiet.',
  },
};

export const INBOUND_PUSH_LANGUAGES = Object.keys(copy);

function pick(lang: Lang): Copy {
  return copy[lang] ?? copy.en;
}

/** The verification push is deliberately generic: the code is shown in-app only, never on a lock screen. */
/** Each returns a `(lang) => string`, the shape `NotificationsService.sendToUser` resolves per recipient. */
export const inboundMailPush = {
  receiptsTitle: (n: number) => (lang: Lang) => pick(lang).receiptsTitle(n),
  receiptsBody: () => (lang: Lang) => pick(lang).receiptsBody(),
  verificationTitle: () => (lang: Lang) => pick(lang).verificationTitle(),
  verificationBody: () => (lang: Lang) => pick(lang).verificationBody(),
  quotaTitle: () => (lang: Lang) => pick(lang).quotaTitle(),
  quotaBody: () => (lang: Lang) => pick(lang).quotaBody(),
};
