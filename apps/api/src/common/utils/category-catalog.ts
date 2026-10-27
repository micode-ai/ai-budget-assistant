/**
 * KEYED CATEGORY CATALOG - canonical copy. Its twin is
 * packages/shared-utils/src/formatting/category-catalog.ts; the two bodies
 * (everything after this header) must stay identical, which
 * apps/mobile/src/features/categories/__tests__/categoryCatalogParity.test.ts
 * enforces. The API cannot import a runtime value from @budget/shared-utils.
 *
 * A category's identity is its `key`, never its name: the name follows the UI
 * language. Keys are camelCase English slugs and permanent once shipped. A key
 * is unique per TYPE (expense "gifts" and income "gifts" are different rows).
 */
export type CatalogLocale = 'en' | 'de' | 'es' | 'fr' | 'pl' | 'ru' | 'ua' | 'be' | 'nl';

export interface CatalogEntry {
  key: string;
  type: 'expense' | 'income';
  icon: string;
  color: string;
  /** True for the entries a new account is seeded with (getDefaultCategories). */
  seeded: boolean;
  names: Record<CatalogLocale, string>;
}

export const CATEGORY_CATALOG: readonly CatalogEntry[] = [
  {
    key: 'foodAndDining',
    type: 'expense',
    icon: '🍔',
    color: '#FF6B6B',
    seeded: true,
    names: {
      en: 'Food & Dining',
      de: 'Essen & Restaurants',
      es: 'Comida y restaurantes',
      fr: 'Repas et restaurants',
      pl: 'Jedzenie i restauracje',
      ru: 'Еда и рестораны',
      ua: 'Їжа та ресторани',
      be: 'Ежа і рэстараны',
      nl: 'Eten & restaurants',
    },
  },
  {
    key: 'groceries',
    type: 'expense',
    icon: '🛒',
    color: '#4ECDC4',
    seeded: true,
    names: {
      en: 'Groceries',
      de: 'Lebensmittel',
      es: 'Supermercado',
      fr: 'Courses',
      pl: 'Zakupy spożywcze',
      ru: 'Продукты',
      ua: 'Продукти',
      be: 'Прадукты',
      nl: 'Boodschappen',
    },
  },
  {
    key: 'alcohol',
    type: 'expense',
    icon: '🍺',
    color: '#D63031',
    seeded: true,
    names: {
      en: 'Alcohol',
      de: 'Alkohol',
      es: 'Alcohol',
      fr: 'Alcool',
      pl: 'Alkohol',
      ru: 'Алкоголь',
      ua: 'Алкоголь',
      be: 'Алкаголь',
      nl: 'Alcohol',
    },
  },
  {
    key: 'household',
    type: 'expense',
    icon: '🧴',
    color: '#00CEC9',
    seeded: true,
    names: {
      en: 'Household',
      de: 'Haushalt',
      es: 'Hogar',
      fr: 'Maison',
      pl: 'Chemia domowa',
      ru: 'Бытовая химия',
      ua: 'Побутова хімія',
      be: 'Бытавая хімія',
      nl: 'Huishouden',
    },
  },
  {
    key: 'transport',
    type: 'expense',
    icon: '🚗',
    color: '#45B7D1',
    seeded: true,
    names: {
      en: 'Transport',
      de: 'Transport',
      es: 'Transporte',
      fr: 'Transport',
      pl: 'Transport',
      ru: 'Транспорт',
      ua: 'Транспорт',
      be: 'Транспарт',
      nl: 'Vervoer',
    },
  },
  {
    key: 'shopping',
    type: 'expense',
    icon: '🛍️',
    color: '#96CEB4',
    seeded: true,
    names: {
      en: 'Shopping',
      de: 'Einkaufen',
      es: 'Compras',
      fr: 'Shopping',
      pl: 'Zakupy',
      ru: 'Покупки',
      ua: 'Покупки',
      be: 'Пакупкі',
      nl: 'Winkelen',
    },
  },
  {
    key: 'entertainment',
    type: 'expense',
    icon: '🎬',
    color: '#FFEAA7',
    seeded: true,
    names: {
      en: 'Entertainment',
      de: 'Unterhaltung',
      es: 'Entretenimiento',
      fr: 'Divertissement',
      pl: 'Rozrywka',
      ru: 'Развлечения',
      ua: 'Розваги',
      be: 'Забавы',
      nl: 'Entertainment',
    },
  },
  {
    key: 'billsAndUtilities',
    type: 'expense',
    icon: '💡',
    color: '#DFE6E9',
    seeded: true,
    names: {
      en: 'Bills & Utilities',
      de: 'Rechnungen',
      es: 'Facturas',
      fr: 'Factures',
      pl: 'Rachunki',
      ru: 'Счета и коммунальные',
      ua: 'Рахунки та комунальні',
      be: 'Рахункі і камунальныя',
      nl: 'Rekeningen',
    },
  },
  {
    key: 'health',
    type: 'expense',
    icon: '💊',
    color: '#A29BFE',
    seeded: true,
    names: {
      en: 'Health',
      de: 'Gesundheit',
      es: 'Salud',
      fr: 'Santé',
      pl: 'Zdrowie',
      ru: 'Здоровье',
      ua: "Здоров'я",
      be: "Здароў'е",
      nl: 'Gezondheid',
    },
  },
  {
    key: 'education',
    type: 'expense',
    icon: '📚',
    color: '#6C5CE7',
    seeded: true,
    names: {
      en: 'Education',
      de: 'Bildung',
      es: 'Educación',
      fr: 'Éducation',
      pl: 'Edukacja',
      ru: 'Образование',
      ua: 'Освіта',
      be: 'Адукацыя',
      nl: 'Onderwijs',
    },
  },
  {
    key: 'clothing',
    type: 'expense',
    icon: '👕',
    color: '#FD79A8',
    seeded: true,
    names: {
      en: 'Clothing',
      de: 'Kleidung',
      es: 'Ropa',
      fr: 'Vêtements',
      pl: 'Ubrania',
      ru: 'Одежда',
      ua: 'Одяг',
      be: 'Адзенне',
      nl: 'Kleding',
    },
  },
  {
    key: 'gifts',
    type: 'expense',
    icon: '🎁',
    color: '#E17055',
    seeded: true,
    names: {
      en: 'Gifts',
      de: 'Geschenke',
      es: 'Regalos',
      fr: 'Cadeaux',
      pl: 'Prezenty',
      ru: 'Подарки',
      ua: 'Подарунки',
      be: 'Падарункі',
      nl: 'Cadeaus',
    },
  },
  {
    key: 'travel',
    type: 'expense',
    icon: '✈️',
    color: '#00B894',
    seeded: true,
    names: {
      en: 'Travel',
      de: 'Reisen',
      es: 'Viajes',
      fr: 'Voyages',
      pl: 'Podróże',
      ru: 'Путешествия',
      ua: 'Подорожі',
      be: 'Падарожжы',
      nl: 'Reizen',
    },
  },
  {
    key: 'subscriptions',
    type: 'expense',
    icon: '📱',
    color: '#0984E3',
    seeded: true,
    names: {
      en: 'Subscriptions',
      de: 'Abonnements',
      es: 'Suscripciones',
      fr: 'Abonnements',
      pl: 'Subskrypcje',
      ru: 'Подписки',
      ua: 'Підписки',
      be: 'Падпіскі',
      nl: 'Abonnementen',
    },
  },
  {
    key: 'salary',
    type: 'income',
    icon: '💰',
    color: '#00B894',
    seeded: true,
    names: {
      en: 'Salary',
      de: 'Gehalt',
      es: 'Salario',
      fr: 'Salaire',
      pl: 'Wynagrodzenie',
      ru: 'Зарплата',
      ua: 'Зарплата',
      be: 'Зарплата',
      nl: 'Salaris',
    },
  },
  {
    key: 'freelance',
    type: 'income',
    icon: '💻',
    color: '#6C5CE7',
    seeded: true,
    names: {
      en: 'Freelance',
      de: 'Freelance',
      es: 'Freelance',
      fr: 'Freelance',
      pl: 'Freelance',
      ru: 'Фриланс',
      ua: 'Фріланс',
      be: 'Фрыланс',
      nl: 'Freelance',
    },
  },
  {
    key: 'other',
    type: 'expense',
    icon: '📦',
    color: '#636E72',
    seeded: true,
    names: {
      en: 'Other',
      de: 'Sonstiges',
      es: 'Otros',
      fr: 'Autres',
      pl: 'Inne',
      ru: 'Другое',
      ua: 'Інше',
      be: 'Іншае',
      nl: 'Overig',
    },
  },
  {
    key: 'deposit',
    type: 'expense',
    icon: '♻️',
    color: '#55EFC4',
    seeded: false,
    names: {
      en: 'Deposit',
      de: 'Pfand',
      es: 'Depósito',
      fr: 'Consigne',
      pl: 'Kaucja',
      ru: 'Залог за тару',
      ua: 'Застава за тару',
      be: 'Закладзь за тару',
      nl: 'Statiegeld',
    },
  },
  {
    key: 'coffeeAndDrinks',
    type: 'expense',
    icon: 'cafe',
    color: '#A0522D',
    seeded: false,
    names: {
      en: 'Coffee & Drinks',
      de: 'Kaffee & Getränke',
      es: 'Café y Bebidas',
      fr: 'Café & Boissons',
      pl: 'Kawa i napoje',
      ru: 'Кофе и напитки',
      ua: 'Кава та напої',
      be: 'Кава і напоі',
      nl: 'Koffie & drankjes',
    },
  },
  {
    key: 'personalCare',
    type: 'expense',
    icon: 'happy',
    color: '#2471A3',
    seeded: false,
    names: {
      en: 'Personal Care',
      de: 'Körperpflege',
      es: 'Cuidado Personal',
      fr: 'Soins personnels',
      pl: 'Higiena osobista',
      ru: 'Личная гигиена',
      ua: 'Особиста гігієна',
      be: 'Асабістая гігіена',
      nl: 'Persoonlijke verzorging',
    },
  },
  {
    key: 'investments',
    type: 'income',
    icon: 'trending-up',
    color: '#1ABC9C',
    seeded: false,
    names: {
      en: 'Investments',
      de: 'Investitionen',
      es: 'Inversiones',
      fr: 'Investissements',
      pl: 'Inwestycje',
      ru: 'Инвестиции',
      ua: 'Інвестиції',
      be: 'Інвестыцыі',
      nl: 'Beleggingen',
    },
  },
  {
    key: 'gifts',
    type: 'income',
    icon: 'gift',
    color: '#E74C3C',
    seeded: false,
    names: {
      en: 'Gifts',
      de: 'Geschenke',
      es: 'Regalos',
      fr: 'Cadeaux',
      pl: 'Prezenty',
      ru: 'Подарки',
      ua: 'Подарунки',
      be: 'Падарункі',
      nl: 'Cadeaus',
    },
  },
  {
    key: 'otherIncome',
    type: 'income',
    icon: 'ellipsis-horizontal',
    color: '#95A5A6',
    seeded: false,
    names: {
      en: 'Other Income',
      de: 'Sonstiges Einkommen',
      es: 'Otros ingresos',
      fr: 'Autre revenu',
      pl: 'Inne przychody',
      ru: 'Другой доход',
      ua: 'Інший дохід',
      be: 'Іншы даход',
      nl: 'Overige inkomsten',
    },
  },
];

/**
 * Older app builds seeded and displayed other names for some concepts ("Health &
 * Fitness", "Essen & Trinken"). They are recognised when matching a name to a
 * key, but are not display names.
 */
const ALIASES: ReadonlyArray<{ key: string; type: 'expense' | 'income'; names: readonly string[] }> = [
  { key: 'foodAndDining', type: 'expense', names: ['Essen & Trinken', 'Restauration', 'Eten & drinken'] },
  { key: 'health', type: 'expense', names: ['Health & Fitness', 'Gesundheit & Fitness', 'Salud y Bienestar', 'Santé & Bien-être', 'Zdrowie i fitness', 'Здоровье и фитнес', "Здоров'я та фітнес", 'Здароўе і фітнес', 'Gezondheid & fitness'] },
  { key: 'billsAndUtilities', type: 'expense', names: ['Rechnungen & Versorgungsleistungen', 'Facturas y Servicios', 'Factures & Services', 'Rachunki i media', 'Rekeningen & nutsvoorzieningen'] },
  { key: 'travel', type: 'expense', names: ['Voyage'] },
  { key: 'groceries', type: 'expense', names: ['Artykuły spożywcze'] },
  { key: 'clothing', type: 'expense', names: ['Odzież'] },
];

const normalize = (name: string): string => name.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

const LOCALE_LIST: readonly CatalogLocale[] = ['en', 'de', 'es', 'fr', 'pl', 'ru', 'ua', 'be', 'nl'];

let keyByTypedName: Map<string, string> | null = null;

function buildIndex(): Map<string, string> {
  const index = new Map<string, string>();
  const add = (type: string, name: string, key: string) => {
    const id = `${type}:${normalize(name)}`;
    if (!index.has(id)) index.set(id, key);
  };
  for (const e of CATEGORY_CATALOG) for (const l of LOCALE_LIST) add(e.type, e.names[l], e.key);
  for (const a of ALIASES) for (const n of a.names) add(a.type, n, a.key);
  return index;
}

/** The catalog key a name stands for in ANY of the nine languages, or null. */
export function catalogKeyForName(name: string, type: 'expense' | 'income'): string | null {
  if (!keyByTypedName) keyByTypedName = buildIndex();
  return keyByTypedName.get(`${type}:${normalize(name)}`) ?? null;
}

export function catalogEntry(key: string, type: 'expense' | 'income'): CatalogEntry | null {
  return CATEGORY_CATALOG.find((e) => e.key === key && e.type === type) ?? null;
}

/** The entry's name in `locale`; an unknown locale reads as English. */
export function catalogName(key: string, type: 'expense' | 'income', locale: string): string | null {
  const entry = catalogEntry(key, type);
  if (!entry) return null;
  return entry.names[(LOCALE_LIST as readonly string[]).includes(locale) ? (locale as CatalogLocale) : 'en'];
}

/** Every normalized (type, name) pair the matcher knows, with its key - what the one-off DB backfill is generated from. */
export function catalogNameIndex(): ReadonlyMap<string, string> {
  if (!keyByTypedName) keyByTypedName = buildIndex();
  return keyByTypedName;
}
