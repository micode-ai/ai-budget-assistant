import type { BankParser, ParserOptions, ParserResult } from './parser.interface';
import { detectCells, germanRow, notNull, parseGermanAmount, parseGermanDate, parseTable } from './german-common';

/**
 * Sparkasse online-banking export: CSV-CAMT V2/V8 and the older CSV-MT940.
 * Header on line 1, every field quoted, `;`, Windows-1252, two-digit years
 * (`05.12.25`). BW-Bank (LBBW) writes the identical file.
 *
 * Pending rows (`Info` = "Umsatz vorgemerkt") are skipped: the same charge
 * comes back booked, often with a different purpose text, and would import
 * twice.
 */
export class SparkasseParser implements BankParser {
  id = 'sparkasse' as const;
  displayName = 'Sparkasse';

  detect(headers: string[], sampleRows: string[][] = []): boolean {
    const cells = detectCells(headers, sampleRows);
    return (
      cells.includes('auftragskonto') &&
      cells.includes('valutadatum') &&
      cells.includes('beguenstigter/zahlungspflichtiger')
    );
  }

  parse(text: string, _opts?: ParserOptions): ParserResult {
    const { rows, headers } = parseTable(text, ['auftragskonto', 'buchungstag', 'betrag']);
    const parsed = rows
      .map((r, i) => {
        if ((r['Info'] ?? '').toLowerCase().includes('vorgemerkt')) return null;
        return germanRow(i, {
          date: parseGermanDate(r['Buchungstag']),
          amount: parseGermanAmount(r['Betrag']),
          currency: r['Waehrung'],
          counterparty: r['Beguenstigter/Zahlungspflichtiger'],
          purpose: r['Verwendungszweck'] || r['Buchungstext'],
        });
      })
      .filter(notNull);
    return { rows: parsed, detectedHeaders: headers };
  }
}
