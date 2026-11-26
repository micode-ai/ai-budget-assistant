import type { BankParser, ParserOptions, ParserResult } from './parser.interface';
import { detectCells, germanRow, notNull, parseGermanAmount, parseGermanDate, parseTable } from './german-common';

/**
 * Commerzbank CSV: header on line 1, unquoted, `;`, UTF-8 with BOM.
 *
 * Two shapes. The current 8-column one (`Buchungstag;Wertstellung;Umsatzart;
 * Buchungstext;Betrag;Währung;IBAN Kontoinhaber;Kategorie`) packs name, purpose
 * and SEPA references into `Buchungstext` with nothing marking where the name
 * ends, so it yields no merchant, only a description cut at the first
 * `End-to-End-Ref.`/`Mandatsref`. The 11-column one adds `Sender`,
 * `Empfänger` and `Verwendungszweck`. Zero-amount info rows are dropped.
 */
export class CommerzbankParser implements BankParser {
  id = 'commerzbank' as const;
  displayName = 'Commerzbank';

  detect(headers: string[], sampleRows: string[][] = []): boolean {
    const cells = detectCells(headers, sampleRows);
    return cells.includes('umsatzart') && cells.includes('iban kontoinhaber');
  }

  parse(text: string, _opts?: ParserOptions): ParserResult {
    const { rows, headers } = parseTable(text, ['buchungstag', 'umsatzart']);
    const parsed = rows
      .map((r, i) => {
        const amount = parseGermanAmount(r['Betrag']);
        const party = amount < 0 ? r['Empfänger'] : r['Sender'];
        const purpose =
          r['Verwendungszweck'] ||
          (r['Buchungstext'] ?? '').split(/\s(?:End-to-End-Ref\.|Mandatsref|Gläubiger-ID|SEPA-)/)[0];
        return germanRow(i, {
          date: parseGermanDate(r['Buchungstag']),
          amount,
          currency: r['Währung'],
          counterparty: party,
          purpose,
        });
      })
      .filter(notNull);
    return { rows: parsed, detectedHeaders: headers };
  }
}
