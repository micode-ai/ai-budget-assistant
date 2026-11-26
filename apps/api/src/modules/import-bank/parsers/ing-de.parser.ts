import * as Papa from 'papaparse';
import type { BankParser, ParserOptions, ParserResult } from './parser.interface';
import { detectCells, findHeaderLine, germanRow, notNull, parseGermanAmount, parseGermanDate } from './german-common';

/**
 * ING Deutschland (ING-DiBa) "Umsatzanzeige": about a dozen metadata lines
 * (`Umsatzanzeige;Datei erstellt am: …`, IBAN, Zeitraum, Saldo, a note), then
 * `Buchung;Wertstellungsdatum;Auftraggeber/Empfänger;Buchungstext;
 * Verwendungszweck;…;Betrag;Währung`. Unquoted, `;`, ISO-8859-1.
 *
 * Read by column POSITION, not name: older exports carry two `Währung` columns
 * (one after `Saldo`, one after `Betrag`), and the amount's currency is the
 * one right after `Betrag`. Card payments name the merchant `VISA <merchant>`;
 * the prefix is dropped. ING never exports pending rows.
 *
 * The id is `ing-de` because `ing` is ING Bank Śląski, and a parser id is part
 * of every dedup key it produced, so neither can be renamed.
 */
export class IngDeParser implements BankParser {
  id = 'ing-de' as const;
  displayName = 'ING Deutschland';

  detect(headers: string[], sampleRows: string[][] = []): boolean {
    if ((headers[0] ?? '').trim().toLowerCase() === 'umsatzanzeige') return true;
    const cells = detectCells(headers, sampleRows);
    return cells.includes('buchung') && cells.includes('auftraggeber/empfänger');
  }

  parse(text: string, _opts?: ParserOptions): ParserResult {
    const lines = text.split(/\r?\n/);
    const idx = findHeaderLine(lines, ['buchung;', 'auftraggeber/empf', 'betrag']);
    if (idx < 0) return { rows: [], detectedHeaders: [] };
    const table = Papa.parse<string[]>(lines.slice(idx).join('\n'), {
      skipEmptyLines: true,
      delimiter: ';',
    }).data;
    const header = (table[0] ?? []).map((h) => h.trim().toLowerCase());
    const iDate = header.indexOf('buchung');
    const iParty = header.indexOf('auftraggeber/empfänger');
    const iText = header.indexOf('buchungstext');
    const iPurpose = header.indexOf('verwendungszweck');
    const iAmount = header.indexOf('betrag');

    const rows = table
      .slice(1)
      .map((r, i) =>
        germanRow(i, {
          date: parseGermanDate(r[iDate]),
          amount: parseGermanAmount(r[iAmount]),
          currency: r[iAmount + 1],
          counterparty: (r[iParty] ?? '').replace(/^VISA\s+/i, ''),
          purpose: (iPurpose >= 0 ? r[iPurpose] : '') || r[iText],
        }),
      )
      .filter(notNull);
    return { rows, detectedHeaders: table[0] ?? [] };
  }
}
