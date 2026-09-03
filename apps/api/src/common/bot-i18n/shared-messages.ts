/**
 * Bot-facing i18n shared across telegram/whatsapp/slack (ABA tech-debt
 * bot-i18n-triplication). Canonical markup for bold/code spans is HTML
 * (`<b>`/`<code>`, matching Telegram's own `parse_mode: HTML` convention);
 * `createBotT(messages, { markup: 'markdown' })` rewrites those tags to
 * WhatsApp/Slack's `*bold*` / `` `code` `` syntax at read time, so the two
 * markdown-based bots render byte-identical output to before this refactor.
 *
 * Only messages that are identical (post markup-conversion) across the bots
 * that use them live here. Genuinely platform-specific copy (setup
 * instructions, help text with different command syntax, etc.) stays in
 * each module's own `helpers/i18n.ts` as a `platformMessages` override,
 * spread on top of `sharedMessages` — see any of the three files for the
 * pattern. Do not add a 4th near-duplicate; extend this file instead.
 */

import type { EditableItem } from '../utils/receipt-item-edit';

export type BotMarkup = 'html' | 'markdown';

export interface BotTOptions {
  markup: BotMarkup;
  /** Params merged in on every call, e.g. `{ platform: 'Telegram' }` — lets a
   * shared message carry a `{{platform}}` placeholder without every call
   * site having to pass it explicitly. Caller-supplied params win on conflict. */
  defaultParams?: Record<string, string>;
}

function convertMarkup(text: string, markup: BotMarkup): string {
  if (markup === 'html') return text;
  return text.replace(/<b>(.*?)<\/b>/g, '*$1*').replace(/<code>(.*?)<\/code>/g, '`$1`');
}

export function createBotT(messages: Record<string, Record<string, string>>, options: BotTOptions) {
  const { markup, defaultParams } = options;
  return function t(key: string, lang?: string, params?: Record<string, string>): string {
    const entry = messages[key];
    if (!entry) return key;
    let text = entry[lang || 'en'] || entry.en || key;
    text = convertMarkup(text, markup);
    const merged = defaultParams || params ? { ...defaultParams, ...params } : undefined;
    if (merged) {
      for (const [k, v] of Object.entries(merged)) {
        text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
      }
    }
    return text;
  };
}

export interface CategorySplitLineItem {
  categoryName: string;
  amount: number;
}

/**
 * One line reporting how a receipt's own line items split across categories
 * (receipt category autosplit). Empty string when there is nothing to
 * report — an unsplit receipt (categorySplits: []) must produce a
 * byte-identical reply to before this feature existed, the same rule the
 * price-check line (buildPriceCheckLine) already follows.
 */
export function buildCategorySplitLine(
  t: (key: string, lang?: string, params?: Record<string, string>) => string,
  splits: CategorySplitLineItem[],
  currencyCode: string,
  lang?: string,
): string {
  if (!splits || splits.length === 0) return '';
  const list = splits
    .map((s) => `${s.categoryName} ${s.amount.toFixed(2)} ${currencyCode}`)
    .join(', ');
  return t('categorySplit', lang, { list });
}

/**
 * The numbered line list the bot item-edit mode works on, plus a "lines add up to
 * X, receipt says Y" footer — that gap is the only signal the user has that a
 * misread is still there.
 *
 * Emits plain text with NO markup tags: descriptions come from OCR and can contain
 * `&` or `<`, which would break Telegram's `parse_mode: 'HTML'`, so the Telegram
 * call site escapes this whole block exactly as it already does for
 * `buildCategorySplitLine`.
 */
export function buildItemListBlock(
  t: (key: string, lang?: string, params?: Record<string, string>) => string,
  items: EditableItem[],
  currencyCode: string,
  total: number,
  lang?: string,
): string {
  const money = (value: number) => `${value.toFixed(2)} ${currencyCode}`;
  const sum = items.reduce(
    (acc, item) => acc + (Number.isFinite(item.totalPrice) ? item.totalPrice : 0),
    0,
  );
  const sumLine = t('itemSumLine', lang, { sum: money(sum), total: money(total) });

  if (items.length === 0) return `${t('itemsEmpty', lang)}\n${sumLine}`;

  const lines = items.map((item, index) => {
    const quantity = item.quantity && item.quantity > 1 ? `${item.quantity}\u00d7 ` : '';
    return `${index + 1}. ${quantity}${item.description} \u2014 ${money(item.totalPrice)}`;
  });
  return `${lines.join('\n')}\n${sumLine}`;
}

export const sharedMessages: Record<string, Record<string, string>> = {
  editItems: {
    en: '\u270f\ufe0f Items',
    ru: '\u270f\ufe0f \u041f\u043e\u0437\u0438\u0446\u0438\u0438',
    ua: '\u270f\ufe0f \u041f\u043e\u0437\u0438\u0446\u0456\u0457',
    de: '\u270f\ufe0f Positionen',
    es: '\u270f\ufe0f L\u00edneas',
    fr: '\u270f\ufe0f Lignes',
    pl: '\u270f\ufe0f Pozycje',
    be: '\u270f\ufe0f \u041f\u0430\u0437\u0456\u0446\u044b\u0456',
    nl: '\u270f\ufe0f Regels',
  },
  editReceipt: {
    en: '\u270f\ufe0f Edit',
    ru: '\u270f\ufe0f \u041f\u0440\u0430\u0432\u043a\u0430',
    ua: '\u270f\ufe0f \u041f\u0440\u0430\u0432\u043a\u0430',
    de: '\u270f\ufe0f Bearbeiten',
    es: '\u270f\ufe0f Editar',
    fr: '\u270f\ufe0f Modifier',
    pl: '\u270f\ufe0f Popraw',
    be: '\u270f\ufe0f \u041f\u0440\u0430\u0432\u043a\u0430',
    nl: '\u270f\ufe0f Bewerken',
  },
  editReceiptPrompt: {
    en: 'What would you like to fix?',
    ru: '\u0427\u0442\u043e \u043f\u043e\u043f\u0440\u0430\u0432\u0438\u0442\u044c?',
    ua: '\u0429\u043e \u0432\u0438\u043f\u0440\u0430\u0432\u0438\u0442\u0438?',
    de: 'Was m\u00f6chtest du korrigieren?',
    es: '\u00bfQu\u00e9 quieres corregir?',
    fr: 'Que voulez-vous corriger ?',
    pl: 'Co poprawi\u0107?',
    be: '\u0428\u0442\u043e \u0432\u044b\u043f\u0440\u0430\u0432\u0456\u0446\u044c?',
    nl: 'Wat wil je aanpassen?',
  },
  itemEditHint: {
    en: '\u270f\ufe0f Send one correction per message:\n<code>3 = 14.69</code> \u2014 price of line 3\n<code>3: Rye bread</code> \u2014 rename line 3\n<code>3 -</code> \u2014 delete line 3\n<code>+ Bread 5.99</code> \u2014 add a line\n<code>= 233.98</code> \u2014 receipt total\nWhen you are done, tap \u201cAdd expense\u201d.',
    ru: '\u270f\ufe0f \u041e\u0442\u043f\u0440\u0430\u0432\u043b\u044f\u0439\u0442\u0435 \u043f\u043e \u043e\u0434\u043d\u043e\u0439 \u043f\u0440\u0430\u0432\u043a\u0435 \u0432 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0438:\n<code>3 = 14,69</code> \u2014 \u0446\u0435\u043d\u0430 \u0441\u0442\u0440\u043e\u043a\u0438 3\n<code>3: \u0425\u043b\u0435\u0431</code> \u2014 \u043f\u0435\u0440\u0435\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u0442\u044c \u0441\u0442\u0440\u043e\u043a\u0443 3\n<code>3 -</code> \u2014 \u0443\u0434\u0430\u043b\u0438\u0442\u044c \u0441\u0442\u0440\u043e\u043a\u0443 3\n<code>+ \u0425\u043b\u0435\u0431 5,99</code> \u2014 \u0434\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0441\u0442\u0440\u043e\u043a\u0443\n<code>= 233,98</code> \u2014 \u0438\u0442\u043e\u0433 \u0447\u0435\u043a\u0430\n\u041a\u043e\u0433\u0434\u0430 \u0437\u0430\u043a\u043e\u043d\u0447\u0438\u0442\u0435 \u2014 \u043d\u0430\u0436\u043c\u0438\u0442\u0435 \u00ab\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0440\u0430\u0441\u0445\u043e\u0434\u00bb.',
    ua: '\u270f\ufe0f \u041d\u0430\u0434\u0441\u0438\u043b\u0430\u0439\u0442\u0435 \u043f\u043e \u043e\u0434\u043d\u0456\u0439 \u043f\u0440\u0430\u0432\u0446\u0456 \u0432 \u043f\u043e\u0432\u0456\u0434\u043e\u043c\u043b\u0435\u043d\u043d\u0456:\n<code>3 = 14,69</code> \u2014 \u0446\u0456\u043d\u0430 \u0440\u044f\u0434\u043a\u0430 3\n<code>3: \u0425\u043b\u0456\u0431</code> \u2014 \u043f\u0435\u0440\u0435\u0439\u043c\u0435\u043d\u0443\u0432\u0430\u0442\u0438 \u0440\u044f\u0434\u043e\u043a 3\n<code>3 -</code> \u2014 \u0432\u0438\u0434\u0430\u043b\u0438\u0442\u0438 \u0440\u044f\u0434\u043e\u043a 3\n<code>+ \u0425\u043b\u0456\u0431 5,99</code> \u2014 \u0434\u043e\u0434\u0430\u0442\u0438 \u0440\u044f\u0434\u043e\u043a\n<code>= 233,98</code> \u2014 \u0456\u0442\u043e\u0433 \u0447\u0435\u043a\u0430\n\u041a\u043e\u043b\u0438 \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u0435 \u2014 \u043d\u0430\u0442\u0438\u0441\u043d\u0456\u0442\u044c \u00ab\u0414\u043e\u0434\u0430\u0442\u0438 \u0432\u0438\u0442\u0440\u0430\u0442\u0443\u00bb.',
    de: '\u270f\ufe0f Sende eine Korrektur pro Nachricht:\n<code>3 = 14,69</code> \u2014 Preis von Zeile 3\n<code>3: Roggenbrot</code> \u2014 Zeile 3 umbenennen\n<code>3 -</code> \u2014 Zeile 3 l\u00f6schen\n<code>+ Brot 5,99</code> \u2014 Zeile hinzuf\u00fcgen\n<code>= 233,98</code> \u2014 Belegsumme\nWenn du fertig bist, tippe auf \u201eAusgabe hinzuf\u00fcgen\u201c.',
    es: '\u270f\ufe0f Env\u00eda una correcci\u00f3n por mensaje:\n<code>3 = 14,69</code> \u2014 precio de la l\u00ednea 3\n<code>3: Pan de centeno</code> \u2014 renombrar la l\u00ednea 3\n<code>3 -</code> \u2014 borrar la l\u00ednea 3\n<code>+ Pan 5,99</code> \u2014 a\u00f1adir una l\u00ednea\n<code>= 233,98</code> \u2014 total del recibo\nCuando termines, toca \u00abA\u00f1adir gasto\u00bb.',
    fr: '\u270f\ufe0f Envoyez une correction par message :\n<code>3 = 14,69</code> \u2014 prix de la ligne 3\n<code>3: Pain de seigle</code> \u2014 renommer la ligne 3\n<code>3 -</code> \u2014 supprimer la ligne 3\n<code>+ Pain 5,99</code> \u2014 ajouter une ligne\n<code>= 233,98</code> \u2014 total du ticket\nQuand vous avez fini, appuyez sur \u00ab Ajouter la d\u00e9pense \u00bb.',
    pl: '\u270f\ufe0f Wysy\u0142aj po jednej poprawce w wiadomo\u015bci:\n<code>3 = 14,69</code> \u2014 cena pozycji 3\n<code>3: Chleb \u017cytni</code> \u2014 zmie\u0144 nazw\u0119 pozycji 3\n<code>3 -</code> \u2014 usu\u0144 pozycj\u0119 3\n<code>+ Chleb 5,99</code> \u2014 dodaj pozycj\u0119\n<code>= 233,98</code> \u2014 suma paragonu\nGdy sko\u0144czysz, dotknij \u201eDodaj wydatek\u201d.',
    be: '\u270f\ufe0f \u0410\u0434\u043f\u0440\u0430\u045e\u043b\u044f\u0439\u0446\u0435 \u043f\u0430 \u0430\u0434\u043d\u043e\u0439 \u043f\u0440\u0430\u0432\u0446\u044b \u045e \u043f\u0430\u0432\u0435\u0434\u0430\u043c\u043b\u0435\u043d\u043d\u0456:\n<code>3 = 14,69</code> \u2014 \u0446\u0430\u043d\u0430 \u0440\u0430\u0434\u043a\u0430 3\n<code>3: \u0425\u043b\u0435\u0431</code> \u2014 \u043f\u0435\u0440\u0430\u0439\u043c\u0435\u043d\u0430\u0432\u0430\u0446\u044c \u0440\u0430\u0434\u043e\u043a 3\n<code>3 -</code> \u2014 \u0432\u044b\u0434\u0430\u043b\u0456\u0446\u044c \u0440\u0430\u0434\u043e\u043a 3\n<code>+ \u0425\u043b\u0435\u0431 5,99</code> \u2014 \u0434\u0430\u0434\u0430\u0446\u044c \u0440\u0430\u0434\u043e\u043a\n<code>= 233,98</code> \u2014 \u0456\u0442\u043e\u0433 \u0447\u044d\u043a\u0430\n\u041a\u0430\u043b\u0456 \u0441\u043a\u043e\u043d\u0447\u044b\u0446\u0435 \u2014 \u043d\u0430\u0446\u0456\u0441\u043d\u0456\u0446\u0435 \u00ab\u0414\u0430\u0434\u0430\u0446\u044c \u0432\u044b\u0434\u0430\u0442\u043a\u0456\u00bb.',
    nl: '\u270f\ufe0f Stuur \u00e9\u00e9n correctie per bericht:\n<code>3 = 14,69</code> \u2014 prijs van regel 3\n<code>3: Roggebrood</code> \u2014 regel 3 hernoemen\n<code>3 -</code> \u2014 regel 3 verwijderen\n<code>+ Brood 5,99</code> \u2014 regel toevoegen\n<code>= 233,98</code> \u2014 bontotaal\nAls je klaar bent, tik je op \u201eUitgave toevoegen\u201d.',
  },
  itemSumLine: {
    en: 'Lines: {{sum}} \u00b7 receipt total: {{total}}',
    ru: '\u0421\u0443\u043c\u043c\u0430 \u043f\u043e\u0437\u0438\u0446\u0438\u0439: {{sum}} \u00b7 \u0438\u0442\u043e\u0433 \u0447\u0435\u043a\u0430: {{total}}',
    ua: '\u0421\u0443\u043c\u0430 \u043f\u043e\u0437\u0438\u0446\u0456\u0439: {{sum}} \u00b7 \u0456\u0442\u043e\u0433 \u0447\u0435\u043a\u0430: {{total}}',
    de: 'Positionen: {{sum}} \u00b7 Belegsumme: {{total}}',
    es: 'L\u00edneas: {{sum}} \u00b7 total del recibo: {{total}}',
    fr: 'Lignes : {{sum}} \u00b7 total du ticket : {{total}}',
    pl: 'Pozycje: {{sum}} \u00b7 suma paragonu: {{total}}',
    be: '\u0421\u0443\u043c\u0430 \u043f\u0430\u0437\u0456\u0446\u044b\u0439: {{sum}} \u00b7 \u0456\u0442\u043e\u0433 \u0447\u044d\u043a\u0430: {{total}}',
    nl: 'Regels: {{sum}} \u00b7 bontotaal: {{total}}',
  },
  itemsEmpty: {
    en: 'No lines left. Add one with: + Bread 5.99',
    ru: '\u041f\u043e\u0437\u0438\u0446\u0438\u0439 \u043d\u0435 \u043e\u0441\u0442\u0430\u043b\u043e\u0441\u044c. \u0414\u043e\u0431\u0430\u0432\u044c\u0442\u0435 \u0442\u0430\u043a: + \u0425\u043b\u0435\u0431 5,99',
    ua: '\u041f\u043e\u0437\u0438\u0446\u0456\u0439 \u043d\u0435 \u0437\u0430\u043b\u0438\u0448\u0438\u043b\u043e\u0441\u044f. \u0414\u043e\u0434\u0430\u0439\u0442\u0435 \u0442\u0430\u043a: + \u0425\u043b\u0456\u0431 5,99',
    de: 'Keine Positionen mehr. So f\u00fcgst du eine hinzu: + Brot 5,99',
    es: 'No quedan l\u00edneas. A\u00f1ade una as\u00ed: + Pan 5,99',
    fr: 'Plus aucune ligne. Ajoutez-en une : + Pain 5,99',
    pl: 'Nie zosta\u0142y \u017cadne pozycje. Dodaj tak: + Chleb 5,99',
    be: '\u041f\u0430\u0437\u0456\u0446\u044b\u0439 \u043d\u0435 \u0437\u0430\u0441\u0442\u0430\u043b\u043e\u0441\u044f. \u0414\u0430\u0434\u0430\u0439\u0446\u0435 \u0442\u0430\u043a: + \u0425\u043b\u0435\u0431 5,99',
    nl: 'Geen regels meer. Voeg er een toe: + Brood 5,99',
  },
  itemsUpdated: {
    en: '\u2705 Updated',
    ru: '\u2705 \u041e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u043e',
    ua: '\u2705 \u041e\u043d\u043e\u0432\u043b\u0435\u043d\u043e',
    de: '\u2705 Aktualisiert',
    es: '\u2705 Actualizado',
    fr: '\u2705 Mis \u00e0 jour',
    pl: '\u2705 Zaktualizowano',
    be: '\u2705 \u0410\u0431\u043d\u043e\u045e\u043b\u0435\u043d\u0430',
    nl: '\u2705 Bijgewerkt',
  },
  itemEditInvalid: {
    en: '\u274c I did not understand that.',
    ru: '\u274c \u041d\u0435 \u043f\u043e\u043d\u044f\u043b \u043a\u043e\u043c\u0430\u043d\u0434\u0443.',
    ua: '\u274c \u041d\u0435 \u0437\u0440\u043e\u0437\u0443\u043c\u0456\u0432 \u043a\u043e\u043c\u0430\u043d\u0434\u0443.',
    de: '\u274c Das habe ich nicht verstanden.',
    es: '\u274c No he entendido eso.',
    fr: '\u274c Je n\u2019ai pas compris.',
    pl: '\u274c Nie zrozumia\u0142em polecenia.',
    be: '\u274c \u041d\u0435 \u0437\u0440\u0430\u0437\u1d43\u043c\u0435\u045e \u043a\u0430\u043c\u0430\u043d\u0434\u0443.',
    nl: '\u274c Dat begreep ik niet.',
  },
  itemEditNoSuchLine: {
    en: '\u274c There is no line {{index}} on this receipt.',
    ru: '\u274c \u0421\u0442\u0440\u043e\u043a\u0438 {{index}} \u0432 \u044d\u0442\u043e\u043c \u0447\u0435\u043a\u0435 \u043d\u0435\u0442.',
    ua: '\u274c \u0420\u044f\u0434\u043a\u0430 {{index}} \u0443 \u0446\u044c\u043e\u043c\u0443 \u0447\u0435\u043a\u0443 \u043d\u0435\u043c\u0430\u0454.',
    de: '\u274c Zeile {{index}} gibt es auf diesem Beleg nicht.',
    es: '\u274c En este recibo no hay l\u00ednea {{index}}.',
    fr: '\u274c Il n\u2019y a pas de ligne {{index}} sur ce ticket.',
    pl: '\u274c Na tym paragonie nie ma pozycji {{index}}.',
    be: '\u274c \u0420\u0430\u0434\u043a\u0430 {{index}} \u0443 \u0433\u044d\u0442\u044b\u043c \u0447\u044d\u043a\u0443 \u043d\u044f\u043c\u0430.',
    nl: '\u274c Regel {{index}} staat niet op dit bonnetje.',
  },
  itemEditInvalidAmount: {
    en: '\u274c The price has to be greater than zero.',
    ru: '\u274c \u0426\u0435\u043d\u0430 \u0434\u043e\u043b\u0436\u043d\u0430 \u0431\u044b\u0442\u044c \u0431\u043e\u043b\u044c\u0448\u0435 \u043d\u0443\u043b\u044f.',
    ua: '\u274c \u0426\u0456\u043d\u0430 \u043c\u0443\u0441\u0438\u0442\u044c \u0431\u0443\u0442\u0438 \u0431\u0456\u043b\u044c\u0448\u0435 \u043d\u0443\u043b\u044f.',
    de: '\u274c Der Preis muss gr\u00f6\u00dfer als null sein.',
    es: '\u274c El precio tiene que ser mayor que cero.',
    fr: '\u274c Le prix doit \u00eatre sup\u00e9rieur \u00e0 z\u00e9ro.',
    pl: '\u274c Cena musi by\u0107 wi\u0119ksza od zera.',
    be: '\u274c \u0426\u0430\u043d\u0430 \u043c\u0443\u0441\u0456\u0446\u044c \u0431\u044b\u0446\u044c \u0431\u043e\u043b\u044c\u0448 \u0437\u0430 \u043d\u0443\u043b\u044c.',
    nl: '\u274c De prijs moet groter zijn dan nul.',
  },
  itemEditEmptyDescription: {
    en: '\u274c The name cannot be empty.',
    ru: '\u274c \u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u043d\u0435 \u043c\u043e\u0436\u0435\u0442 \u0431\u044b\u0442\u044c \u043f\u0443\u0441\u0442\u044b\u043c.',
    ua: '\u274c \u041d\u0430\u0437\u0432\u0430 \u043d\u0435 \u043c\u043e\u0436\u0435 \u0431\u0443\u0442\u0438 \u043f\u043e\u0440\u043e\u0436\u043d\u044c\u043e\u044e.',
    de: '\u274c Der Name darf nicht leer sein.',
    es: '\u274c El nombre no puede estar vac\u00edo.',
    fr: '\u274c Le nom ne peut pas \u00eatre vide.',
    pl: '\u274c Nazwa nie mo\u017ce by\u0107 pusta.',
    be: '\u274c \u041d\u0430\u0437\u0432\u0430 \u043d\u0435 \u043c\u043e\u0436\u0430 \u0431\u044b\u0446\u044c \u043f\u0443\u0441\u0442\u043e\u0439.',
    nl: '\u274c De naam mag niet leeg zijn.',
  },
  aiLimitReached: {
    en: '⚠️ AI request limit reached. Upgrade your subscription for more AI features.',
    ru: '⚠️ Лимит AI-запросов исчерпан. Обновите подписку для большего количества AI-функций.',
    ua: '⚠️ Ліміт AI-запитів вичерпано. Оновіть підписку для більшої кількості AI-функцій.',
    de: '⚠️ AI-Anfragelimit erreicht. Upgraden Sie Ihr Abonnement für mehr AI-Funktionen.',
    es: '⚠️ Límite de solicitudes AI alcanzado. Mejora tu suscripción para más funciones AI.',
    fr: '⚠️ Limite de requêtes AI atteinte. Améliorez votre abonnement pour plus de fonctionnalités AI.',
    pl: '⚠️ Limit zapytań AI osiągnięty. Uaktualnij subskrypcję, aby uzyskać więcej funkcji AI.',
    be: '⚠️ Ліміт AI-запытаў вычарпаны. Абнавіце падпіску для большай колькасці AI-функцый.',
    nl: '⚠️ AI-verzoeklimiet bereikt. Upgrade je abonnement voor meer AI-functies.',
  },
  somethingWrong: {
    en: 'Something went wrong. Please try again later.',
    ru: 'Что-то пошло не так. Попробуйте позже.',
    ua: 'Щось пішло не так. Спробуйте пізніше.',
    de: 'Etwas ist schiefgelaufen. Bitte versuchen Sie es später erneut.',
    es: 'Algo salió mal. Inténtalo de nuevo más tarde.',
    fr: 'Quelque chose s\'est mal passé. Veuillez réessayer plus tard.',
    pl: 'Coś poszło nie tak. Spróbuj ponownie później.',
    be: 'Нешта пайшло не так. Паспрабуйце пазней.',
    nl: 'Er is iets misgegaan. Probeer het later opnieuw.',
  },
  speechNotRecognized: {
    en: 'Could not recognize speech. Please try again.',
    ru: 'Не удалось распознать речь. Попробуйте ещё раз.',
    ua: 'Не вдалося розпізнати мову. Спробуйте ще раз.',
    de: 'Sprache konnte nicht erkannt werden. Bitte versuchen Sie es erneut.',
    es: 'No se pudo reconocer el habla. Inténtalo de nuevo.',
    fr: 'Impossible de reconnaître la parole. Veuillez réessayer.',
    pl: 'Nie udało się rozpoznać mowy. Spróbuj ponownie.',
    be: 'Не атрымалася распазнаць маўленне. Паспрабуйце яшчэ раз.',
    nl: 'Spraak kon niet worden herkend. Probeer het opnieuw.',
  },
  receiptScanFailed: {
    en: '❌ Could not scan the receipt. Please try again or add the expense manually.',
    ru: '❌ Не удалось отсканировать чек. Попробуйте ещё раз или добавьте расход вручную.',
    ua: '❌ Не вдалося відсканувати чек. Спробуйте ще раз або додайте витрату вручну.',
    de: '❌ Der Beleg konnte nicht gescannt werden. Bitte versuchen Sie es erneut oder fügen Sie die Ausgabe manuell hinzu.',
    es: '❌ No se pudo escanear el recibo. Inténtalo de nuevo o agrega el gasto manualmente.',
    fr: '❌ Impossible de scanner le reçu. Veuillez réessayer ou ajouter la dépense manuellement.',
    pl: '❌ Nie udało się zeskanować paragonu. Spróbuj ponownie lub dodaj wydatek ręcznie.',
    be: '❌ Не атрымалася адсканаваць чэк. Паспрабуйце яшчэ раз або дадайце выдатак уручную.',
    nl: '❌ De bon kon niet worden gescand. Probeer het opnieuw of voeg de uitgave handmatig toe.',
  },
  voiceFailed: {
    en: '❌ Could not process the voice message. Please try again.',
    ru: '❌ Не удалось обработать голосовое сообщение. Попробуйте ещё раз.',
    ua: '❌ Не вдалося обробити голосове повідомлення. Спробуйте ще раз.',
    de: '❌ Die Sprachnachricht konnte nicht verarbeitet werden. Bitte versuchen Sie es erneut.',
    es: '❌ No se pudo procesar el mensaje de voz. Inténtalo de nuevo.',
    fr: '❌ Impossible de traiter le message vocal. Veuillez réessayer.',
    pl: '❌ Nie udało się przetworzyć wiadomości głosowej. Spróbuj ponownie.',
    be: '❌ Не атрымалася апрацаваць галасавое паведамленне. Паспрабуйце яшчэ раз.',
    nl: '❌ Het spraakbericht kon niet worden verwerkt. Probeer het opnieuw.',
  },
  receiptScanned: {
    en: '📄 <b>Receipt scanned</b>',
    ru: '📄 <b>Чек отсканирован</b>',
    ua: '📄 <b>Чек відскановано</b>',
    de: '📄 <b>Beleg gescannt</b>',
    es: '📄 <b>Recibo escaneado</b>',
    fr: '📄 <b>Reçu scanné</b>',
    pl: '📄 <b>Paragon zeskanowany</b>',
    be: '📄 <b>Чэк адсканаваны</b>',
    nl: '📄 <b>Bon gescand</b>',
  },
  priceCheckSummary: {
    en: '⚠️ Above your usual price — items: {{count}}, difference: about {{amount}}. Worth checking the receipt.',
    ru: '⚠️ Дороже обычного — товаров: {{count}}, разница: около {{amount}}. Стоит проверить чек.',
    ua: '⚠️ Дорожче, ніж зазвичай — товарів: {{count}}, різниця: приблизно {{amount}}. Варто перевірити чек.',
    de: '⚠️ Teurer als üblich — Artikel: {{count}}, Differenz: etwa {{amount}}. Es lohnt sich, den Beleg zu prüfen.',
    es: '⚠️ Más caro de lo habitual — artículos: {{count}}, diferencia: unos {{amount}}. Vale la pena revisar el recibo.',
    fr: '⚠️ Plus cher que d\'habitude — articles : {{count}}, différence : environ {{amount}}. Mieux vaut vérifier le reçu.',
    pl: '⚠️ Drożej niż zwykle — pozycje: {{count}}, różnica: około {{amount}}. Warto sprawdzić paragon.',
    be: '⚠️ Даражэй, чым звычайна — тавараў: {{count}}, розніца: прыблізна {{amount}}. Варта праверыць чэк.',
    nl: '⚠️ Duurder dan gebruikelijk — artikelen: {{count}}, verschil: ongeveer {{amount}}. Het is de moeite waard om de bon te controleren.',
  },
  categorySplit: {
    en: '🗂️ Split across categories: {{list}}',
    ru: '🗂️ Разбивка по категориям: {{list}}',
    ua: '🗂️ Розподіл за категоріями: {{list}}',
    de: '🗂️ Aufteilung nach Kategorien: {{list}}',
    es: '🗂️ Desglose por categorías: {{list}}',
    fr: '🗂️ Répartition par catégories : {{list}}',
    pl: '🗂️ Podział na kategorie: {{list}}',
    be: '🗂️ Разбіўка па катэгорыях: {{list}}',
    nl: '🗂️ Verdeling over categorieën: {{list}}',
  },
  confirm: {
    en: '✅ Confirm',
    ru: '✅ Подтвердить',
    ua: '✅ Підтвердити',
    de: '✅ Bestätigen',
    es: '✅ Confirmar',
    fr: '✅ Confirmer',
    pl: '✅ Potwierdź',
    be: '✅ Пацвердзіць',
    nl: '✅ Bevestigen',
  },
  cancel: {
    en: '❌ Cancel',
    ru: '❌ Отмена',
    ua: '❌ Скасувати',
    de: '❌ Abbrechen',
    es: '❌ Cancelar',
    fr: '❌ Annuler',
    pl: '❌ Anuluj',
    be: '❌ Адмяніць',
    nl: '❌ Annuleren',
  },
  addExpense: {
    en: '✅ Add expense',
    ru: '✅ Добавить расход',
    ua: '✅ Додати витрату',
    de: '✅ Ausgabe hinzufügen',
    es: '✅ Agregar gasto',
    fr: '✅ Ajouter dépense',
    pl: '✅ Dodaj wydatek',
    be: '✅ Дадаць выдатак',
    nl: '✅ Uitgave toevoegen',
  },
  expenseCreated: {
    en: '✅ Expense created',
    ru: '✅ Расход создан',
    ua: '✅ Витрату створено',
    de: '✅ Ausgabe erstellt',
    es: '✅ Gasto creado',
    fr: '✅ Dépense créée',
    pl: '✅ Wydatek utworzony',
    be: '✅ Выдатак створаны',
    nl: '✅ Uitgave aangemaakt',
  },
  incomeCreated: {
    en: '✅ Income added',
    ru: '✅ Доход добавлен',
    ua: '✅ Дохід додано',
    de: '✅ Einnahme hinzugefügt',
    es: '✅ Ingreso agregado',
    fr: '✅ Revenu ajouté',
    pl: '✅ Dochód dodany',
    be: '✅ Даход дададзены',
    nl: '✅ Inkomsten toegevoegd',
  },
  cancelled: {
    en: '❌ Cancelled',
    ru: '❌ Отменено',
    ua: '❌ Скасовано',
    de: '❌ Abgebrochen',
    es: '❌ Cancelado',
    fr: '❌ Annulé',
    pl: '❌ Anulowano',
    be: '❌ Адменена',
    nl: '❌ Geannuleerd',
  },
  receiptCancelled: {
    en: '❌ Receipt scan cancelled.',
    ru: '❌ Сканирование чека отменено.',
    ua: '❌ Сканування чеку скасовано.',
    de: '❌ Belegscan abgebrochen.',
    es: '❌ Escaneo de recibo cancelado.',
    fr: '❌ Scan du reçu annulé.',
    pl: '❌ Skanowanie paragonu anulowane.',
    be: '❌ Сканаванне чэка адменена.',
    nl: '❌ Bonscan geannuleerd.',
  },
  usageTitle: {
    en: '📊 <b>AI Usage This Month</b>',
    ru: '📊 <b>Использование AI в этом месяце</b>',
    ua: '📊 <b>Використання AI цього місяця</b>',
    de: '📊 <b>AI-Nutzung diesen Monat</b>',
    es: '📊 <b>Uso de AI este mes</b>',
    fr: '📊 <b>Utilisation AI ce mois-ci</b>',
    pl: '📊 <b>Użycie AI w tym miesiącu</b>',
    be: '📊 <b>Выкарыстанне AI гэтага месяца</b>',
    nl: '📊 <b>AI-gebruik deze maand</b>',
  },
  used: {
    en: 'Used',
    ru: 'Использовано',
    ua: 'Використано',
    de: 'Verbraucht',
    es: 'Usado',
    fr: 'Utilisé',
    pl: 'Wykorzystano',
    be: 'Выкарыстана',
    nl: 'Gebruikt',
  },
  tier: {
    en: 'Tier',
    ru: 'Тариф',
    ua: 'Тариф',
    de: 'Tarif',
    es: 'Plan',
    fr: 'Forfait',
    pl: 'Plan',
    be: 'Тарыф',
    nl: 'Niveau',
  },
  breakdown: {
    en: 'Breakdown',
    ru: 'Разбивка',
    ua: 'Розбивка',
    de: 'Aufschlüsselung',
    es: 'Desglose',
    fr: 'Ventilation',
    pl: 'Podział',
    be: 'Разбіўка',
    nl: 'Overzicht',
  },
  resets: {
    en: 'Resets',
    ru: 'Сброс',
    ua: 'Скидання',
    de: 'Zurücksetzung',
    es: 'Se reinicia',
    fr: 'Réinitialisation',
    pl: 'Resetuje się',
    be: 'Скід',
    nl: 'Herstelt',
  },
  changeDate: {
    en: '📅 Change date',
    ru: '📅 Изменить дату',
    ua: '📅 Змінити дату',
    de: '📅 Datum ändern',
    es: '📅 Cambiar fecha',
    fr: '📅 Changer la date',
    pl: '📅 Zmień datę',
    be: '📅 Змяніць дату',
    nl: '📅 Datum wijzigen',
  },
  sendDate: {
    en: '📅 Send the correct date in format <b>DD.MM.YYYY</b> (e.g., 28.03.2026):',
    ru: '📅 Отправьте правильную дату в формате <b>ДД.ММ.ГГГГ</b> (например, 28.03.2026):',
    ua: '📅 Надішліть правильну дату у форматі <b>ДД.ММ.РРРР</b> (наприклад, 28.03.2026):',
    de: '📅 Senden Sie das richtige Datum im Format <b>TT.MM.JJJJ</b> (z.B. 28.03.2026):',
    es: '📅 Envía la fecha correcta en formato <b>DD.MM.AAAA</b> (ej., 28.03.2026):',
    fr: '📅 Envoyez la bonne date au format <b>JJ.MM.AAAA</b> (ex. 28.03.2026) :',
    pl: '📅 Wyślij poprawną datę w formacie <b>DD.MM.RRRR</b> (np. 28.03.2026):',
    be: '📅 Адпраўце правільную дату ў фармаце <b>ДД.ММ.ГГГГ</b> (напрыклад, 28.03.2026):',
    nl: '📅 Stuur de juiste datum in het formaat <b>DD.MM.YYYY</b> (bijv. 28.03.2026):',
  },
  dateUpdated: {
    en: '✅ Date updated to {{date}}',
    ru: '✅ Дата изменена на {{date}}',
    ua: '✅ Дату змінено на {{date}}',
    de: '✅ Datum geändert auf {{date}}',
    es: '✅ Fecha actualizada a {{date}}',
    fr: '✅ Date mise à jour : {{date}}',
    pl: '✅ Data zmieniona na {{date}}',
    be: '✅ Дата зменена на {{date}}',
    nl: '✅ Datum bijgewerkt naar {{date}}',
  },
  invalidDate: {
    en: '❌ Invalid date format. Please use DD.MM.YYYY',
    ru: '❌ Неверный формат даты. Используйте ДД.ММ.ГГГГ',
    ua: '❌ Невірний формат дати. Використовуйте ДД.ММ.РРРР',
    de: '❌ Ungültiges Datumsformat. Verwenden Sie TT.MM.JJJJ',
    es: '❌ Formato de fecha inválido. Usa DD.MM.AAAA',
    fr: '❌ Format de date invalide. Utilisez JJ.MM.AAAA',
    pl: '❌ Nieprawidłowy format daty. Użyj DD.MM.RRRR',
    be: '❌ Няправільны фармат даты. Выкарыстоўвайце ДД.ММ.ГГГГ',
    nl: '❌ Ongeldig datumformaat. Gebruik DD.MM.YYYY',
  },
  linkProvideCode: {
    en: 'Please provide a link code.\n\nUsage: <code>/link YOUR_CODE</code>',
    ru: 'Укажите код привязки.\n\nИспользование: <code>/link ВАШ_КОД</code>',
    ua: 'Вкажіть код прив\'язки.\n\nВикористання: <code>/link ВАШ_КОД</code>',
    de: 'Bitte geben Sie einen Verknüpfungscode an.\n\nVerwendung: <code>/link IHR_CODE</code>',
    es: 'Proporciona un código de vinculación.\n\nUso: <code>/link TU_CÓDIGO</code>',
    fr: 'Veuillez fournir un code de liaison.\n\nUtilisation : <code>/link VOTRE_CODE</code>',
    pl: 'Podaj kod połączenia.\n\nUżycie: <code>/link TWÓJ_KOD</code>',
    be: 'Пакажыце код прывязкі.\n\nВыкарыстанне: <code>/link ВАШ_КОД</code>',
    nl: 'Geef een koppelcode op.\n\nGebruik: <code>/link JOUW_CODE</code>',
  },
  newChatStarted: {
    en: '🔄 New conversation started. Ask me anything!',
    ru: '🔄 Новый разговор начат. Спрашивайте что угодно!',
    ua: '🔄 Нову розмову розпочато. Запитуйте будь-що!',
    de: '🔄 Neues Gespräch gestartet. Fragen Sie mich alles!',
    es: '🔄 Nueva conversación iniciada. ¡Pregúntame lo que quieras!',
    fr: '🔄 Nouvelle conversation commencée. Posez-moi vos questions !',
    pl: '🔄 Nowa rozmowa rozpoczęta. Pytaj o cokolwiek!',
    be: '🔄 Новая размова пачата. Пытайце што заўгодна!',
    nl: '🔄 Nieuw gesprek gestart. Stel me van alles!',
  },
  chooseAccount: {
    en: 'Choose an account:',
    ru: 'Выберите аккаунт:',
    ua: 'Оберіть акаунт:',
    de: 'Konto auswählen:',
    es: 'Elige una cuenta:',
    fr: 'Choisissez un compte :',
    pl: 'Wybierz konto:',
    be: 'Абярыце акаўнт:',
    nl: 'Kies een account:',
  },
  oneAccount: {
    en: 'You have one account: <b>{{name}}</b> (already active).',
    ru: 'У вас один аккаунт: <b>{{name}}</b> (уже активен).',
    ua: 'У вас один акаунт: <b>{{name}}</b> (вже активний).',
    de: 'Sie haben ein Konto: <b>{{name}}</b> (bereits aktiv).',
    es: 'Tienes una cuenta: <b>{{name}}</b> (ya activa).',
    fr: 'Vous avez un compte : <b>{{name}}</b> (déjà actif).',
    pl: 'Masz jedno konto: <b>{{name}}</b> (już aktywne).',
    be: 'У вас адзін акаўнт: <b>{{name}}</b> (ужо актыўны).',
    nl: 'Je hebt één account: <b>{{name}}</b> (al actief).',
  },
  activeAccount: {
    en: '✅ Active account: <b>{{name}}</b>',
    ru: '✅ Активный аккаунт: <b>{{name}}</b>',
    ua: '✅ Активний акаунт: <b>{{name}}</b>',
    de: '✅ Aktives Konto: <b>{{name}}</b>',
    es: '✅ Cuenta activa: <b>{{name}}</b>',
    fr: '✅ Compte actif : <b>{{name}}</b>',
    pl: '✅ Aktywne konto: <b>{{name}}</b>',
    be: '✅ Актыўны акаўнт: <b>{{name}}</b>',
    nl: '✅ Actief account: <b>{{name}}</b>',
  },
  viewerRestricted: {
    en: '🔒 You have view-only access. Only editors and owners can create or modify data.',
    ru: '🔒 У вас только права просмотра. Создавать и изменять данные могут редакторы и владельцы.',
    ua: '🔒 У вас лише права перегляду. Редагувати можуть лише редактори та власники.',
    de: '🔒 Sie haben nur Leserechte. Nur Editoren und Eigentümer können Daten bearbeiten.',
    es: '🔒 Solo tienes acceso de lectura. Solo los editores y propietarios pueden modificar datos.',
    fr: '🔒 Vous avez un accès en lecture seule. Seuls les éditeurs et propriétaires peuvent modifier.',
    pl: '🔒 Masz tylko dostęp do odczytu. Edytować mogą tylko edytorzy i właściciele.',
    be: '🔒 У вас толькі правы прагляду. Рэдагаваць могуць толькі рэдактары і ўладальнікі.',
    nl: '🔒 Je hebt alleen leestoegang. Alleen redacteurs en eigenaren kunnen gegevens aanmaken of wijzigen.',
  },
  // Same template in all three bots, brand swapped only — injected via each
  // module's `createBotT(..., { defaultParams: { platform: '<Brand>' } })`.
  notLinked: {
    en: 'Your {{platform}} is not linked to any account.',
    ru: 'Ваш {{platform}} не привязан ни к одному аккаунту.',
    ua: 'Ваш {{platform}} не прив\'язаний до жодного акаунту.',
    de: 'Ihr {{platform}} ist mit keinem Konto verknüpft.',
    es: 'Tu {{platform}} no está vinculado a ninguna cuenta.',
    fr: 'Votre {{platform}} n\'est lié à aucun compte.',
    pl: 'Twój {{platform}} nie jest połączony z żadnym kontem.',
    be: 'Ваш {{platform}} не прывязаны ні да якога акаўнта.',
    nl: 'Je {{platform}} is niet gekoppeld aan een account.',
  },
  // Only whatsapp/slack use welcomeBack/linkSuccess (identical between the
  // two — both say "help", no leading slash); telegram overrides both with
  // its own "/help"-flavored copy.
  welcomeBack: {
    en: 'Welcome back! You are linked to account <b>{{account}}</b>.\n\nSend help to see available commands.',
    ru: 'С возвращением! Вы привязаны к аккаунту <b>{{account}}</b>.\n\nОтправьте help для списка команд.',
    ua: 'З поверненням! Ви прив\'язані до акаунту <b>{{account}}</b>.\n\nНадішліть help для списку команд.',
    de: 'Willkommen zurück! Sie sind mit dem Konto <b>{{account}}</b> verbunden.\n\nSenden Sie help für verfügbare Befehle.',
    es: '¡Bienvenido de nuevo! Estás vinculado a la cuenta <b>{{account}}</b>.\n\nEnvía help para ver los comandos.',
    fr: 'Bon retour ! Vous êtes lié au compte <b>{{account}}</b>.\n\nEnvoyez help pour voir les commandes.',
    pl: 'Witaj ponownie! Jesteś połączony z kontem <b>{{account}}</b>.\n\nWyślij help, aby zobaczyć dostępne polecenia.',
    be: 'З вяртаннем! Вы прывязаны да акаўнта <b>{{account}}</b>.\n\nАдпраўце help для спісу каманд.',
    nl: 'Welkom terug! Je bent gekoppeld aan account <b>{{account}}</b>.\n\nStuur help om de beschikbare opdrachten te zien.',
  },
  linkSuccess: {
    en: '✅ Account linked successfully!\n\nYou can now:\n• Add expenses: <code>expense 50 lunch</code>\n• Add incomes: <code>income 3000 salary</code>\n• Send voice messages to add expenses/chat\n• Send receipt photos to scan them\n• Chat with AI — just type any question\n\nSend help for all commands.',
    ru: '✅ Аккаунт успешно привязан!\n\nТеперь вы можете:\n• Добавлять расходы: <code>expense 50 обед</code>\n• Добавлять доходы: <code>income 3000 зарплата</code>\n• Отправлять голосовые для добавления расходов/чата\n• Отправлять фото чеков для сканирования\n• Общаться с ИИ — просто напишите вопрос\n\nОтправьте help для списка команд.',
    ua: '✅ Акаунт успішно прив\'язано!\n\nТепер ви можете:\n• Додавати витрати: <code>expense 50 обід</code>\n• Додавати доходи: <code>income 3000 зарплата</code>\n• Надсилати голосові для додавання витрат/чату\n• Надсилати фото чеків для сканування\n• Спілкуватися з ШІ — просто напишіть питання\n\nНадішліть help для списку команд.',
    de: '✅ Konto erfolgreich verknüpft!\n\nSie können jetzt:\n• Ausgaben hinzufügen: <code>expense 50 Mittagessen</code>\n• Einnahmen hinzufügen: <code>income 3000 Gehalt</code>\n• Sprachnachrichten senden\n• Belegfotos senden\n• Mit KI chatten — einfach eine Frage eingeben\n\nSenden Sie help für alle Befehle.',
    es: '✅ ¡Cuenta vinculada!\n\nAhora puedes:\n• Agregar gastos: <code>expense 50 almuerzo</code>\n• Agregar ingresos: <code>income 3000 salario</code>\n• Enviar mensajes de voz\n• Enviar fotos de recibos\n• Chatear con IA — solo escribe tu pregunta\n\nEnvía help para todos los comandos.',
    fr: '✅ Compte lié avec succès !\n\nVous pouvez maintenant :\n• Ajouter des dépenses : <code>expense 50 déjeuner</code>\n• Ajouter des revenus : <code>income 3000 salaire</code>\n• Envoyer des messages vocaux\n• Envoyer des photos de reçus\n• Discuter avec l\'IA — tapez votre question\n\nEnvoyez help pour toutes les commandes.',
    pl: '✅ Konto połączone!\n\nTeraz możesz:\n• Dodawać wydatki: <code>expense 50 obiad</code>\n• Dodawać dochody: <code>income 3000 pensja</code>\n• Wysyłać wiadomości głosowe\n• Wysyłać zdjęcia paragonów\n• Rozmawiać z AI — po prostu wpisz pytanie\n\nWyślij help, aby zobaczyć polecenia.',
    be: '✅ Акаўнт паспяхова прывязаны!\n\nЦяпер вы можаце:\n• Дадаваць выдаткі: <code>expense 50 абед</code>\n• Дадаваць даходы: <code>income 3000 зарплата</code>\n• Адпраўляць галасавыя\n• Адпраўляць фота чэкаў\n• Размаўляць з ІІ — проста напішыце пытанне\n\nАдпраўце help для спісу каманд.',
    nl: '✅ Account succesvol gekoppeld!\n\nJe kunt nu:\n• Uitgaven toevoegen: <code>expense 50 lunch</code>\n• Inkomsten toevoegen: <code>income 3000 salaris</code>\n• Spraakberichten sturen om uitgaven toe te voegen/te chatten\n• Foto\'s van bonnen sturen om te scannen\n• Chatten met AI — typ gewoon een vraag\n\nStuur help voor alle opdrachten.',
  },
  // The category-management flow (categoryUsage..categoryDeleted) is only
  // used by whatsapp/slack today — telegram simply never calls these keys.
  categoryUsage: {
    en: 'Create a category:\n\n  category expense Food\n  category income Salary\n  category Shopping — will ask for type\n\nUse <b>categories</b> to see all categories.',
    ru: 'Создать категорию:\n\n  category expense Еда\n  category income Зарплата\n  category Покупки — спросит тип\n\nОтправьте <b>categories</b> для просмотра.',
    ua: 'Створити категорію:\n\n  category expense Їжа\n  category income Зарплата\n  category Покупки — запитає тип\n\nНадішліть <b>categories</b> для перегляду.',
    de: 'Kategorie erstellen:\n\n  category expense Essen\n  category income Gehalt\n  category Einkaufen — fragt nach Typ\n\n<b>categories</b> senden zum Anzeigen.',
    es: 'Crear categoría:\n\n  category expense Comida\n  category income Salario\n  category Compras — preguntará el tipo\n\nEnvía <b>categories</b> para ver todas.',
    fr: 'Créer une catégorie :\n\n  category expense Nourriture\n  category income Salaire\n  category Achats — demandera le type\n\nEnvoyez <b>categories</b> pour voir.',
    pl: 'Utwórz kategorię:\n\n  category expense Jedzenie\n  category income Pensja\n  category Zakupy — zapyta o typ\n\nWyślij <b>categories</b>, aby zobaczyć.',
    be: 'Стварыць катэгорыю:\n\n  category expense Ежа\n  category income Зарплата\n  category Пакупкі — запытае тып\n\nАдпраўце <b>categories</b> для прагляду.',
    nl: 'Maak een categorie aan:\n\n  category expense Boodschappen\n  category income Salaris\n  category Winkelen — vraagt om type\n\nGebruik <b>categories</b> om alle categorieën te zien.',
  },
  categoryNameRequired: {
    en: '❌ Please provide a category name.\n\nExample: category expense Food',
    ru: '❌ Укажите название категории.\n\nПример: category expense Еда',
    ua: '❌ Вкажіть назву категорії.\n\nПриклад: category expense Їжа',
    de: '❌ Bitte geben Sie einen Kategorienamen an.\n\nBeispiel: category expense Essen',
    es: '❌ Por favor, proporciona el nombre de la categoría.\n\nEjemplo: category expense Comida',
    fr: '❌ Veuillez fournir un nom de catégorie.\n\nExemple : category expense Nourriture',
    pl: '❌ Podaj nazwę kategorii.\n\nPrzykład: category expense Jedzenie',
    be: '❌ Пакажыце назву катэгорыі.\n\nПрыклад: category expense Ежа',
    nl: '❌ Geef een categorienaam op.\n\nVoorbeeld: category expense Boodschappen',
  },
  categoryNameTooLong: {
    en: '❌ Category name must be 50 characters or less.',
    ru: '❌ Название категории не должно превышать 50 символов.',
    ua: '❌ Назва категорії не повинна перевищувати 50 символів.',
    de: '❌ Der Kategoriename darf maximal 50 Zeichen lang sein.',
    es: '❌ El nombre de la categoría debe tener 50 caracteres o menos.',
    fr: '❌ Le nom de la catégorie doit contenir 50 caractères ou moins.',
    pl: '❌ Nazwa kategorii może mieć maksymalnie 50 znaków.',
    be: '❌ Назва катэгорыі не павінна перавышаць 50 сімвалаў.',
    nl: '❌ De categorienaam mag maximaal 50 tekens lang zijn.',
  },
  categoryChooseType: {
    en: 'Choose type for category "{{name}}":',
    ru: 'Выберите тип для категории "{{name}}":',
    ua: 'Оберіть тип для категорії "{{name}}":',
    de: 'Typ für Kategorie "{{name}}" wählen:',
    es: 'Elige el tipo para la categoría "{{name}}":',
    fr: 'Choisissez le type pour la catégorie "{{name}}" :',
    pl: 'Wybierz typ dla kategorii "{{name}}":',
    be: 'Выберыце тып для катэгорыі "{{name}}":',
    nl: 'Kies het type voor categorie "{{name}}":',
  },
  categoryExpenseBtn: {
    en: '💰 Expense',
    ru: '💰 Расход',
    ua: '💰 Витрата',
    de: '💰 Ausgabe',
    es: '💰 Gasto',
    fr: '💰 Dépense',
    pl: '💰 Wydatek',
    be: '💰 Выдатак',
    nl: '💰 Uitgave',
  },
  categoryIncomeBtn: {
    en: '📈 Income',
    ru: '📈 Доход',
    ua: '📈 Дохід',
    de: '📈 Einnahme',
    es: '📈 Ingreso',
    fr: '📈 Revenu',
    pl: '📈 Dochód',
    be: '📈 Даход',
    nl: '📈 Inkomsten',
  },
  categoryNone: {
    en: 'No categories yet. Create one with:\n  category expense Food\n  category income Salary',
    ru: 'Категорий пока нет. Создайте:\n  category expense Еда\n  category income Зарплата',
    ua: 'Категорій поки немає. Створіть:\n  category expense Їжа\n  category income Зарплата',
    de: 'Noch keine Kategorien. Erstellen mit:\n  category expense Essen\n  category income Gehalt',
    es: 'Aún no hay categorías. Crea una con:\n  category expense Comida\n  category income Salario',
    fr: 'Aucune catégorie pour l\'instant. Créez avec :\n  category expense Nourriture\n  category income Salaire',
    pl: 'Brak kategorii. Utwórz z:\n  category expense Jedzenie\n  category income Pensja',
    be: 'Катэгорый пакуль няма. Стварыце:\n  category expense Ежа\n  category income Зарплата',
    nl: 'Nog geen categorieën. Maak er een aan met:\n  category expense Boodschappen\n  category income Salaris',
  },
  categoriesTitle: {
    en: 'Categories',
    ru: 'Категории',
    ua: 'Категорії',
    de: 'Kategorien',
    es: 'Categorías',
    fr: 'Catégories',
    pl: 'Kategorie',
    be: 'Катэгорыі',
    nl: 'Categorieën',
  },
  categoryTooMany: {
    en: 'You have {{count}} custom categories. Manage them in the app — too many for chat.',
    ru: 'У вас {{count}} пользовательских категорий. Управляйте ими в приложении.',
    ua: 'У вас {{count}} користувацьких категорій. Керуйте ними в додатку.',
    de: 'Sie haben {{count}} benutzerdefinierte Kategorien. Verwalten Sie sie in der App.',
    es: 'Tienes {{count}} categorías personalizadas. Gestiónolas en la app.',
    fr: 'Vous avez {{count}} catégories personnalisées. Gérez-les dans l\'application.',
    pl: 'Masz {{count}} niestandardowych kategorii. Zarządzaj nimi w aplikacji.',
    be: 'У вас {{count}} карыстальніцкіх катэгорый. Кіруйце імі ў праграме.',
    nl: 'Je hebt {{count}} aangepaste categorieën. Beheer ze in de app — te veel voor de chat.',
  },
  categoryDeleteBtn: {
    en: 'Tap to delete',
    ru: 'Нажмите для удаления',
    ua: 'Натисніть для видалення',
    de: 'Zum Löschen tippen',
    es: 'Toca para eliminar',
    fr: 'Appuyer pour supprimer',
    pl: 'Dotknij, aby usunąć',
    be: 'Націсніце для выдалення',
    nl: 'Tik om te verwijderen',
  },
  categoryTypeExpense: {
    en: 'Expense',
    ru: 'Расход',
    ua: 'Витрата',
    de: 'Ausgabe',
    es: 'Gasto',
    fr: 'Dépense',
    pl: 'Wydatek',
    be: 'Выдатак',
    nl: 'Uitgave',
  },
  categoryTypeIncome: {
    en: 'Income',
    ru: 'Доход',
    ua: 'Дохід',
    de: 'Einnahme',
    es: 'Ingreso',
    fr: 'Revenu',
    pl: 'Dochód',
    be: 'Даход',
    nl: 'Inkomsten',
  },
  categoryExpired: {
    en: '❌ The category creation request has expired. Please try again.',
    ru: '❌ Запрос на создание категории истёк. Попробуйте ещё раз.',
    ua: '❌ Запит на створення категорії застарів. Спробуйте ще раз.',
    de: '❌ Die Kategorieerstellungsanfrage ist abgelaufen. Bitte versuchen Sie es erneut.',
    es: '❌ La solicitud de creación de categoría ha expirado. Inténtalo de nuevo.',
    fr: '❌ La demande de création de catégorie a expiré. Veuillez réessayer.',
    pl: '❌ Żądanie utworzenia kategorii wygasło. Spróbuj ponownie.',
    be: '❌ Запыт на стварэнне катэгорыі прасрочаны. Паспрабуйце яшчэ раз.',
    nl: '❌ Het verzoek om een categorie aan te maken is verlopen. Probeer het opnieuw.',
  },
  categoryCreated: {
    en: '✅ Category created: {{emoji}} <b>{{name}}</b> ({{type}})',
    ru: '✅ Категория создана: {{emoji}} <b>{{name}}</b> ({{type}})',
    ua: '✅ Категорію створено: {{emoji}} <b>{{name}}</b> ({{type}})',
    de: '✅ Kategorie erstellt: {{emoji}} <b>{{name}}</b> ({{type}})',
    es: '✅ Categoría creada: {{emoji}} <b>{{name}}</b> ({{type}})',
    fr: '✅ Catégorie créée : {{emoji}} <b>{{name}}</b> ({{type}})',
    pl: '✅ Kategoria utworzona: {{emoji}} <b>{{name}}</b> ({{type}})',
    be: '✅ Катэгорыя створана: {{emoji}} <b>{{name}}</b> ({{type}})',
    nl: '✅ Categorie aangemaakt: {{emoji}} <b>{{name}}</b> ({{type}})',
  },
  categoryAlreadyExists: {
    en: '❌ Category "<b>{{name}}</b>" already exists for {{type}}.',
    ru: '❌ Категория "<b>{{name}}</b>" уже существует для {{type}}.',
    ua: '❌ Категорія "<b>{{name}}</b>" вже існує для {{type}}.',
    de: '❌ Kategorie "<b>{{name}}</b>" existiert bereits für {{type}}.',
    es: '❌ La categoría "<b>{{name}}</b>" ya existe para {{type}}.',
    fr: '❌ La catégorie "<b>{{name}}</b>" existe déjà pour {{type}}.',
    pl: '❌ Kategoria "<b>{{name}}</b>" już istnieje dla {{type}}.',
    be: '❌ Катэгорыя "<b>{{name}}</b>" ужо існуе для {{type}}.',
    nl: '❌ Categorie "<b>{{name}}</b>" bestaat al voor {{type}}.',
  },
  categoryDeleted: {
    en: '✅ Category deleted.',
    ru: '✅ Категория удалена.',
    ua: '✅ Категорію видалено.',
    de: '✅ Kategorie gelöscht.',
    es: '✅ Categoría eliminada.',
    fr: '✅ Catégorie supprimée.',
    pl: '✅ Kategoria usunięta.',
    be: '✅ Катэгорыя выдалена.',
    nl: '✅ Categorie verwijderd.',
  },
};
