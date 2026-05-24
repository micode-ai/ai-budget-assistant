import type { BankParser, ParserOptions, ParserResult } from './parser.interface';
import { parsePolishAmount } from '../utils/polish-amount';
import { parsePolishDate } from '../utils/polish-date';
import { suggestCategoryFromMerchantPL } from '../merchants/merchants-pl';

// Thousands separator in Polish amounts may be a regular space or a
// non-breaking space; build the class at runtime to keep the source ASCII.
const THOUSANDS_SEP = ' ' + String.fromCharCode(0x00a0);
// A Polish amount token: "0,00", "25,00", "1 200,00".
const NUM = `[0-9]{1,3}(?:[${THOUSANDS_SEP}][0-9]{3})*,[0-9]{2}`;
// A transaction row ends on a line of exactly three such amounts:
// wpływy (inflow) | wydatki (outflow) | saldo (balance).
const AMOUNTS_LINE = new RegExp(`^(${NUM})\\s+(${NUM})\\s+(${NUM})$`);
// A transaction starts on a line beginning with two dot-dates:
// data księgowania | data operacji | <opis start…>
const START_LINE =
  /^([0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4})\s+([0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4})\s+(.*)$/;

interface ErsteBlock {
  bookingDate: string;
  opDate: string;
  opis: string[];
}

/**
 * Erste Bank Polska delivers statements as a text-based PDF ("Wyciąg"), not
 * CSV. After text extraction the transaction table is laid out as:
 *
 *   data księgowania | data operacji | opis | wpływy | wydatki | saldo
 *
 * Each transaction spans several lines: a start line with the two dates and the
 * first opis fragment, zero or more opis continuation lines, then a line with
 * exactly three Polish amounts (inflow, outflow, balance). Page breaks inject
 * headers/footers between transactions; those land outside any open block and
 * are ignored by the state machine. See ABA-126.
 */
export class ErsteParser implements BankParser {
  id = 'erste' as const;
  displayName = 'Erste Bank';
  format = 'pdf' as const;

  detect(headers: string[], sampleRows: string[][] = []): boolean {
    const joined = [...headers, ...sampleRows.flat()].join(' ').toLowerCase();
    return (
      joined.includes('erste bank polska') ||
      (joined.includes('wyciąg') && joined.includes('wpływy') && joined.includes('wydatki'))
    );
  }

  parse(text: string, _opts?: ParserOptions): ParserResult {
    const lines = text.split(/\r?\n/).map((l) => l.trim());

    let started = false;
    let current: ErsteBlock | null = null;
    const finished: Array<ErsteBlock & { wplywy: number; wydatki: number }> = [];

    for (const line of lines) {
      if (!line) continue;
      if (line.includes('Saldo początkowe')) {
        started = true;
        continue;
      }
      if (line.includes('Saldo końcowe')) break;
      if (!started) continue;

      const startM = line.match(START_LINE);
      if (startM) {
        current = { bookingDate: startM[1], opDate: startM[2], opis: [startM[3]] };
        continue;
      }

      const amtM = line.match(AMOUNTS_LINE);
      if (amtM && current) {
        finished.push({
          ...current,
          wplywy: parsePolishAmount(amtM[1]),
          wydatki: parsePolishAmount(amtM[2]),
        });
        current = null;
        continue;
      }

      if (current) current.opis.push(line);
    }

    const rows = finished
      .map((b, i) => this.toRow(b, i))
      .filter((r): r is NonNullable<ReturnType<typeof this.toRow>> => r != null);

    return { rows, detectedHeaders: ['data operacji', 'opis', 'wpływy', 'wydatki', 'saldo'] };
  }

  private toRow(b: ErsteBlock & { wplywy: number; wydatki: number }, i: number) {
    const date = parsePolishDate(b.opDate || b.bookingDate);
    if (!date) return null;

    const inflow = Number.isFinite(b.wplywy) ? b.wplywy : 0;
    const outflow = Number.isFinite(b.wydatki) ? b.wydatki : 0;

    let kind: 'expense' | 'income';
    let amount: number;
    if (inflow > 0) {
      kind = 'income';
      amount = inflow;
    } else if (outflow > 0) {
      kind = 'expense';
      amount = outflow;
    } else {
      return null;
    }

    const opisFull = b.opis.join(' ').replace(/\s+/g, ' ').trim();
    // Card payments embed the merchant after "KARTĄ <amount> PLN <MERCHANT>".
    const cardM = opisFull.match(/KART[ĄA]\s+[\d.,]+\s*PLN\s+(.+)$/i);
    const description = cardM ? cardM[1].trim() : opisFull;

    return {
      idx: i,
      kind,
      date,
      amount,
      currencyCode: 'PLN',
      description,
      merchant: description || undefined,
      suggestedCategoryName: suggestCategoryFromMerchantPL(opisFull),
    };
  }
}
