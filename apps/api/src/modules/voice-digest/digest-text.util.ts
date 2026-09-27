import type { DigestFacts } from './digest-facts.util';

/** Languages the weekly voice digest can narrate in. */
export const DIGEST_LANGS: readonly string[] = ['en', 'pl', 'de', 'es', 'fr', 'ru', 'ua', 'be', 'nl'];

interface LangTemplates {
  weekOnly: (amt: number, cur: string) => string;
  // `usualAmt` is the (rounded) usual week amount — the direction word (dir)
  // describes THIS week relative to usual, and must never attach to usualAmt.
  weekWithChange: (amt: number, cur: string, absPct: number, dir: string, usualAmt: number) => string;
  dirBelow: string;
  dirAbove: string;
  topRise: (category: string, pct: number) => string;
  safeToSpend: (amt: number, cur: string) => string;
  payday: (days: number) => string;
  shieldItem: (name: string, absPct: number, dir: string) => string;
  dirRise: string;
  dirFall: string;
  restock: (list: string) => string;
  // `signedPct` is a pre-formatted signed percentage string, e.g. "-2%" or
  // "+3%" — the sign already states direction, so no separate dir word.
  realChange: (signedPct: string) => string;
}

// Every sentence embeds only the numbers passed to it (amounts, percentages,
// day counts, or a fact's own name string) — no language adds a stray digit,
// which is what keeps `isFaithful` true for every DIGEST_LANG. Day/percentage
// counts are deliberately phrased in an invariant, non-declined way (no
// singular/plural branching) per the brief's "no pluralisation tricks" rule.
const TEMPLATES: Record<string, LangTemplates> = {
  en: {
    weekOnly: (amt, cur) => `You spent ${amt} ${cur} on everyday spending this week.`,
    weekWithChange: (amt, cur, absPct, dir, usualAmt) =>
      `You spent ${amt} ${cur} on everyday spending this week, ${absPct}% ${dir} than usual (usually about ${usualAmt} ${cur}).`,
    dirBelow: 'less',
    dirAbove: 'more',
    topRise: (category, pct) => `${category} rose ${pct}%.`,
    safeToSpend: (amt, cur) => `You can safely spend ${amt} ${cur} today.`,
    payday: (days) => `Payday in ${days} days.`,
    shieldItem: (name, absPct, dir) => `${name} may ${dir} by ${absPct}% next month.`,
    dirRise: 'rise',
    dirFall: 'fall',
    restock: (list) => `Running low: ${list}.`,
    realChange: (signedPct) => `Salary after your inflation: ${signedPct} over the year.`,
  },
  pl: {
    weekOnly: (amt, cur) => `Wydałeś ${amt} ${cur} na codzienne wydatki w tym tygodniu.`,
    weekWithChange: (amt, cur, absPct, dir, usualAmt) =>
      `Wydałeś ${amt} ${cur} na codzienne wydatki w tym tygodniu, to o ${absPct}% ${dir} niż zwykle (zwykle około ${usualAmt} ${cur}).`,
    dirBelow: 'mniej',
    dirAbove: 'więcej',
    topRise: (category, pct) => `Wydatki w kategorii ${category} wzrosły o ${pct}%.`,
    safeToSpend: (amt, cur) => `Dziś możesz bezpiecznie wydać ${amt} ${cur}.`,
    payday: (days) => `Do wypłaty: ${days} dni.`,
    shieldItem: (name, absPct, dir) => `${name}: cena może ${dir} o ${absPct}% w przyszłym miesiącu.`,
    dirRise: 'wzrosnąć',
    dirFall: 'spaść',
    restock: (list) => `Kończy się: ${list}.`,
    realChange: (signedPct) => `Pensja po Twojej inflacji: ${signedPct} w ciągu roku.`,
  },
  de: {
    weekOnly: (amt, cur) => `Du hast diese Woche ${amt} ${cur} für alltägliche Ausgaben ausgegeben.`,
    weekWithChange: (amt, cur, absPct, dir, usualAmt) =>
      `Du hast diese Woche ${amt} ${cur} für alltägliche Ausgaben ausgegeben, das sind ${absPct}% ${dir} als üblich (normalerweise etwa ${usualAmt} ${cur}).`,
    dirBelow: 'weniger',
    dirAbove: 'mehr',
    topRise: (category, pct) => `${category} ist um ${pct}% gestiegen.`,
    safeToSpend: (amt, cur) => `Du kannst heute sicher ${amt} ${cur} ausgeben.`,
    payday: (days) => `Gehalt in ${days} Tagen.`,
    shieldItem: (name, absPct, dir) => `${name} könnte im nächsten Monat ${absPct}% ${dir} werden.`,
    dirRise: 'teurer',
    dirFall: 'günstiger',
    restock: (list) => `Vorrat wird knapp: ${list}.`,
    realChange: (signedPct) => `Gehalt nach deiner Inflation: ${signedPct} im Jahresverlauf.`,
  },
  es: {
    weekOnly: (amt, cur) => `Gastaste ${amt} ${cur} en gastos cotidianos esta semana.`,
    weekWithChange: (amt, cur, absPct, dir, usualAmt) =>
      `Gastaste ${amt} ${cur} en gastos cotidianos esta semana, un ${absPct}% ${dir} de lo habitual (normalmente unos ${usualAmt} ${cur}).`,
    dirBelow: 'menos',
    dirAbove: 'más',
    topRise: (category, pct) => `${category} subió un ${pct}%.`,
    safeToSpend: (amt, cur) => `Hoy puedes gastar con seguridad ${amt} ${cur}.`,
    payday: (days) => `Cobro en ${days} días.`,
    shieldItem: (name, absPct, dir) => `${name} podría ${dir} un ${absPct}% el próximo mes.`,
    dirRise: 'subir',
    dirFall: 'bajar',
    restock: (list) => `Se están agotando: ${list}.`,
    realChange: (signedPct) => `Salario tras tu inflación: ${signedPct} en el último año.`,
  },
  fr: {
    weekOnly: (amt, cur) => `Vous avez dépensé ${amt} ${cur} en dépenses courantes cette semaine.`,
    weekWithChange: (amt, cur, absPct, dir, usualAmt) =>
      `Vous avez dépensé ${amt} ${cur} en dépenses courantes cette semaine, soit ${absPct}% de ${dir} que d'habitude (généralement environ ${usualAmt} ${cur}).`,
    dirBelow: 'moins',
    dirAbove: 'plus',
    topRise: (category, pct) => `${category} a augmenté de ${pct}%.`,
    safeToSpend: (amt, cur) => `Vous pouvez dépenser ${amt} ${cur} en toute sécurité aujourd'hui.`,
    payday: (days) => `Prochain salaire dans ${days} jours.`,
    shieldItem: (name, absPct, dir) => `${name} pourrait ${dir} de ${absPct}% le mois prochain.`,
    dirRise: 'augmenter',
    dirFall: 'baisser',
    restock: (list) => `Stock faible : ${list}.`,
    realChange: (signedPct) => `Salaire après votre inflation : ${signedPct} sur l'année.`,
  },
  ru: {
    weekOnly: (amt, cur) => `Вы потратили ${amt} ${cur} на повседневные траты за эту неделю.`,
    weekWithChange: (amt, cur, absPct, dir, usualAmt) =>
      `Вы потратили ${amt} ${cur} на повседневные траты за эту неделю, это на ${absPct}% ${dir} обычного (обычно около ${usualAmt} ${cur}).`,
    dirBelow: 'меньше',
    dirAbove: 'больше',
    topRise: (category, pct) => `${category}: рост на ${pct}%.`,
    safeToSpend: (amt, cur) => `Сегодня можно безопасно потратить ${amt} ${cur}.`,
    payday: (days) => `До зарплаты: ${days} дн.`,
    shieldItem: (name, absPct, dir) => `${name}: цена может ${dir} на ${absPct}% в следующем месяце.`,
    dirRise: 'вырасти',
    dirFall: 'упасть',
    restock: (list) => `Заканчивается: ${list}.`,
    realChange: (signedPct) => `Зарплата с учётом вашей инфляции: ${signedPct} за год.`,
  },
  ua: {
    weekOnly: (amt, cur) => `Ви витратили ${amt} ${cur} на щоденні витрати за цей тиждень.`,
    weekWithChange: (amt, cur, absPct, dir, usualAmt) =>
      `Ви витратили ${amt} ${cur} на щоденні витрати за цей тиждень, це на ${absPct}% ${dir} звичайного (зазвичай близько ${usualAmt} ${cur}).`,
    dirBelow: 'менше',
    dirAbove: 'більше',
    topRise: (category, pct) => `${category}: зростання на ${pct}%.`,
    safeToSpend: (amt, cur) => `Сьогодні можна безпечно витратити ${amt} ${cur}.`,
    payday: (days) => `До зарплати: ${days} дн.`,
    shieldItem: (name, absPct, dir) => `${name}: ціна може ${dir} на ${absPct}% наступного місяця.`,
    dirRise: 'зрости',
    dirFall: 'впасти',
    restock: (list) => `Закінчується: ${list}.`,
    realChange: (signedPct) => `Зарплата з урахуванням вашої інфляції: ${signedPct} за рік.`,
  },
  be: {
    weekOnly: (amt, cur) => `Вы патрацілі ${amt} ${cur} на штодзённыя выдаткі за гэты тыдзень.`,
    weekWithChange: (amt, cur, absPct, dir, usualAmt) =>
      `Вы патрацілі ${amt} ${cur} на штодзённыя выдаткі за гэты тыдзень, гэта на ${absPct}% ${dir} звычайнага (звычайна каля ${usualAmt} ${cur}).`,
    dirBelow: 'менш',
    dirAbove: 'больш',
    topRise: (category, pct) => `${category}: рост на ${pct}%.`,
    safeToSpend: (amt, cur) => `Сёння можна бяспечна патраціць ${amt} ${cur}.`,
    payday: (days) => `Да зарплаты: ${days} дн.`,
    shieldItem: (name, absPct, dir) => `${name}: цана можа ${dir} на ${absPct}% у наступным месяцы.`,
    dirRise: 'вырасці',
    dirFall: 'упасці',
    restock: (list) => `Заканчваецца: ${list}.`,
    realChange: (signedPct) => `Заробак з улікам вашай інфляцыі: ${signedPct} за год.`,
  },
  nl: {
    weekOnly: (amt, cur) => `Je hebt deze week ${amt} ${cur} uitgegeven aan dagelijkse uitgaven.`,
    weekWithChange: (amt, cur, absPct, dir, usualAmt) =>
      `Je hebt deze week ${amt} ${cur} uitgegeven aan dagelijkse uitgaven, dat is ${absPct}% ${dir} dan normaal (meestal ongeveer ${usualAmt} ${cur}).`,
    dirBelow: 'minder',
    dirAbove: 'meer',
    topRise: (category, pct) => `${category} steeg met ${pct}%.`,
    safeToSpend: (amt, cur) => `Je kunt vandaag veilig ${amt} ${cur} uitgeven.`,
    payday: (days) => `Salaris over ${days} dagen.`,
    shieldItem: (name, absPct, dir) => `${name} kan volgende maand ${absPct}% ${dir} worden.`,
    dirRise: 'duurder',
    dirFall: 'goedkoper',
    restock: (list) => `Bijna op: ${list}.`,
    realChange: (signedPct) => `Salaris na jouw inflatie: ${signedPct} over het jaar.`,
  },
};

/**
 * Deterministic fallback digest text, used when the LLM narration is
 * unavailable or fails the faithfulness check. Only includes facts that are
 * present, in a fixed order: week total (+ change vs. usual), top rise, safe
 * to spend today (+ payday), shield item, restock list, real salary.
 * Unknown languages fall back to English.
 */
export function fallbackText(f: DigestFacts, lang: string): string {
  const t = TEMPLATES[lang] ?? TEMPLATES.en;
  const sentences: string[] = [];

  const weekAmt = Math.round(f.weekTotal);
  // changePct is only ever non-null when usualWeek is also non-null (see
  // assembleDigestFacts) — the direction word describes THIS week's amount,
  // never usualAmt, which is stated plainly alongside it instead.
  if (f.changePct !== null && f.changePct !== 0 && f.usualWeek !== null) {
    const dir = f.changePct < 0 ? t.dirBelow : t.dirAbove;
    const usualAmt = Math.round(f.usualWeek);
    sentences.push(t.weekWithChange(weekAmt, f.currency, Math.abs(f.changePct), dir, usualAmt));
  } else {
    sentences.push(t.weekOnly(weekAmt, f.currency));
  }

  if (f.topRise !== null) {
    sentences.push(t.topRise(f.topRise.category, f.topRise.changePct));
  }

  if (f.safeToSpendToday !== null) {
    sentences.push(t.safeToSpend(Math.round(f.safeToSpendToday), f.currency));
  }

  if (f.daysToIncome !== null) {
    sentences.push(t.payday(f.daysToIncome));
  }

  if (f.shieldItem !== null) {
    const dir = f.shieldItem.monthlyChangePct < 0 ? t.dirFall : t.dirRise;
    sentences.push(t.shieldItem(f.shieldItem.name, Math.abs(f.shieldItem.monthlyChangePct), dir));
  }

  if (f.restock.length > 0) {
    sentences.push(t.restock(f.restock.join(', ')));
  }

  if (f.realChangePct !== null) {
    const signedPct = `${f.realChangePct > 0 ? '+' : ''}${f.realChangePct}%`;
    sentences.push(t.realChange(signedPct));
  }

  return sentences.join(' ');
}

// Spaces / NBSP / narrow-NBSP that sit BETWEEN two digits are a thousands
// grouping mark ("1 234"), not a word boundary — collapse them so the number
// regex below sees one token. A single replace pass leaves a "bridge" digit
// between two matches unmerged when 3+ groups are chained ("1 234 567"), so
// this reapplies until stable.
function collapseDigitSeparatedSpaces(text: string): string {
  const sepPattern = /(\d)[ \u00a0\u202f](\d)/g;
  let prev = text;
  let cur = text.replace(sepPattern, '$1$2');
  while (cur !== prev) {
    prev = cur;
    cur = cur.replace(sepPattern, '$1$2');
  }
  return cur;
}

/**
 * Converts one already-matched `\d+(?:[.,]\d+)*` token, using the same
 * separator-disambiguation rules as the mobile `parseMonthlyAmount`: both
 * separator characters present → the later one is the decimal point (the
 * earlier is a thousands mark); a single separator followed by exactly 3
 * digits → thousands mark; otherwise → decimal point.
 */
function parseNumberToken(raw: string): number {
  const hasDot = raw.includes('.');
  const hasComma = raw.includes(',');

  if (hasDot && hasComma) {
    const lastDot = raw.lastIndexOf('.');
    const lastComma = raw.lastIndexOf(',');
    const decimalChar = lastComma > lastDot ? ',' : '.';
    const otherChar = decimalChar === ',' ? '.' : ',';
    const decimalIdx = decimalChar === ',' ? lastComma : lastDot;
    const integerPart = raw.slice(0, decimalIdx).split(otherChar).join('');
    const decimalPart = raw.slice(decimalIdx + 1);
    return Number(`${integerPart}.${decimalPart}`);
  }

  if (hasDot || hasComma) {
    const sep = hasDot ? '.' : ',';
    const parts = raw.split(sep);
    if (parts.length > 2) {
      // Same separator repeated: a thousands grouping ("1.234.567").
      return Number(parts.join(''));
    }
    const [whole, frac] = parts;
    // A single occurrence followed by exactly 3 digits is a thousands
    // separator ("8.400"), not a decimal point.
    return /^\d{3}$/.test(frac) ? Number(whole + frac) : Number(`${whole}.${frac}`);
  }

  return Number(raw);
}

/**
 * Every number found in free text, in reading order. `%` and currency signs
 * are never consumed by the digit match, so they need no special handling.
 */
export function extractNumbers(text: string): number[] {
  const collapsed = collapseDigitSeparatedSpaces(text);
  const matches = collapsed.match(/\d+(?:[.,]\d+)*/g) ?? [];
  return matches.map(parseNumberToken).filter((n) => Number.isFinite(n));
}

/**
 * Every number an LLM narration is allowed to say for these facts: each
 * present numeric fact, the constants 7 (a week) and 1, and — since a
 * narrator will repeat a product/category name verbatim — every number
 * embedded in `shieldItem.name`, `topRise.category` and each `restock` name
 * (e.g. "Mleko 3,2% 1L").
 */
export function allowedNumbers(f: DigestFacts): number[] {
  const nums: number[] = [f.weekTotal, 7, 1, f.restock.length];

  if (f.usualWeek !== null) nums.push(f.usualWeek);
  if (f.changePct !== null) nums.push(Math.abs(f.changePct));
  if (f.topRise !== null) {
    nums.push(f.topRise.changePct, ...extractNumbers(f.topRise.category));
  }
  if (f.safeToSpendToday !== null) nums.push(f.safeToSpendToday);
  if (f.daysToIncome !== null) nums.push(f.daysToIncome);
  if (f.shieldItem !== null) {
    nums.push(Math.abs(f.shieldItem.monthlyChangePct), ...extractNumbers(f.shieldItem.name));
  }
  for (const name of f.restock) {
    nums.push(...extractNumbers(name));
  }
  if (f.realChangePct !== null) nums.push(Math.abs(f.realChangePct));

  return nums;
}

/** True iff every number in `text` is within 0.5 of some allowed fact number. */
export function isFaithful(text: string, f: DigestFacts): boolean {
  const allowed = allowedNumbers(f);
  const found = extractNumbers(text);
  return found.every((n) => allowed.some((a) => Math.abs(a - n) <= 0.5));
}

/** WhatsApp template locale: ua -> uk, be -> ru, others unchanged, unknown -> en. */
export function templateLanguage(lang: string): string {
  if (lang === 'ua') return 'uk';
  if (lang === 'be') return 'ru';
  return DIGEST_LANGS.includes(lang) ? lang : 'en';
}
