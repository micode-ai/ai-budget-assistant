import type { CoicopDivision } from '@budget/shared-types';

/** COICOP 2018 as published by Eurostat `prc_hicp_minr` (`coicop18`). TOTAL = all items. */
export const DIVISIONS: readonly CoicopDivision[] = [
  'TOTAL', 'CP01', 'CP02', 'CP03', 'CP04', 'CP05', 'CP06', 'CP07',
  'CP08', 'CP09', 'CP10', 'CP11', 'CP12', 'CP13',
];

export function isDivision(x: unknown): x is CoicopDivision {
  return typeof x === 'string' && (DIVISIONS as readonly string[]).includes(x);
}

/**
 * Seed categories keep the same icon in all 9 seed languages while their names
 * change (default-categories.ts), so the icon is the stable key. A user who
 * re-icons a category falls through to the classifier, which is correct.
 */
const SEED_ICON_DIVISION: Record<string, CoicopDivision> = {
  '🍔': 'CP11', // Food & Dining → restaurants
  '🛒': 'CP01', // Groceries
  '🍺': 'CP02', // Alcohol
  '🧴': 'CP05', // Household
  '🚗': 'CP07', // Transport
  '🛍️': 'TOTAL', // Shopping — too broad for one division
  '🎬': 'CP09', // Entertainment
  '💡': 'CP04', // Bills & Utilities
  '💊': 'CP06', // Health
  '📚': 'CP10', // Education
  '👕': 'CP03', // Clothing
  '🎁': 'CP09', // Gifts — same answer the classifier prompt gives (ABA-617)
  '✈️': 'CP09', // Travel — package holidays sit in CP09 in COICOP 2018
  '📱': 'CP08', // Subscriptions — information and communication
  '📦': 'TOTAL', // Other
};

export function divisionForSeedIcon(icon: string | null | undefined): CoicopDivision | null {
  if (!icon) return null;
  return SEED_ICON_DIVISION[icon] ?? null;
}

/** Eurostat geo codes that are single countries in prc_hicp_minr (Greece is EL). */
export const EUROSTAT_COUNTRIES: readonly string[] = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR', 'HR', 'HU',
  'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
  'IS', 'NO', 'CH',
];

export function isEurostatCountry(x: unknown): x is string {
  return typeof x === 'string' && EUROSTAT_COUNTRIES.includes(x);
}

const TZ_COUNTRY: Record<string, string> = {
  'Europe/Vienna': 'AT', 'Europe/Brussels': 'BE', 'Europe/Sofia': 'BG', 'Asia/Nicosia': 'CY',
  'Europe/Nicosia': 'CY', 'Europe/Prague': 'CZ', 'Europe/Berlin': 'DE', 'Europe/Busingen': 'DE',
  'Europe/Copenhagen': 'DK', 'Europe/Tallinn': 'EE', 'Europe/Athens': 'EL', 'Europe/Madrid': 'ES',
  'Atlantic/Canary': 'ES', 'Europe/Helsinki': 'FI', 'Europe/Paris': 'FR', 'Europe/Zagreb': 'HR',
  'Europe/Budapest': 'HU', 'Europe/Dublin': 'IE', 'Europe/Rome': 'IT', 'Europe/Vilnius': 'LT',
  'Europe/Luxembourg': 'LU', 'Europe/Riga': 'LV', 'Europe/Malta': 'MT', 'Europe/Amsterdam': 'NL',
  'Europe/Warsaw': 'PL', 'Europe/Lisbon': 'PT', 'Atlantic/Madeira': 'PT', 'Atlantic/Azores': 'PT',
  'Europe/Bucharest': 'RO', 'Europe/Stockholm': 'SE', 'Europe/Ljubljana': 'SI',
  'Europe/Bratislava': 'SK', 'Atlantic/Reykjavik': 'IS', 'Europe/Oslo': 'NO', 'Europe/Zurich': 'CH',
};

export function countryFromTimezone(tz: string | null | undefined): string | null {
  if (!tz) return null;
  return TZ_COUNTRY[tz] ?? null;
}

type Labels = Record<CoicopDivision, string>;

const LABELS: Record<string, Labels> = {
  en: {
    TOTAL: 'Everything else', CP01: 'Food and non-alcoholic drinks', CP02: 'Alcohol and tobacco',
    CP03: 'Clothing and footwear', CP04: 'Housing and utilities', CP05: 'Home and furnishings',
    CP06: 'Health', CP07: 'Transport', CP08: 'Phone and internet', CP09: 'Recreation and culture',
    CP10: 'Education', CP11: 'Restaurants and hotels', CP12: 'Insurance and finance',
    CP13: 'Personal care and other',
  },
  pl: {
    TOTAL: 'Pozostałe', CP01: 'Żywność i napoje bezalkoholowe', CP02: 'Alkohol i tytoń',
    CP03: 'Odzież i obuwie', CP04: 'Mieszkanie i media', CP05: 'Wyposażenie domu',
    CP06: 'Zdrowie', CP07: 'Transport', CP08: 'Telefon i internet', CP09: 'Rekreacja i kultura',
    CP10: 'Edukacja', CP11: 'Restauracje i hotele', CP12: 'Ubezpieczenia i finanse',
    CP13: 'Higiena osobista i inne',
  },
  de: {
    TOTAL: 'Sonstiges', CP01: 'Lebensmittel und alkoholfreie Getränke', CP02: 'Alkohol und Tabak',
    CP03: 'Bekleidung und Schuhe', CP04: 'Wohnen und Energie', CP05: 'Haushalt und Einrichtung',
    CP06: 'Gesundheit', CP07: 'Verkehr', CP08: 'Telefon und Internet', CP09: 'Freizeit und Kultur',
    CP10: 'Bildung', CP11: 'Restaurants und Hotels', CP12: 'Versicherungen und Finanzen',
    CP13: 'Körperpflege und Sonstiges',
  },
  es: {
    TOTAL: 'Otros', CP01: 'Alimentos y bebidas no alcohólicas', CP02: 'Alcohol y tabaco',
    CP03: 'Ropa y calzado', CP04: 'Vivienda y suministros', CP05: 'Hogar y muebles',
    CP06: 'Salud', CP07: 'Transporte', CP08: 'Teléfono e internet', CP09: 'Ocio y cultura',
    CP10: 'Educación', CP11: 'Restaurantes y hoteles', CP12: 'Seguros y finanzas',
    CP13: 'Cuidado personal y otros',
  },
  fr: {
    TOTAL: 'Autres', CP01: 'Alimentation et boissons non alcoolisées', CP02: 'Alcool et tabac',
    CP03: 'Habillement et chaussures', CP04: 'Logement et énergie', CP05: 'Maison et ameublement',
    CP06: 'Santé', CP07: 'Transports', CP08: 'Téléphone et internet', CP09: 'Loisirs et culture',
    CP10: 'Enseignement', CP11: 'Restaurants et hôtels', CP12: 'Assurances et finances',
    CP13: 'Soins personnels et divers',
  },
  ru: {
    TOTAL: 'Остальное', CP01: 'Продукты и безалкогольные напитки', CP02: 'Алкоголь и табак',
    CP03: 'Одежда и обувь', CP04: 'Жильё и коммунальные услуги', CP05: 'Дом и обстановка',
    CP06: 'Здоровье', CP07: 'Транспорт', CP08: 'Связь и интернет', CP09: 'Отдых и культура',
    CP10: 'Образование', CP11: 'Рестораны и гостиницы', CP12: 'Страхование и финансы',
    CP13: 'Личный уход и прочее',
  },
  ua: {
    TOTAL: 'Інше', CP01: 'Продукти та безалкогольні напої', CP02: 'Алкоголь і тютюн',
    CP03: 'Одяг і взуття', CP04: 'Житло та комунальні послуги', CP05: 'Дім і облаштування',
    CP06: 'Здоровʼя', CP07: 'Транспорт', CP08: 'Звʼязок та інтернет', CP09: 'Відпочинок і культура',
    CP10: 'Освіта', CP11: 'Ресторани та готелі', CP12: 'Страхування та фінанси',
    CP13: 'Особистий догляд та інше',
  },
  be: {
    TOTAL: 'Астатняе', CP01: 'Прадукты і безалкагольныя напоі', CP02: 'Алкаголь і тытунь',
    CP03: 'Адзенне і абутак', CP04: 'Жыллё і камунальныя паслугі', CP05: 'Дом і абсталяванне',
    CP06: 'Здароўе', CP07: 'Транспарт', CP08: 'Сувязь і інтэрнэт', CP09: 'Адпачынак і культура',
    CP10: 'Адукацыя', CP11: 'Рэстараны і гасцініцы', CP12: 'Страхаванне і фінансы',
    CP13: 'Асабісты догляд і іншае',
  },
  nl: {
    TOTAL: 'Overig', CP01: 'Voeding en frisdrank', CP02: 'Alcohol en tabak',
    CP03: 'Kleding en schoenen', CP04: 'Wonen en energie', CP05: 'Huishouden en inrichting',
    CP06: 'Gezondheid', CP07: 'Vervoer', CP08: 'Telefoon en internet', CP09: 'Recreatie en cultuur',
    CP10: 'Onderwijs', CP11: 'Restaurants en hotels', CP12: 'Verzekeringen en financiën',
    CP13: 'Persoonlijke verzorging en overig',
  },
};

export function divisionLabel(division: CoicopDivision, lang: string): string {
  return (Object.prototype.hasOwnProperty.call(LABELS, lang) ? LABELS[lang] : LABELS.en)[division];
}
