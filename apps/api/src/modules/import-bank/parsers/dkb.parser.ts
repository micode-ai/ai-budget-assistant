import type { BankParser, ParserOptions, ParserResult } from './parser.interface';
import { detectCells, germanRow, notNull, parseGermanAmount, parseGermanDate, parseTable } from './german-common';

/**
 * DKB, both export generations.
 *
 * New (since the 2023 banking switch): metadata lines (`"Girokonto";"DE…"`,
 * `"Kontostand vom …"`), then `"Buchungsdatum";…;"Zahlungsempfänger*in";…;
 * "Betrag (€)"`. UTF-8 with BOM, two-digit years, amounts with variable
 * decimals (`"200"`, `"-62,3"`). The counterparty is the payee on an outgoing
 * row and the payer on an incoming one (`Umsatztyp` Ausgang/Eingang); a card
 * payee reads `EDEKA//MUENCHEN/DE` and is cut at `//`.
 *
 * Legacy: `"Kontonummer:"`, `"Von:"`, `"Bis:"`, `"Kontostand vom …"` lines, then
 * `"Buchungstag";…;"Auftraggeber / Begünstigter";…;"Betrag (EUR)"`, ISO-8859-1,
 * a trailing `;` on every line.
 *
 * Pending rows (`Status` = Vorgemerkt) are skipped, as for the Sparkasse.
 */
export class DkbParser implements BankParser {
  id = 'dkb' as const;
  displayName = 'DKB';

  detect(headers: string[], sampleRows: string[][] = []): boolean {
    const cells = detectCells(headers, sampleRows);
    if (cells.includes('zahlungsempfänger*in') && cells.includes('umsatztyp')) return true;
    if (cells.includes('auftraggeber / begünstigter') && cells.includes('betrag (eur)')) return true;
    // The table header sits below the sample the caller passes (three rows,
    // and Papa's preview counts the blank lines between the metadata too), so
    // recognise the first metadata lines themselves.
    const first = (headers[0] ?? '').trim().toLowerCase();
    const second = (headers[1] ?? '').trim().toLowerCase();
    if (/^(girokonto|tagesgeld|dkb festgeld)/.test(first) && /^de\d{2}/.test(second)) return true;
    return first === 'kontonummer:' && /^de\d{2}/.test(second) && cells.includes('von:');
  }

  parse(text: string, _opts?: ParserOptions): ParserResult {
    const modern = parseTable(text, ['buchungsdatum', 'umsatztyp']);
    if (modern.headers.includes('Umsatztyp')) {
      const parsed = modern.rows
        .map((r, i) => {
          if ((r['Status'] ?? '').toLowerCase().startsWith('vorgemerkt')) return null;
          const incoming = (r['Umsatztyp'] ?? '').toLowerCase() === 'eingang';
          const party = incoming ? r['Zahlungspflichtige*r'] : r['Zahlungsempfänger*in'];
          return germanRow(i, {
            date: parseGermanDate(r['Buchungsdatum']),
            amount: parseGermanAmount(r['Betrag (€)'] ?? r['Betrag (EUR)']),
            counterparty: (party ?? '').split('//')[0],
            purpose: r['Verwendungszweck'],
          });
        })
        .filter(notNull);
      return { rows: parsed, detectedHeaders: modern.headers };
    }

    const legacy = parseTable(text, ['buchungstag', 'auftraggeber / begünstigter']);
    const parsed = legacy.rows
      .map((r, i) =>
        germanRow(i, {
          date: parseGermanDate(r['Buchungstag']),
          amount: parseGermanAmount(r['Betrag (EUR)']),
          counterparty: r['Auftraggeber / Begünstigter'],
          purpose: r['Verwendungszweck'] || r['Buchungstext'],
        }),
      )
      .filter(notNull);
    return { rows: parsed, detectedHeaders: legacy.headers };
  }
}
