import type { Telegram } from 'telegraf';

/**
 * The Telegram "Menu" button's command list (ABA-812). Without it the menu is
 * empty and `/account` — the only way to change which account the bot writes
 * to — can only be found in `/help`. Order is the order the menu shows.
 */
const COMMANDS = ['account', 'expense', 'income', 'categories', 'newchat', 'usage', 'help'] as const;
type Command = (typeof COMMANDS)[number];

/** Telegram's own language codes (ISO 639-1; Ukrainian is `uk`, not the app's `ua`). Absent = everyone else. */
const DESCRIPTIONS: Record<string, Record<Command, string>> = {
  default: {
    account: 'Which account records go to — change it',
    expense: 'Add an expense: /expense 50 lunch',
    income: 'Add income: /income 3000 salary',
    categories: 'List categories',
    newchat: 'Start a new conversation',
    usage: 'AI usage this month',
    help: 'All commands',
  },
  ru: {
    account: 'Счёт, в который идут записи — сменить',
    expense: 'Добавить расход: /expense 50 обед',
    income: 'Добавить доход: /income 3000 зарплата',
    categories: 'Список категорий',
    newchat: 'Начать новый разговор',
    usage: 'Использование ИИ в этом месяце',
    help: 'Все команды',
  },
  uk: {
    account: 'Рахунок, куди йдуть записи — змінити',
    expense: 'Додати витрату: /expense 50 обід',
    income: 'Додати дохід: /income 3000 зарплата',
    categories: 'Список категорій',
    newchat: 'Почати нову розмову',
    usage: 'Використання ШІ цього місяця',
    help: 'Усі команди',
  },
  be: {
    account: 'Рахунак, куды ідуць запісы — змяніць',
    expense: 'Дадаць выдатак: /expense 50 абед',
    income: 'Дадаць даход: /income 3000 зарплата',
    categories: 'Спіс катэгорый',
    newchat: 'Пачаць новую размову',
    usage: 'Выкарыстанне ШІ ў гэтым месяцы',
    help: 'Усе каманды',
  },
  pl: {
    account: 'Konto, na które trafiają wpisy — zmień',
    expense: 'Dodaj wydatek: /expense 50 obiad',
    income: 'Dodaj przychód: /income 3000 pensja',
    categories: 'Lista kategorii',
    newchat: 'Nowa rozmowa',
    usage: 'Użycie AI w tym miesiącu',
    help: 'Wszystkie polecenia',
  },
  de: {
    account: 'Konto für neue Einträge — wechseln',
    expense: 'Ausgabe: /expense 50 Mittagessen',
    income: 'Einnahme: /income 3000 Gehalt',
    categories: 'Kategorien anzeigen',
    newchat: 'Neues Gespräch',
    usage: 'KI-Nutzung diesen Monat',
    help: 'Alle Befehle',
  },
  es: {
    account: 'Cuenta de los nuevos registros — cambiar',
    expense: 'Añadir gasto: /expense 50 comida',
    income: 'Añadir ingreso: /income 3000 salario',
    categories: 'Ver categorías',
    newchat: 'Nueva conversación',
    usage: 'Uso de IA este mes',
    help: 'Todos los comandos',
  },
  fr: {
    account: 'Compte des nouvelles opérations — changer',
    expense: 'Ajouter une dépense : /expense 50 déjeuner',
    income: 'Ajouter un revenu : /income 3000 salaire',
    categories: 'Voir les catégories',
    newchat: 'Nouvelle conversation',
    usage: 'Utilisation de l’IA ce mois-ci',
    help: 'Toutes les commandes',
  },
  nl: {
    account: 'Account voor nieuwe boekingen — wisselen',
    expense: 'Uitgave: /expense 50 lunch',
    income: 'Inkomen: /income 3000 salaris',
    categories: 'Categorieën tonen',
    newchat: 'Nieuw gesprek',
    usage: 'AI-gebruik deze maand',
    help: 'Alle commando’s',
  },
  pt: {
    account: 'Conta dos novos registos — mudar',
    expense: 'Adicionar despesa: /expense 50 almoço',
    income: 'Adicionar receita: /income 3000 salário',
    categories: 'Ver categorias',
    newchat: 'Nova conversa',
    usage: 'Uso de IA este mês',
    help: 'Todos os comandos',
  },
};

export function commandMenu(lang: string): { command: string; description: string }[] {
  const d = DESCRIPTIONS[lang] ?? DESCRIPTIONS.default;
  return COMMANDS.map((command) => ({ command, description: d[command] }));
}

/** Registers the menu for every language above; a failure never stops the bot. */
export async function registerCommandMenu(telegram: Pick<Telegram, 'setMyCommands'>): Promise<void> {
  for (const lang of Object.keys(DESCRIPTIONS)) {
    await telegram.setMyCommands(commandMenu(lang), lang === 'default' ? undefined : { language_code: lang });
  }
}
