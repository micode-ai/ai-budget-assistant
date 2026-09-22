import * as Papa from 'papaparse';
import type { BankParser, ParserOptions, ParserResult } from './parser.interface';
import { parsePolishAmount } from '../utils/polish-amount';
import { sniffDelimiter } from '../utils/delimiter';

/**
 * "Money Manager" exports. Two unrelated apps ship under that name and users
 * pick the same entry for both, so this parser reads both shapes.
 *
 * FULL — Money Manager (Realbyte), and the near-identical shape 1Money produces:
 *   Date,Account,Category,Subcategory,Note,Amount,Income/Expense,Description,
 *   Currency,Account Type
 *   Category and Subcategory are joined ("Food / Groceries") so the finer level
 *   survives the migration instead of being flattened away.
 *
 * SIMPLE — the export a real user sent us (ABA-581), from a different app:
 *   ID,Date,Type,Title,Amount,Note
 *   1,22/09/2026 - 08:40 PM,Income,Salary,$ 10,
 *   `Title` is the category, the date carries a time, and the amount carries a
 *   currency SYMBOL rather than a currency column.
 *
 * Both write amounts UNSIGNED, so the direction column (`Income/Expense` or
 * `Type`) is the only source of truth; reading the sign would book every salary
 * as spending. `Transfer` rows are movements between the user's own accounts —
 * not spending — and are dropped.
 *
 * Slash dates are ambiguous between apps and locales, so the ORDER is decided
 * once per file from the data (a first field above 12 means day-first, a second
 * field above 12 means month-first), defaulting to day-first — the target
 * markets' order. A month outside 1..12 drops the row instead of producing an
 * invalid ISO date.
 */

type Variant = 'full' | 'simple';

const SIMPLE_HEADERS = ['id', 'date', 'type', 'title', 'amount', 'note'];

const SYMBOL_TO_CURRENCY: Array<[RegExp, string]> = [
  [/zł|zl\b/i, 'PLN'],
  [/€/, 'EUR'],
  [/£/, 'GBP'],
  [/₴/, 'UAH'],
  [/₽/, 'RUB'],
  [/\bBr\b/, 'BYN'],
  [/\$/, 'USD'],
];

const INCOME_WORDS = new Set(['income', 'incomes']);
const EXPENSE_WORDS = new Set(['expense', 'expenses', 'exp.', 'exp']);

type DateOrder = 'dmy' | 'mdy';
const SLASH_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;
const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

export class MoneyManagerParser implements BankParser {
  id = 'moneymanager' as const;
  displayName = 'Money Manager / 1Money';

  detect(headers: string[], _sampleRows: string[][] = []): boolean {
    return this.variantOf(headers) !== null;
  }

  parse(text: string, opts?: ParserOptions): ParserResult {
    const delimiter = opts?.delimiter ?? sniffDelimiter(text);
    const result = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      delimiter,
      // BOM + case: the real export starts with a UTF-8 BOM, which would
      // otherwise stay glued to the first header name.
      transformHeader: (h) => stripBom(h).trim(),
    });

    const detectedHeaders = result.meta.fields ?? [];
    // Rows are read by lower-cased name: the two apps capitalise differently.
    const data = result.data.map((r) => {
      const lowered: Record<string, string> = {};
      for (const [k, v] of Object.entries(r)) lowered[k.toLowerCase()] = v;
      return lowered;
    });
    const variant = this.variantOf(detectedHeaders) ?? 'full';
    const order = resolveDateOrder(data.map((r) => firstDateToken(r['date'] ?? '')));
    const fallbackCurrency = opts?.defaultCurrency ?? 'PLN';

    const rows = data
      .map((r, i) =>
        variant === 'simple'
          ? this.toSimpleRow(r, i, order, fallbackCurrency)
          : this.toFullRow(r, i, order, fallbackCurrency),
      )
      .filter((r): r is NonNullable<typeof r> => r != null);

    return { rows, detectedHeaders };
  }

  /**
   * Tight on purpose: a parser that claims a foreign format produces
   * plausible-looking garbage, while an unclaimed file still imports via AI.
   */
  private variantOf(headers: string[]): Variant | null {
    const lower = headers.map((h) => stripBom(h).toLowerCase().trim());
    const set = new Set(lower);
    if (set.has('income/expense') && set.has('subcategory') && set.has('account')) return 'full';
    if (lower.length === SIMPLE_HEADERS.length && SIMPLE_HEADERS.every((h) => set.has(h))) return 'simple';
    return null;
  }

  private toFullRow(r: Record<string, string>, idx: number, order: DateOrder, fallbackCurrency: string) {
    const get = (key: string): string => (r[key] ?? '').trim();

    const kind = directionOf(get('income/expense'));
    if (!kind) return null;

    const date = toIsoDate(get('date'), order);
    if (!date) return null;

    const amount = parsePolishAmount(get('amount'), 'polish');
    if (!Number.isFinite(amount) || amount === 0) return null;

    const note = get('note');
    const desc = get('description');
    const category = get('category');
    const subcategory = get('subcategory');

    const description = note || desc || category;
    if (!description) return null;

    return {
      idx,
      kind,
      date,
      amount: Math.abs(amount),
      currencyCode: (get('currency') || fallbackCurrency).toUpperCase(),
      description,
      merchant: note || desc || undefined,
      suggestedCategoryName: category ? (subcategory ? `${category} / ${subcategory}` : category) : undefined,
    };
  }

  private toSimpleRow(r: Record<string, string>, idx: number, order: DateOrder, fallbackCurrency: string) {
    const get = (key: string): string => (r[key] ?? '').trim();

    const kind = directionOf(get('type'));
    if (!kind) return null;

    const date = toIsoDate(get('date'), order);
    if (!date) return null;

    const rawAmount = get('amount');
    const amount = parsePolishAmount(rawAmount.replace(/[^\d.,-]/g, ''), 'polish');
    if (!Number.isFinite(amount) || amount === 0) return null;

    const category = get('title');
    const note = get('note');
    const description = note || category;
    if (!description) return null;

    return {
      idx,
      kind,
      date,
      amount: Math.abs(amount),
      currencyCode: currencyFromSymbol(rawAmount) ?? fallbackCurrency,
      description,
      merchant: note || undefined,
      suggestedCategoryName: category || undefined,
    };
  }
}

function directionOf(raw: string): 'income' | 'expense' | null {
  const v = raw.toLowerCase().trim();
  if (INCOME_WORDS.has(v)) return 'income';
  if (EXPENSE_WORDS.has(v)) return 'expense';
  return null; // Transfer, or anything unrecognised
}

function currencyFromSymbol(raw: string): string | undefined {
  const code = raw.match(/\b(PLN|EUR|USD|GBP|UAH|RUB|BYN)\b/i);
  if (code) return code[1].toUpperCase();
  return SYMBOL_TO_CURRENCY.find(([re]) => re.test(raw))?.[1];
}

/** "22/09/2026 - 08:40 PM" → "22/09/2026"; "2024-02-01T10:00" → "2024-02-01". */
function firstDateToken(raw: string): string {
  return raw.trim().split(/[\sT]/)[0];
}

/** Exported for tests. */
export function resolveDateOrder(tokens: string[]): DateOrder {
  for (const t of tokens) {
    const m = t.match(SLASH_DATE);
    if (!m) continue;
    if (Number(m[1]) > 12) return 'dmy';
    if (Number(m[2]) > 12) return 'mdy';
  }
  return 'dmy';
}

function toIsoDate(raw: string, order: DateOrder): string {
  const token = firstDateToken(raw);
  let y: number;
  let mo: number;
  let d: number;
  const iso = token.match(ISO_DATE);
  const slash = token.match(SLASH_DATE);
  if (iso) {
    [y, mo, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    y = Number(slash[3]);
    [d, mo] = order === 'dmy' ? [a, b] : [b, a];
  } else {
    return '';
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Built from its code point: a literal BOM in source is invisible and lint rejects it.
const BOM = String.fromCharCode(0xfeff);
function stripBom(h: string): string {
  return h.startsWith(BOM) ? h.slice(1) : h;
}
