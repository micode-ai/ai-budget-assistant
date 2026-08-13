import * as Papa from 'papaparse';
import type { BankParser, ParserOptions, ParserResult } from './parser.interface';
import { parsePolishAmount } from '../utils/polish-amount';
import { parsePolishDate } from '../utils/polish-date';
import { sniffDelimiter } from '../utils/delimiter';

/**
 * Wallet by BudgetBakers export ("Settings → Export → CSV").
 *
 * Header: account;category;currency;amount;refCurrency;refAmount;type;
 *         paymentType;note;date;transfer;payee;labels
 *
 * Richer than a bank statement in three ways this parser relies on:
 *  - `type` states Expense/Income explicitly, so the sign is not the source of
 *    truth (Wallet writes some incomes unsigned);
 *  - `transfer` marks movements between the user's own accounts, which are not
 *    spending and are dropped — booking them would double-count, and mapping
 *    them properly needs account mapping this import does not do;
 *  - `refCurrency`/`refAmount` are Wallet's own base-currency restatement. The
 *    transaction's real currency and amount are kept; using the converted pair
 *    would silently rewrite what the user actually paid.
 *
 * The export carries the user's OWN category, passed through as
 * `suggestedCategoryName` rather than guessed from the merchant.
 */
export class WalletParser implements BankParser {
  id = 'wallet' as const;
  displayName = 'Wallet by BudgetBakers';

  detect(headers: string[], _sampleRows: string[][] = []): boolean {
    const lower = new Set(headers.map((h) => h.toLowerCase().trim()));
    // refAmount + type + transfer together are Wallet's signature; no bank
    // statement or simpler tracker emits all three. Detection stays tight so an
    // unrecognised file falls through to AI inference instead of being parsed
    // into plausible-looking garbage.
    return lower.has('refamount') && lower.has('type') && lower.has('transfer');
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

    if (get('transfer').toLowerCase() === 'true') return null;

    const date = parsePolishDate(get('date'));
    if (!date) return null;

    const amount = parsePolishAmount(get('amount'), 'polish');
    if (!Number.isFinite(amount) || amount === 0) return null;

    const type = get('type').toLowerCase();
    // The explicit column wins; the sign is only a fallback for an export whose
    // type cell is blank.
    const kind: 'expense' | 'income' =
      type === 'income' ? 'income' : type === 'expense' ? 'expense' : amount < 0 ? 'expense' : 'income';

    const note = get('note');
    const payee = get('payee');
    const category = get('category');
    const description = note || payee || category;
    if (!description) return null;

    return {
      idx,
      kind,
      date,
      amount: Math.abs(amount),
      currencyCode: (get('currency') || 'PLN').toUpperCase(),
      description,
      merchant: payee || undefined,
      suggestedCategoryName: category || undefined,
    };
  }
}
