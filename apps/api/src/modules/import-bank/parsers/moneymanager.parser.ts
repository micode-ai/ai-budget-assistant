import * as Papa from 'papaparse';
import type { BankParser, ParserOptions, ParserResult } from './parser.interface';
import { parsePolishAmount } from '../utils/polish-amount';
import { parsePolishDate } from '../utils/polish-date';
import { sniffDelimiter } from '../utils/delimiter';

/**
 * Money Manager (Realbyte) export, and the near-identical shape 1Money produces.
 *
 * Header: Date,Account,Category,Subcategory,Note,Amount,Income/Expense,
 *         Description,Currency,Account Type
 *
 * Two things this format forces:
 *  - Amounts are written UNSIGNED, so the `Income/Expense` column is the only
 *    source of truth for direction. Reading the sign would book every salary as
 *    spending.
 *  - `Transfer` is a third value in that column, for movements between the
 *    user's own accounts. Those are not spending and are dropped; booking them
 *    would double-count, and mapping them properly needs account mapping this
 *    import does not do.
 *
 * Category and Subcategory are joined ("Food / Groceries") so the finer level
 * survives the migration instead of being flattened away.
 *
 * DATE FORMAT is the documented assumption most likely to need correcting
 * against a real export: ISO is read as-is, and a slash date is read DAY-first,
 * matching the target markets. A US-locale export would be mis-read and needs
 * its own handling rather than silent acceptance.
 */
export class MoneyManagerParser implements BankParser {
  id = 'moneymanager' as const;
  displayName = 'Money Manager / 1Money';

  detect(headers: string[], _sampleRows: string[][] = []): boolean {
    const lower = new Set(headers.map((h) => h.toLowerCase().trim()));
    // The Income/Expense direction column plus a Subcategory level is this
    // family's signature. Detection stays tight: an unclaimed file falls
    // through to AI inference and still imports, whereas a parser that grabs a
    // foreign format produces plausible-looking garbage.
    return lower.has('income/expense') && lower.has('subcategory') && lower.has('account');
  }

  parse(text: string, opts?: ParserOptions): ParserResult {
    const delimiter = opts?.delimiter ?? sniffDelimiter(text);
    const result = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      delimiter,
      transformHeader: (h) => h.trim(),
    });

    const detectedHeaders = result.meta.fields ?? [];
    const rows = result.data
      .map((r, i) => this.toRow(r, i))
      .filter((r): r is NonNullable<ReturnType<typeof this.toRow>> => r != null);

    return { rows, detectedHeaders };
  }

  private toRow(r: Record<string, string>, idx: number) {
    const get = (key: string): string => (r[key] ?? '').trim();

    const direction = get('Income/Expense').toLowerCase();
    if (direction === 'transfer') return null;
    if (direction !== 'income' && direction !== 'expense') return null;

    const date = parsePolishDate(get('Date'));
    if (!date) return null;

    const amount = parsePolishAmount(get('Amount'), 'polish');
    if (!Number.isFinite(amount) || amount === 0) return null;

    const note = get('Note');
    const desc = get('Description');
    const category = get('Category');
    const subcategory = get('Subcategory');

    const description = note || desc || category;
    if (!description) return null;

    const suggestedCategoryName = category
      ? subcategory
        ? `${category} / ${subcategory}`
        : category
      : undefined;

    return {
      idx,
      kind: direction as 'expense' | 'income',
      date,
      amount: Math.abs(amount),
      currencyCode: (get('Currency') || 'PLN').toUpperCase(),
      description,
      merchant: note || desc || undefined,
      suggestedCategoryName,
    };
  }
}
