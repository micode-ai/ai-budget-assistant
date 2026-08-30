import {
  sharedMessages,
  createBotT,
  buildCategorySplitLine as buildSharedCategorySplitLine,
  type CategorySplitLineItem,
} from '../../../common/bot-i18n/shared-messages';

/**
 * Telegram-only copy — everything else lives in the shared dictionary
 * (see common/bot-i18n/shared-messages.ts). Telegram uses `/slash` command
 * syntax and `parse_mode: HTML`, which is why linkFirst/welcomeBack/
 * welcomeNew/linkSuccess/unlinkSuccess/helpText diverge from whatsapp/slack
 * beyond just markup and can't be folded into the shared dictionary.
 */
const platformMessages: Record<string, Record<string, string>> = {
  linkFirst: {
    en: 'Please link your account first. Use /link <code>.',
    ru: 'Сначала привяжите аккаунт. Используйте /link <код>.',
    ua: 'Спочатку прив\'яжіть акаунт. Використовуйте /link <код>.',
    de: 'Bitte verknüpfen Sie zuerst Ihr Konto. Verwenden Sie /link <Code>.',
    es: 'Primero vincula tu cuenta. Usa /link <código>.',
    fr: 'Veuillez d\'abord lier votre compte. Utilisez /link <code>.',
    pl: 'Najpierw połącz swoje konto. Użyj /link <kod>.',
    be: 'Спачатку прывяжыце акаўнт. Выкарыстоўвайце /link <код>.',
    nl: 'Koppel je account eerst. Gebruik /link <code>.',
  },
  welcomeBack: {
    en: 'Welcome back! You are linked to account <b>{{account}}</b>.\n\nSend /help to see available commands.',
    ru: 'С возвращением! Вы привязаны к аккаунту <b>{{account}}</b>.\n\nОтправьте /help для списка команд.',
    ua: 'З поверненням! Ви прив\'язані до акаунту <b>{{account}}</b>.\n\nНадішліть /help для списку команд.',
    de: 'Willkommen zurück! Sie sind mit dem Konto <b>{{account}}</b> verbunden.\n\nSenden Sie /help für verfügbare Befehle.',
    es: '¡Bienvenido de nuevo! Estás vinculado a la cuenta <b>{{account}}</b>.\n\nEnvía /help para ver los comandos.',
    fr: 'Bon retour ! Vous êtes lié au compte <b>{{account}}</b>.\n\nEnvoyez /help pour voir les commandes.',
    pl: 'Witaj ponownie! Jesteś połączony z kontem <b>{{account}}</b>.\n\nWyślij /help, aby zobaczyć dostępne polecenia.',
    be: 'З вяртаннем! Вы прывязаны да акаўнта <b>{{account}}</b>.\n\nАдпраўце /help для спісу каманд.',
    nl: 'Welkom terug! Je bent gekoppeld aan account <b>{{account}}</b>.\n\nStuur /help om de beschikbare opdrachten te zien.',
  },
  welcomeNew: {
    en: '👋 Welcome to Budget Assistant Bot!\n\nTo get started, link your account:\n1. Open the app → Settings → Telegram Bot\n2. Tap "Connect Telegram"\n3. Send the code here: /link YOUR_CODE\n\nExample: <code>/link A3K9F2</code>',
    ru: '👋 Добро пожаловать в Budget Assistant Bot!\n\nДля начала привяжите аккаунт:\n1. Откройте приложение → Настройки → Telegram Бот\n2. Нажмите «Подключить Telegram»\n3. Отправьте код сюда: /link ВАШ_КОД\n\nПример: <code>/link A3K9F2</code>',
    ua: '👋 Ласкаво просимо до Budget Assistant Bot!\n\nДля початку прив\'яжіть акаунт:\n1. Відкрийте додаток → Налаштування → Telegram Бот\n2. Натисніть «Підключити Telegram»\n3. Надішліть код сюди: /link ВАШ_КОД\n\nПриклад: <code>/link A3K9F2</code>',
    de: '👋 Willkommen beim Budget Assistant Bot!\n\nVerknüpfen Sie zunächst Ihr Konto:\n1. App öffnen → Einstellungen → Telegram Bot\n2. Auf „Telegram verbinden" tippen\n3. Code hier senden: /link IHR_CODE\n\nBeispiel: <code>/link A3K9F2</code>',
    es: '👋 ¡Bienvenido a Budget Assistant Bot!\n\nPara empezar, vincula tu cuenta:\n1. Abre la app → Configuración → Telegram Bot\n2. Toca "Conectar Telegram"\n3. Envía el código aquí: /link TU_CÓDIGO\n\nEjemplo: <code>/link A3K9F2</code>',
    fr: '👋 Bienvenue sur Budget Assistant Bot !\n\nPour commencer, liez votre compte :\n1. Ouvrez l\'app → Paramètres → Bot Telegram\n2. Appuyez sur « Connecter Telegram »\n3. Envoyez le code ici : /link VOTRE_CODE\n\nExemple : <code>/link A3K9F2</code>',
    pl: '👋 Witaj w Budget Assistant Bot!\n\nAby rozpocząć, połącz swoje konto:\n1. Otwórz aplikację → Ustawienia → Telegram Bot\n2. Dotknij „Połącz Telegram"\n3. Wyślij kod tutaj: /link TWÓJ_KOD\n\nPrzykład: <code>/link A3K9F2</code>',
    be: '👋 Сардэчна запрашаем у Budget Assistant Bot!\n\nДля пачатку прывяжыце акаўнт:\n1. Адкрыйце праграму → Налады → Telegram Бот\n2. Націсніце «Падключыць Telegram»\n3. Адпраўце код сюды: /link ВАШ_КОД\n\nПрыклад: <code>/link A3K9F2</code>',
    nl: '👋 Welkom bij Budget Assistant Bot!\n\nKoppel je account om te beginnen:\n1. Open de app → Instellingen → Telegram Bot\n2. Tik op "Telegram koppelen"\n3. Stuur de code hier: /link JOUW_CODE\n\nVoorbeeld: <code>/link A3K9F2</code>',
  },
  linkSuccess: {
    en: '✅ Account linked successfully!\n\nYou can now:\n• Add expenses: <code>/expense 50 lunch</code>\n• Add incomes: <code>/income 3000 salary</code>\n• Send voice messages to add expenses/chat\n• Send receipt photos to scan them\n• Chat with AI — just type any question\n\nSend /help for all commands.',
    ru: '✅ Аккаунт успешно привязан!\n\nТеперь вы можете:\n• Добавлять расходы: <code>/expense 50 обед</code>\n• Добавлять доходы: <code>/income 3000 зарплата</code>\n• Отправлять голосовые для добавления расходов/чата\n• Отправлять фото чеков для сканирования\n• Общаться с ИИ — просто напишите вопрос\n\nОтправьте /help для списка команд.',
    ua: '✅ Акаунт успішно прив\'язано!\n\nТепер ви можете:\n• Додавати витрати: <code>/expense 50 обід</code>\n• Додавати доходи: <code>/income 3000 зарплата</code>\n• Надсилати голосові для додавання витрат/чату\n• Надсилати фото чеків для сканування\n• Спілкуватися з ШІ — просто напишіть питання\n\nНадішліть /help для списку команд.',
    de: '✅ Konto erfolgreich verknüpft!\n\nSie können jetzt:\n• Ausgaben hinzufügen: <code>/expense 50 Mittagessen</code>\n• Einnahmen hinzufügen: <code>/income 3000 Gehalt</code>\n• Sprachnachrichten senden\n• Belegfotos senden\n• Mit KI chatten — einfach eine Frage eingeben\n\nSenden Sie /help für alle Befehle.',
    es: '✅ ¡Cuenta vinculada!\n\nAhora puedes:\n• Agregar gastos: <code>/expense 50 almuerzo</code>\n• Agregar ingresos: <code>/income 3000 salario</code>\n• Enviar mensajes de voz\n• Enviar fotos de recibos\n• Chatear con IA — solo escribe tu pregunta\n\nEnvía /help para todos los comandos.',
    fr: '✅ Compte lié avec succès !\n\nVous pouvez maintenant :\n• Ajouter des dépenses : <code>/expense 50 déjeuner</code>\n• Ajouter des revenus : <code>/income 3000 salaire</code>\n• Envoyer des messages vocaux\n• Envoyer des photos de reçus\n• Discuter avec l\'IA — tapez votre question\n\nEnvoyez /help pour toutes les commandes.',
    pl: '✅ Konto połączone!\n\nTeraz możesz:\n• Dodawać wydatki: <code>/expense 50 obiad</code>\n• Dodawać dochody: <code>/income 3000 pensja</code>\n• Wysyłać wiadomości głosowe\n• Wysyłać zdjęcia paragonów\n• Rozmawiać z AI — po prostu wpisz pytanie\n\nWyślij /help, aby zobaczyć polecenia.',
    be: '✅ Акаўнт паспяхова прывязаны!\n\nЦяпер вы можаце:\n• Дадаваць выдаткі: <code>/expense 50 абед</code>\n• Дадаваць даходы: <code>/income 3000 зарплата</code>\n• Адпраўляць галасавыя\n• Адпраўляць фота чэкаў\n• Размаўляць з ІІ — проста напішыце пытанне\n\nАдпраўце /help для спісу каманд.',
    nl: '✅ Account succesvol gekoppeld!\n\nJe kunt nu:\n• Uitgaven toevoegen: <code>/expense 50 lunch</code>\n• Inkomsten toevoegen: <code>/income 3000 salaris</code>\n• Spraakberichten sturen om uitgaven toe te voegen/te chatten\n• Foto\'s van bonnen sturen om te scannen\n• Chatten met AI — typ gewoon een vraag\n\nStuur /help voor alle opdrachten.',
  },
  unlinkSuccess: {
    en: '✅ Your Telegram has been unlinked. Send /link <code> to connect again.',
    ru: '✅ Telegram отвязан. Отправьте /link <код> для повторного подключения.',
    ua: '✅ Telegram від\'язано. Надішліть /link <код> для повторного підключення.',
    de: '✅ Telegram wurde getrennt. Senden Sie /link <Code> zum erneuten Verbinden.',
    es: '✅ Telegram desvinculado. Envía /link <código> para reconectar.',
    fr: '✅ Telegram dissocié. Envoyez /link <code> pour reconnecter.',
    pl: '✅ Telegram odłączony. Wyślij /link <kod>, aby połączyć ponownie.',
    be: '✅ Telegram адвязаны. Адпраўце /link <код> для паўторнага падключэння.',
    nl: '✅ Je Telegram is losgekoppeld. Stuur /link <code> om opnieuw te verbinden.',
  },
  helpText: {
    en: '<b>Available commands:</b>\n\n/expense &lt;amount&gt; [description] — Add an expense\n/income &lt;amount&gt; [description] — Add income\n/category [type] &lt;name&gt; — Create a category\n/categories — List &amp; delete categories\n/usage — View AI usage and limits\n/account — Switch between accounts\n/newchat — Start a new AI conversation\n/unlink — Disconnect Telegram\n/help — Show this message\n\n<b>Other features:</b>\n🎤 Send a <b>voice message</b> to add expenses or chat with AI\n📷 Send a <b>receipt photo</b> to scan and create an expense\n💬 Just type any message to <b>chat with the AI assistant</b>',
    ru: '<b>Доступные команды:</b>\n\n/expense &lt;сумма&gt; [описание] — Добавить расход\n/income &lt;сумма&gt; [описание] — Добавить доход\n/category [тип] &lt;название&gt; — Создать категорию\n/categories — Список и удаление категорий\n/usage — Использование AI и лимиты\n/account — Переключить аккаунт\n/newchat — Начать новый разговор с ИИ\n/unlink — Отвязать Telegram\n/help — Показать это сообщение\n\n<b>Другие возможности:</b>\n🎤 Отправьте <b>голосовое сообщение</b> для добавления расходов или чата с ИИ\n📷 Отправьте <b>фото чека</b> для сканирования\n💬 Просто напишите сообщение для <b>чата с ИИ-ассистентом</b>',
    ua: '<b>Доступні команди:</b>\n\n/expense &lt;сума&gt; [опис] — Додати витрату\n/income &lt;сума&gt; [опис] — Додати дохід\n/category [тип] &lt;назва&gt; — Створити категорію\n/categories — Список та видалення категорій\n/usage — Використання AI та ліміти\n/account — Переключити акаунт\n/newchat — Почати нову розмову з ШІ\n/unlink — Від\'язати Telegram\n/help — Показати це повідомлення\n\n<b>Інші можливості:</b>\n🎤 Надішліть <b>голосове повідомлення</b>\n📷 Надішліть <b>фото чеку</b> для сканування\n💬 Просто напишіть повідомлення для <b>чату з ШІ</b>',
    de: '<b>Verfügbare Befehle:</b>\n\n/expense &lt;Betrag&gt; [Beschreibung] — Ausgabe hinzufügen\n/income &lt;Betrag&gt; [Beschreibung] — Einnahme hinzufügen\n/category [Typ] &lt;Name&gt; — Kategorie erstellen\n/categories — Kategorien auflisten\n/usage — AI-Nutzung und Limits\n/account — Konto wechseln\n/newchat — Neues KI-Gespräch\n/unlink — Telegram trennen\n/help — Diese Nachricht anzeigen\n\n<b>Weitere Funktionen:</b>\n🎤 <b>Sprachnachricht</b> senden\n📷 <b>Belegfoto</b> senden\n💬 Einfach schreiben für <b>KI-Chat</b>',
    es: '<b>Comandos disponibles:</b>\n\n/expense &lt;monto&gt; [descripción] — Agregar gasto\n/income &lt;monto&gt; [descripción] — Agregar ingreso\n/category [tipo] &lt;nombre&gt; — Crear categoría\n/categories — Listar categorías\n/usage — Uso de AI y límites\n/account — Cambiar cuenta\n/newchat — Nueva conversación AI\n/unlink — Desvincular Telegram\n/help — Mostrar este mensaje\n\n<b>Otras funciones:</b>\n🎤 Envía un <b>mensaje de voz</b>\n📷 Envía una <b>foto de recibo</b>\n💬 Escribe para <b>chatear con IA</b>',
    fr: '<b>Commandes disponibles :</b>\n\n/expense &lt;montant&gt; [description] — Ajouter une dépense\n/income &lt;montant&gt; [description] — Ajouter un revenu\n/category [type] &lt;nom&gt; — Créer une catégorie\n/categories — Lister les catégories\n/usage — Utilisation AI et limites\n/account — Changer de compte\n/newchat — Nouvelle conversation IA\n/unlink — Dissocier Telegram\n/help — Afficher ce message\n\n<b>Autres fonctions :</b>\n🎤 Envoyez un <b>message vocal</b>\n📷 Envoyez une <b>photo de reçu</b>\n💬 Écrivez pour <b>discuter avec l\'IA</b>',
    pl: '<b>Dostępne polecenia:</b>\n\n/expense &lt;kwota&gt; [opis] — Dodaj wydatek\n/income &lt;kwota&gt; [opis] — Dodaj dochód\n/category [typ] &lt;nazwa&gt; — Utwórz kategorię\n/categories — Lista kategorii\n/usage — Użycie AI i limity\n/account — Zmień konto\n/newchat — Nowa rozmowa z AI\n/unlink — Odłącz Telegram\n/help — Pokaż to polecenie\n\n<b>Inne funkcje:</b>\n🎤 Wyślij <b>wiadomość głosową</b>\n📷 Wyślij <b>zdjęcie paragonu</b>\n💬 Napisz, aby <b>porozmawiać z AI</b>',
    be: '<b>Даступныя каманды:</b>\n\n/expense &lt;сума&gt; [апісанне] — Дадаць выдатак\n/income &lt;сума&gt; [апісанне] — Дадаць даход\n/category [тып] &lt;назва&gt; — Стварыць катэгорыю\n/categories — Спіс катэгорый\n/usage — Выкарыстанне AI і ліміты\n/account — Пераключыць акаўнт\n/newchat — Новая размова з ІІ\n/unlink — Адвязаць Telegram\n/help — Паказаць гэта паведамленне\n\n<b>Іншыя магчымасці:</b>\n🎤 Адпраўце <b>галасавое паведамленне</b>\n📷 Адпраўце <b>фота чэка</b>\n💬 Проста напішыце для <b>чата з ІІ</b>',
    nl: '<b>Beschikbare opdrachten:</b>\n\n/expense &lt;bedrag&gt; [omschrijving] — Uitgave toevoegen\n/income &lt;bedrag&gt; [omschrijving] — Inkomsten toevoegen\n/category [type] &lt;naam&gt; — Categorie aanmaken\n/categories — Categorieën weergeven &amp; verwijderen\n/usage — AI-gebruik en limieten bekijken\n/account — Tussen accounts wisselen\n/newchat — Nieuw AI-gesprek starten\n/unlink — Telegram ontkoppelen\n/help — Dit bericht tonen\n\n<b>Andere functies:</b>\n🎤 Stuur een <b>spraakbericht</b> om uitgaven toe te voegen of te chatten met AI\n📷 Stuur een <b>foto van een bon</b> om te scannen en een uitgave aan te maken\n💬 Typ gewoon een bericht om <b>met de AI-assistent te chatten</b>',
  },
};

const messages: Record<string, Record<string, string>> = { ...sharedMessages, ...platformMessages };

export const t = createBotT(messages, { markup: 'html', defaultParams: { platform: 'Telegram' } });

export type { CategorySplitLineItem };

export function buildCategorySplitLine(
  splits: CategorySplitLineItem[],
  currencyCode: string,
  lang?: string,
): string {
  return buildSharedCategorySplitLine(t, splits, currencyCode, lang);
}
