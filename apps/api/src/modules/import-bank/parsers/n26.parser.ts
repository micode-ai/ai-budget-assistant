import * as Papa from 'papaparse';
import type { BankParser, ParserOptions, ParserResult } from './parser.interface';
import { detectCells, germanRow, notNull } from './german-common';
import { parsePolishAmount } from '../utils/polish-amount';
import { parsePolishDate } from '../utils/polish-date';

/**
 * N26 CSV, three generations, all with the header on line 1, ISO dates and a
 * DECIMAL POINT (`-21.37`), unlike every other German bank:
 *   current  "Booking Date","Value Date","Partner Name","Partner Iban",Type,"Payment Reference","Account Name","Amount (EUR)",…
 *   old (en) "Date","Payee","Account number","Transaction type","Payment reference",…,"Amount (EUR)",…
 *   old (de) Datum,Empfänger,Kontonummer,Transaktionstyp,Verwendungszweck,…,Betrag (EUR),…
 * The delimiter is `,`, except one older `;` variant, so it is read from the
 * header line. `Payment Reference` is "-" when empty.
 */
export class N26Parser implements BankParser {
  id = 'n26' as const;
  displayName = 'N26';

  detect(headers: string[], sampleRows: string[][] = []): boolean {
    const cells = detectCells(headers, sampleRows);
    if (cells.includes('partner iban') && cells.includes('account name')) return true;
    if (cells.includes('transaction type') && cells.includes('amount (foreign currency)')) return true;
    return cells.includes('transaktionstyp') && cells.includes('betrag (fremdwährung)');
  }

  parse(text: string, opts?: ParserOptions): ParserResult {
    const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
    const delimiter =
      opts?.delimiter ?? (firstLine.split(';').length > firstLine.split(',').length ? ';' : ',');
    const result = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      delimiter,
      transformHeader: (h) => h.trim(),
    });
    const headers = result.meta.fields ?? [];
    const pick = (r: Record<string, string>, ...keys: string[]) =>
      keys.map((k) => r[k]).find((v) => v != null && v !== '') ?? '';
    const rows = result.data
      .map((r, i) => {
        const purpose = pick(r, 'Payment Reference', 'Payment reference', 'Verwendungszweck');
        return germanRow(i, {
          date: parsePolishDate(pick(r, 'Booking Date', 'Date', 'Datum')),
          amount: parsePolishAmount(pick(r, 'Amount (EUR)', 'Betrag (EUR)'), 'standard'),
          currency: 'EUR',
          counterparty: pick(r, 'Partner Name', 'Payee', 'Empfänger'),
          purpose: purpose === '-' ? '' : purpose,
        });
      })
      .filter(notNull);
    return { rows, detectedHeaders: headers };
  }
}
