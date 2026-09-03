import {
  sharedMessages,
  createBotT,
  buildCategorySplitLine as buildSharedCategorySplitLine,
  buildItemListBlock as buildSharedItemListBlock,
  type CategorySplitLineItem,
} from '../../../common/bot-i18n/shared-messages';
import type { EditableItem } from '../../../common/utils/receipt-item-edit';

/**
 * WhatsApp-only copy — everything else lives in the shared dictionary
 * (see common/bot-i18n/shared-messages.ts). linkFirst/welcomeNew/
 * unlinkSuccess/helpText mention the WhatsApp-specific setup flow (settings
 * location, "number" vs. "workspace") beyond what a `{{platform}}` swap can
 * express, so they stay as full overrides here.
 */
const platformMessages: Record<string, Record<string, string>> = {
  linkFirst: {
    en: 'Please link your account first. Send `link YOUR_CODE` — get the code in the app (Settings → WhatsApp Bot).',
    ru: 'Сначала привяжите аккаунт. Отправьте `link ВАШ_КОД` — код получите в приложении (Настройки → WhatsApp Бот).',
    ua: 'Спочатку прив\'яжіть акаунт. Надішліть `link ВАШ_КОД` — код отримайте в додатку (Налаштування → WhatsApp Бот).',
    de: 'Bitte verknüpfen Sie zuerst Ihr Konto. Senden Sie `link IHR_CODE` — Code in der App (Einstellungen → WhatsApp Bot).',
    es: 'Primero vincula tu cuenta. Envía `link TU_CÓDIGO` — obtén el código en la app (Configuración → WhatsApp Bot).',
    fr: 'Veuillez d\'abord lier votre compte. Envoyez `link VOTRE_CODE` — obtenez le code dans l\'app (Paramètres → Bot WhatsApp).',
    pl: 'Najpierw połącz swoje konto. Wyślij `link TWÓJ_KOD` — kod znajdziesz w aplikacji (Ustawienia → WhatsApp Bot).',
    be: 'Спачатку прывяжыце акаўнт. Адпраўце `link ВАШ_КОД` — код атрымайце ў праграме (Налады → WhatsApp Бот).',
    nl: 'Koppel je account eerst. Stuur `link JOUW_CODE` — haal de code op in de app (Instellingen → WhatsApp Bot).',
  },
  welcomeNew: {
    en: '👋 Welcome to Budget Assistant!\n\nTo connect this WhatsApp number to your account, open the app:\n1. Settings → WhatsApp Bot\n2. Tap "Connect WhatsApp"\n3. Send the code here: `link YOUR_CODE`\n\nExample: `link A3K9F2`',
    ru: '👋 Добро пожаловать в Budget Assistant!\n\nДля привязки этого WhatsApp к аккаунту откройте приложение:\n1. Настройки → WhatsApp Бот\n2. Нажмите «Подключить WhatsApp»\n3. Отправьте код сюда: `link ВАШ_КОД`\n\nПример: `link A3K9F2`',
    ua: '👋 Ласкаво просимо до Budget Assistant!\n\nДля прив\'язки цього WhatsApp до акаунту відкрийте додаток:\n1. Налаштування → WhatsApp Бот\n2. Натисніть «Підключити WhatsApp»\n3. Надішліть код сюди: `link ВАШ_КОД`\n\nПриклад: `link A3K9F2`',
    de: '👋 Willkommen beim Budget Assistant!\n\nUm diese WhatsApp-Nummer mit Ihrem Konto zu verbinden, öffnen Sie die App:\n1. Einstellungen → WhatsApp Bot\n2. „WhatsApp verbinden" antippen\n3. Code hier senden: `link IHR_CODE`\n\nBeispiel: `link A3K9F2`',
    es: '👋 ¡Bienvenido a Budget Assistant!\n\nPara vincular este WhatsApp a tu cuenta, abre la app:\n1. Configuración → WhatsApp Bot\n2. Toca "Conectar WhatsApp"\n3. Envía el código aquí: `link TU_CÓDIGO`\n\nEjemplo: `link A3K9F2`',
    fr: '👋 Bienvenue sur Budget Assistant !\n\nPour lier ce WhatsApp à votre compte, ouvrez l\'app :\n1. Paramètres → Bot WhatsApp\n2. Appuyez sur « Connecter WhatsApp »\n3. Envoyez le code ici : `link VOTRE_CODE`\n\nExemple : `link A3K9F2`',
    pl: '👋 Witaj w Budget Assistant!\n\nAby połączyć ten WhatsApp z kontem, otwórz aplikację:\n1. Ustawienia → WhatsApp Bot\n2. Dotknij „Połącz WhatsApp"\n3. Wyślij kod tutaj: `link TWÓJ_KOD`\n\nPrzykład: `link A3K9F2`',
    be: '👋 Сардэчна запрашаем у Budget Assistant!\n\nКаб прывязаць гэты WhatsApp да акаўнта, адкрыйце праграму:\n1. Налады → WhatsApp Бот\n2. Націсніце «Падключыць WhatsApp»\n3. Адпраўце код сюды: `link ВАШ_КОД`\n\nПрыклад: `link A3K9F2`',
    nl: '👋 Welkom bij Budget Assistant!\n\nOm dit WhatsApp-nummer aan je account te koppelen, open de app:\n1. Instellingen → WhatsApp Bot\n2. Tik op "WhatsApp koppelen"\n3. Stuur de code hier: `link JOUW_CODE`\n\nVoorbeeld: `link A3K9F2`',
  },
  unlinkSuccess: {
    en: '✅ Your WhatsApp has been unlinked. Send `link YOUR_CODE` to connect again.',
    ru: '✅ WhatsApp отвязан. Отправьте `link ВАШ_КОД` для повторного подключения.',
    ua: '✅ WhatsApp від\'язано. Надішліть `link ВАШ_КОД` для повторного підключення.',
    de: '✅ WhatsApp wurde getrennt. Senden Sie `link IHR_CODE` zum erneuten Verbinden.',
    es: '✅ WhatsApp desvinculado. Envía `link TU_CÓDIGO` para reconectar.',
    fr: '✅ WhatsApp dissocié. Envoyez `link VOTRE_CODE` pour reconnecter.',
    pl: '✅ WhatsApp odłączony. Wyślij `link TWÓJ_KOD`, aby połączyć ponownie.',
    be: '✅ WhatsApp адвязаны. Адпраўце `link ВАШ_КОД` для паўторнага падключэння.',
    nl: '✅ Je WhatsApp is losgekoppeld. Stuur `link JOUW_CODE` om opnieuw te verbinden.',
  },
  helpText: {
    en: '*Available commands:*\n\nexpense <amount> [description] — Add an expense\nincome <amount> [description] — Add income\ncategory [type] <name> — Create a category\ncategories — List & delete categories\nusage — View AI usage and limits\naccount — Switch between accounts\nnewchat — Start a new AI conversation\nunlink — Disconnect WhatsApp\nhelp — Show this message\n\n*Other features:*\n🎤 Send a *voice message* to add expenses or chat with AI\n📷 Send a *receipt photo* to scan and create an expense\n💬 Just type any message to *chat with the AI assistant*',
    ru: '*Доступные команды:*\n\nexpense <сумма> [описание] — Добавить расход\nincome <сумма> [описание] — Добавить доход\ncategory [тип] <название> — Создать категорию\ncategories — Список и удаление категорий\nusage — Использование AI и лимиты\naccount — Переключить аккаунт\nnewchat — Начать новый разговор с ИИ\nunlink — Отвязать WhatsApp\nhelp — Показать это сообщение\n\n*Другие возможности:*\n🎤 Отправьте *голосовое сообщение* для добавления расходов или чата с ИИ\n📷 Отправьте *фото чека* для сканирования\n💬 Просто напишите сообщение для *чата с ИИ-ассистентом*',
    ua: '*Доступні команди:*\n\nexpense <сума> [опис] — Додати витрату\nincome <сума> [опис] — Додати дохід\ncategory [тип] <назва> — Створити категорію\ncategories — Список та видалення категорій\nusage — Використання AI та ліміти\naccount — Переключити акаунт\nnewchat — Почати нову розмову з ШІ\nunlink — Від\'язати WhatsApp\nhelp — Показати це повідомлення\n\n*Інші можливості:*\n🎤 Надішліть *голосове повідомлення*\n📷 Надішліть *фото чеку* для сканування\n💬 Просто напишіть повідомлення для *чату з ШІ*',
    de: '*Verfügbare Befehle:*\n\nexpense <Betrag> [Beschreibung] — Ausgabe hinzufügen\nincome <Betrag> [Beschreibung] — Einnahme hinzufügen\ncategory [Typ] <Name> — Kategorie erstellen\ncategories — Kategorien auflisten\nusage — AI-Nutzung und Limits\naccount — Konto wechseln\nnewchat — Neues KI-Gespräch\nunlink — WhatsApp trennen\nhelp — Diese Nachricht anzeigen\n\n*Weitere Funktionen:*\n🎤 *Sprachnachricht* senden\n📷 *Belegfoto* senden\n💬 Einfach schreiben für *KI-Chat*',
    es: '*Comandos disponibles:*\n\nexpense <monto> [descripción] — Agregar gasto\nincome <monto> [descripción] — Agregar ingreso\ncategory [tipo] <nombre> — Crear categoría\ncategories — Listar categorías\nusage — Uso de AI y límites\naccount — Cambiar cuenta\nnewchat — Nueva conversación AI\nunlink — Desvincular WhatsApp\nhelp — Mostrar este mensaje\n\n*Otras funciones:*\n🎤 Envía un *mensaje de voz*\n📷 Envía una *foto de recibo*\n💬 Escribe para *chatear con IA*',
    fr: '*Commandes disponibles :*\n\nexpense <montant> [description] — Ajouter une dépense\nincome <montant> [description] — Ajouter un revenu\ncategory [type] <nom> — Créer une catégorie\ncategories — Lister les catégories\nusage — Utilisation AI et limites\naccount — Changer de compte\nnewchat — Nouvelle conversation IA\nunlink — Dissocier WhatsApp\nhelp — Afficher ce message\n\n*Autres fonctions :*\n🎤 Envoyez un *message vocal*\n📷 Envoyez une *photo de reçu*\n💬 Écrivez pour *discuter avec l\'IA*',
    pl: '*Dostępne polecenia:*\n\nexpense <kwota> [opis] — Dodaj wydatek\nincome <kwota> [opis] — Dodaj dochód\ncategory [typ] <nazwa> — Utwórz kategorię\ncategories — Lista kategorii\nusage — Użycie AI i limity\naccount — Zmień konto\nnewchat — Nowa rozmowa z AI\nunlink — Odłącz WhatsApp\nhelp — Pokaż to polecenie\n\n*Inne funkcje:*\n🎤 Wyślij *wiadomość głosową*\n📷 Wyślij *zdjęcie paragonu*\n💬 Napisz, aby *porozmawiać z AI*',
    be: '*Даступныя каманды:*\n\nexpense <сума> [апісанне] — Дадаць выдатак\nincome <сума> [апісанне] — Дадаць даход\ncategory [тып] <назва> — Стварыць катэгорыю\ncategories — Спіс катэгорый\nusage — Выкарыстанне AI і ліміты\naccount — Пераключыць акаўнт\nnewchat — Новая размова з ІІ\nunlink — Адвязаць WhatsApp\nhelp — Паказаць гэта паведамленне\n\n*Іншыя магчымасці:*\n🎤 Адпраўце *галасавое паведамленне*\n📷 Адпраўце *фота чэка*\n💬 Проста напішыце для *чата з ІІ*',
    nl: '*Beschikbare opdrachten:*\n\nexpense <bedrag> [omschrijving] — Uitgave toevoegen\nincome <bedrag> [omschrijving] — Inkomsten toevoegen\ncategory [type] <naam> — Categorie aanmaken\ncategories — Categorieën weergeven & verwijderen\nusage — AI-gebruik en limieten bekijken\naccount — Tussen accounts wisselen\nnewchat — Nieuw AI-gesprek starten\nunlink — WhatsApp ontkoppelen\nhelp — Dit bericht tonen\n\n*Andere functies:*\n🎤 Stuur een *spraakbericht* om uitgaven toe te voegen of te chatten met AI\n📷 Stuur een *foto van een bon* om te scannen en een uitgave aan te maken\n💬 Typ gewoon een bericht om *met de AI-assistent te chatten*',
  },
};

const messages: Record<string, Record<string, string>> = { ...sharedMessages, ...platformMessages };

export const t = createBotT(messages, { markup: 'markdown', defaultParams: { platform: 'WhatsApp' } });

export type { CategorySplitLineItem };

export function buildCategorySplitLine(
  splits: CategorySplitLineItem[],
  currencyCode: string,
  lang?: string,
): string {
  return buildSharedCategorySplitLine(t, splits, currencyCode, lang);
}

export function buildItemListBlock(
  items: EditableItem[],
  currencyCode: string,
  total: number,
  lang?: string,
): string {
  return buildSharedItemListBlock(t, items, currencyCode, total, lang);
}
