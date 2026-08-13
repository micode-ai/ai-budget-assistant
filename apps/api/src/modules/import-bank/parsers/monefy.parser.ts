import * as Papa from 'papaparse';
import type { BankParser, ParserOptions, ParserResult } from './parser.interface';
import { parsePolishAmount } from '../utils/polish-amount';
import { parsePolishDate } from '../utils/polish-date';
import { sniffDelimiter } from '../utils/delimiter';

/**
 * Monefy export ("Settings → Export to CSV" in the Monefy app).
 *
 * Header: date;account;category;amount;currency;converted amount;currency;description
 *
 * Parsed in ARRAY mode, not header mode: the header carries `currency` twice
 * (raw and converted), and a keyed parse would silently collapse them.
 *
 * Amount is signed — negative is an expense. The decimal separator follows the
 * exporting device's locale, which parsePolishAmount already resolves both ways.
 * Dates are day-first (`dd/MM/yyyy`), matching parsePolishDate's `auto` mode;
 * the target markets are all day-first, so a US-locale export would need its own
 * handling rather than being silently mis-read.
 *
 * Unlike a bank statement, this export carries the user's OWN category, so it
 * is passed through as `suggestedCategoryName` rather than guessed from the
 * merchant — migrating a history is only worth doing if it stays organised.
 */
export class MonefyParser implements BankParser {
  id = 'monefy' as const;
  displayName = 'Monefy';

  detect(headers: string[], _sampleRows: string[][] = []): boolean {
    const lower = headers.map((h) => h.toLowerCase().trim());
    const has = (name: string) => lower.includes(name);
    // Two `currency` columns is Monefy's signature. Detection stays deliberately
    // tight: a parser that claims a foreign format yields plausible-looking
    // garbage, while an unclaimed file falls through to AI inference and still
    // imports correctly.
    const currencyCount = lower.filter((h) => h === 'currency').length;
    return (
      currencyCount >= 2 &&
      has('date') &&
      has('account') &&
      has('category') &&
      has('amount') &&
      has('description')
    );
  }

  parse(text: string, opts?: ParserOptions): ParserResult {
    const delimiter = opts?.delimiter ?? sniffDelimiter(text);
    const result = Papa.parse<string[]>(text, {
      header: false,
      skipEmptyLines: true,
      delimiter,
    });

    const [headerRow, ...dataRows] = result.data;
    if (!headerRow) return { rows: [], detectedHeaders: [] };

    const detectedHeaders = headerRow.map((h) => String(h).trim());
    const col = this.columnIndexes(detectedHeaders);

    const rows = dataRows
      .map((cells, i) => this.toRow(cells, i, col))
      .filter((r): r is NonNullable<ReturnType<typeof this.toRow>> => r != null);

    return { rows, detectedHeaders };
  }

  /**
   * Resolves each needed column by name. `currency` deliberately takes the
   * FIRST occurrence — the raw amount's currency — because the second is the
   * converted one, which belongs to Monefy's own base-currency setting rather
   * than to the transaction.
   */
  private columnIndexes(headers: string[]) {
    const lower = headers.map((h) => h.toLowerCase().trim());
    return {
      date: lower.indexOf('date'),
      category: lower.indexOf('category'),
      amount: lower.indexOf('amount'),
      currency: lower.indexOf('currency'),
      description: lower.indexOf('description'),
    };
  }

  private toRow(cells: string[], idx: number, col: ReturnType<MonefyParser['columnIndexes']>) {
    const at = (index: number): string => (index >= 0 ? (cells[index] ?? '').trim() : '');

    const date = parsePolishDate(at(col.date));
    if (!date) return null;

    const amount = parsePolishAmount(at(col.amount), 'polish');
    if (!Number.isFinite(amount) || amount === 0) return null;

    const category = at(col.category);
    const note = at(col.description);
    // Monefy lets a transaction have no note at all; the category is the only
    // human-readable thing left, and an empty description would leave the row
    // unidentifiable in the preview.
    const description = note || category;
    if (!description) return null;

    return {
      idx,
      kind: (amount < 0 ? 'expense' : 'income') as 'expense' | 'income',
      date,
      amount: Math.abs(amount),
      currencyCode: (at(col.currency) || 'PLN').toUpperCase(),
      description,
      merchant: note || undefined,
      suggestedCategoryName: category || undefined,
    };
  }
}
