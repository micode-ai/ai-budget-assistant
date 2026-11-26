import type { BankParser, ParserOptions, ParserResult } from './parser.interface';
import { clean, detectCells, germanRow, notNull, parseGermanAmount, parseGermanDate, parseTable } from './german-common';

const LABELS = ['Auftraggeber:', 'Empfänger:', 'Zahlungspflichtiger:', 'Kto/IBAN:', 'BLZ/BIC:', 'Buchungstext:', 'Ref.'];

/** The text after `label` up to the next known label, or '' when absent. */
function field(text: string, label: string): string {
  const start = text.indexOf(label);
  if (start < 0) return '';
  const rest = text.slice(start + label.length);
  const ends = LABELS.map((l) => rest.indexOf(l)).filter((i) => i >= 0);
  return clean(ends.length ? rest.slice(0, Math.min(...ends)) : rest);
}

/**
 * comdirect "Umsätze Girokonto": a blank or `;` first line, then
 * `"Umsätze Girokonto";"Zeitraum: …";` and `"Neuer Kontostand";…;`, then
 * `"Buchungstag";"Wertstellung (Valuta)";"Vorgang";"Buchungstext";"Umsatz in EUR";`
 * and an `"Alter Kontostand"` trailer. ISO-8859-1, a trailing `;` everywhere.
 *
 * There is no counterparty column: the name is a labelled field inside
 * `Buchungstext` (`Auftraggeber:`/`Empfänger:`/`Zahlungspflichtiger:`, then
 * `Kto/IBAN:`, `Buchungstext:` for the purpose, `Ref.`), sometimes with no
 * space before the next label. Pending rows have `Buchungstag` "offen" and
 * fall out at the date check.
 */
export class ComdirectParser implements BankParser {
  id = 'comdirect' as const;
  displayName = 'comdirect';

  detect(headers: string[], sampleRows: string[][] = []): boolean {
    const cells = detectCells(headers, sampleRows);
    if (cells.includes('wertstellung (valuta)') && cells.some((c) => c.startsWith('umsatz in '))) return true;
    return (
      cells.some((c) => c.startsWith('umsätze ')) &&
      cells.some((c) => c.startsWith('zeitraum:')) &&
      cells.includes('neuer kontostand')
    );
  }

  parse(text: string, _opts?: ParserOptions): ParserResult {
    const { rows, headers } = parseTable(text, ['buchungstag', 'wertstellung (valuta)']);
    const amountCol = headers.find((h) => h.toLowerCase().startsWith('umsatz in ')) ?? 'Umsatz in EUR';
    const currency = amountCol.slice('Umsatz in '.length);
    const parsed = rows
      .map((r, i) => {
        const raw = r['Buchungstext'] ?? '';
        const party = field(raw, 'Auftraggeber:') || field(raw, 'Empfänger:') || field(raw, 'Zahlungspflichtiger:');
        const purpose = field(raw, 'Buchungstext:') || (party ? '' : clean(raw));
        return germanRow(i, {
          date: parseGermanDate(r['Buchungstag']),
          amount: parseGermanAmount(r[amountCol]),
          currency,
          counterparty: party,
          purpose: purpose || r['Vorgang'],
        });
      })
      .filter(notNull);
    return { rows: parsed, detectedHeaders: headers };
  }
}
