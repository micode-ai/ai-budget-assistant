import * as Papa from 'papaparse';
import type { BankParser, ParserOptions, ParserResult } from './parser.interface';
import { parsePolishAmount } from '../utils/polish-amount';
import { parsePolishDate } from '../utils/polish-date';
import { suggestCategoryFromMerchantPL } from '../merchants/merchants-pl';

/**
 * Real mBank CSV exports begin with a multi-line metadata preamble
 * (bank address, client, period, account, turnover summary) and end with a
 * legal-disclaimer trailer. The transaction table header is somewhere in the
 * middle, e.g.:
 *
 *   #Data księgowania;#Data operacji;#Opis operacji;#Tytuł;#Nadawca/Odbiorca;#Numer konta;#Numer karty;#Kwota;
 *
 * Amounts have no per-row currency suffix; the account currency lives in a
 * `#Waluta` preamble line. There is no balance column. See ABA-126.
 */
export class MBankParser implements BankParser {
  id = 'mbank' as const;
  displayName = 'mBank';

  detect(headers: string[], sampleRows: string[][] = []): boolean {
    const cells = [...headers, ...sampleRows.flat()].map((x) => (x ?? '').toLowerCase());
    // Strong signature: mBank statements start with the bank name in line 1.
    if (cells.some((c) => c.includes('mbank s.a.'))) return true;
    // Fallback: the transaction header row itself (no preamble export).
    return (
      cells.some((c) => c.startsWith('#data operacji')) &&
      cells.some((c) => c.startsWith('#kwota'))
    );
  }

  parse(text: string, _opts?: ParserOptions): ParserResult {
    const lines = text.split(/\r?\n/);
    const currencyCode = this.extractCurrency(lines);

    // Locate the transaction-table header line (works with or without preamble).
    const headerIdx = lines.findIndex((l) => {
      const low = l.toLowerCase();
      return low.includes('#data operacji') && low.includes('#kwota');
    });
    const csvText = headerIdx >= 0 ? lines.slice(headerIdx).join('\n') : text;

    const result = Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
      delimiter: ';',
    });

    const headers = result.meta.fields ?? [];
    const rows = result.data
      .map((r, i) => this.toRow(r, i, currencyCode))
      .filter((r): r is NonNullable<ReturnType<typeof this.toRow>> => r != null);

    return { rows, detectedHeaders: headers };
  }

  /** Read the account currency from the `#Waluta` preamble line; default PLN. */
  private extractCurrency(lines: string[]): string {
    const idx = lines.findIndex((l) => l.toLowerCase().startsWith('#waluta'));
    if (idx >= 0 && lines[idx + 1]) {
      const cur = lines[idx + 1].split(';')[0].trim().toUpperCase();
      if (/^[A-Z]{3}$/.test(cur)) return cur;
    }
    return 'PLN';
  }

  private toRow(r: Record<string, string>, idx: number, currencyCode: string) {
    const dateRaw = r['#Data operacji'] || r['#Data księgowania'] || '';
    const amountRaw = r['#Kwota'] || '';
    const opis = (r['#Opis operacji'] || '').trim();
    const tytul = (r['#Tytuł'] || '').trim();
    const counterparty = (r['#Nadawca/Odbiorca'] || '').trim();

    const date = parsePolishDate(dateRaw);
    const amount = parsePolishAmount(amountRaw);
    if (!date || !Number.isFinite(amount)) return null;

    // Some exports do carry a trailing 3-letter code on the amount; honor it.
    const currencyMatch = amountRaw.trim().match(/([A-Z]{3})$/u);
    const currency = currencyMatch?.[1] ?? currencyCode;

    const kind: 'expense' | 'income' = amount < 0 ? 'expense' : 'income';
    // mBank puts the merchant in #Tytuł for card payments (#Nadawca/Odbiorca
    // is often blank), but transfers carry it in #Nadawca/Odbiorca. Prefer
    // #Tytuł for display, and scan all three fields for the category hint so a
    // merchant name is found wherever the bank placed it.
    const description = tytul || opis || counterparty;
    const merchant = tytul || counterparty || opis || undefined;
    const categorySource = [tytul, counterparty, opis].filter(Boolean).join(' ');

    return {
      idx,
      kind,
      date,
      amount: Math.abs(amount),
      currencyCode: currency,
      description,
      merchant,
      suggestedCategoryName: suggestCategoryFromMerchantPL(categorySource),
    };
  }
}
