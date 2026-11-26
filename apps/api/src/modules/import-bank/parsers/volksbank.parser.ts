import type { BankParser, ParserOptions, ParserResult } from './parser.interface';
import { detectCells, germanRow, notNull, parseGermanAmount, parseGermanDate, parseTable } from './german-common';

/**
 * Volksbank / Raiffeisenbank (Atruvia), also Sparda-Bank West and GLS: header
 * on line 1, unquoted, `;`, UTF-8 with BOM. Sparda West spells `Währung` with
 * the umlaut, the others `Waehrung`.
 *
 * The bank appends `EREF:`/`MREF:`/`CRED:` tails to the purpose; they are cut
 * off so the description reads as what the payment was for.
 */
export class VolksbankParser implements BankParser {
  id = 'volksbank' as const;
  displayName = 'Volksbank / Raiffeisenbank';

  detect(headers: string[], sampleRows: string[][] = []): boolean {
    const cells = detectCells(headers, sampleRows);
    return cells.includes('name zahlungsbeteiligter') && cells.includes('iban auftragskonto');
  }

  parse(text: string, _opts?: ParserOptions): ParserResult {
    const { rows, headers } = parseTable(text, ['name zahlungsbeteiligter', 'betrag']);
    const parsed = rows
      .map((r, i) =>
        germanRow(i, {
          date: parseGermanDate(r['Buchungstag']),
          amount: parseGermanAmount(r['Betrag']),
          currency: r['Waehrung'] ?? r['Währung'],
          counterparty: r['Name Zahlungsbeteiligter'],
          purpose: (r['Verwendungszweck'] || r['Buchungstext'] || '').split(/\s(?:EREF|MREF|CRED|IBAN|BIC):/)[0],
        }),
      )
      .filter(notNull);
    return { rows: parsed, detectedHeaders: headers };
  }
}
