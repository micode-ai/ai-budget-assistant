import type { BankParser, ParserOptions, ParserResult } from './parser.interface';
import { parsePolishAmount } from '../utils/polish-amount';
import { parsePolishDate } from '../utils/polish-date';
import { suggestCategoryFromMerchantPL } from '../merchants/merchants-pl';

// Thousands separator may be a regular or non-breaking space; build at runtime
// to keep the source ASCII-only.
const THOUSANDS_SEP = ' ' + String.fromCharCode(0x00a0);
const NUM = `[0-9]{1,3}(?:[${THOUSANDS_SEP}][0-9]{3})*,[0-9]{2}`;
// Standalone posting/operation date line: YYYY.MM.DD
const DATE_LINE = /^[0-9]{4}\.[0-9]{2}\.[0-9]{2}$/;
// The amount line: "<opis…> <signed KWOTA> <SALDO>".
const AMOUNT_LINE = new RegExp(`^(.+?)\\s+(-?${NUM})\\s+(${NUM})$`);

/**
 * Alior Bank delivers statements as a text-based PDF ("Wyciąg z rachunku
 * bankowego"), not CSV. After extraction each transaction is three lines:
 *
 *   <data księgowania>   (YYYY.MM.DD)
 *   <data operacji>      (YYYY.MM.DD)
 *   <OPIS> <signed KWOTA> <SALDO>
 *
 * followed by free-text continuation lines (counterparty / card / location)
 * that we use only to enrich the description. KWOTA carries the sign:
 * negative = expense (Obciążenie), positive = income (Uznanie). See ABA-126.
 */
export class AliorParser implements BankParser {
  id = 'alior' as const;
  displayName = 'Alior Bank';
  format = 'pdf' as const;

  detect(headers: string[], sampleRows: string[][] = []): boolean {
    const joined = [...headers, ...sampleRows.flat()].join(' ').toLowerCase();
    return joined.includes('alior bank');
  }

  parse(text: string, _opts?: ParserOptions): ParserResult {
    const lines = text.split(/\r?\n/).map((l) => l.trim());
    const out: ParserResult['rows'] = [];

    for (let i = 0; i + 2 < lines.length; i++) {
      if (!DATE_LINE.test(lines[i]) || !DATE_LINE.test(lines[i + 1])) continue;

      const amtM = lines[i + 2].match(AMOUNT_LINE);
      if (!amtM) continue;

      const kwota = parsePolishAmount(amtM[2]);
      if (!Number.isFinite(kwota) || kwota === 0) continue;

      const opDate = parsePolishDate(lines[i + 1].replace(/\./g, '-'));
      if (!opDate) continue;

      const opis = amtM[1].trim();
      const merchant = this.extractMerchant(lines[i + 3] ?? '');
      const description = merchant ? `${opis} ${merchant}`.trim() : opis;

      out.push({
        idx: out.length,
        kind: kwota < 0 ? 'expense' : 'income',
        date: opDate,
        amount: Math.abs(kwota),
        currencyCode: 'PLN',
        description,
        merchant: merchant || undefined,
        suggestedCategoryName: suggestCategoryFromMerchantPL(`${opis} ${merchant}`),
      });

      i += 2; // skip the consumed date lines
    }

    return { rows: out, detectedHeaders: ['data operacji', 'opis', 'kwota', 'saldo'] };
  }

  /** Best-effort merchant/counterparty from the continuation line. */
  private extractMerchant(line: string): string {
    if (!line) return '';
    let s = line;
    // Drop a leading domestic account / IBAN number.
    s = s.replace(/^[A-Z]{0,2}\s*[0-9][0-9 ]{10,}\s*/, '');
    // Cut at Alior's per-transaction boilerplate markers.
    s = s.split(
      /\s+(?:Data transakcji|Kod MCC|Kwota w walucie|Kwota i waluta|Nowa Bankowość)/i,
    )[0];
    // Remove a masked card number (e.g. "5575 XXXX XXXX 3660").
    s = s.replace(/\b[0-9]{4}\s+X{4}\s+X{4}\s+[0-9]{4}\b/gi, '');
    return s.replace(/\s+/g, ' ').trim();
  }
}
