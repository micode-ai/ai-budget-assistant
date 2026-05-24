import * as Papa from 'papaparse';
import type { BankParser, ParserOptions, ParserResult } from './parser.interface';
import { parsePolishAmount } from '../utils/polish-amount';
import { parsePolishDate } from '../utils/polish-date';
import { suggestCategoryFromMerchantPL } from '../merchants/merchants-pl';

interface PkoColIndex {
  date: number;
  amount: number;
  currency: number;
  type: number;
  opis: number;
}

/**
 * Real PKO BP CSV export ("Zestawienie operacji"):
 * - comma-delimited, every field double-quoted, no preamble (header is line 0)
 * - header: "Data operacji","Data waluty","Typ transakcji","Kwota","Waluta",
 *   "Saldo po transakcji","Opis transakcji", then several UNNAMED trailing
 *   columns ("","",…) carrying "Label: value" extras (Lokalizacja, card no.,
 *   Nazwa odbiorcy/nadawcy, …).
 * - single signed amount in `Kwota` (e.g. "-64.10", "+6600.00"), period decimal.
 * Because the trailing columns share an empty header name, we parse in array
 * mode and index by the header row instead of `header: true` (which would
 * collapse every empty-named column onto one key). See ABA-126.
 */
export class PkoParser implements BankParser {
  id = 'pko' as const;
  displayName = 'PKO BP';

  detect(headers: string[], sampleRows: string[][] = []): boolean {
    const joined = [...headers, ...sampleRows.flat()].join(' ').toLowerCase();
    return (
      joined.includes('data operacji') &&
      joined.includes('kwota') &&
      joined.includes('typ transakcji')
    );
  }

  parse(text: string, _opts?: ParserOptions): ParserResult {
    const result = Papa.parse<string[]>(text, { skipEmptyLines: true, delimiter: ',' });
    const data = result.data;
    if (data.length === 0) return { rows: [], detectedHeaders: [] };

    const header = data[0].map((h) => h.trim());
    const col = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
    const idx: PkoColIndex = {
      date: col('Data operacji'),
      amount: col('Kwota'),
      currency: col('Waluta'),
      type: col('Typ transakcji'),
      opis: col('Opis transakcji'),
    };

    const rows = data
      .slice(1)
      .map((cells, i) => this.toRow(cells, i, idx))
      .filter((r): r is NonNullable<ReturnType<typeof this.toRow>> => r != null);

    return { rows, detectedHeaders: header };
  }

  private toRow(cells: string[], i: number, idx: PkoColIndex) {
    const date = parsePolishDate(idx.date >= 0 ? cells[idx.date] ?? '' : '');
    const amount = parsePolishAmount(idx.amount >= 0 ? cells[idx.amount] ?? '' : '');
    if (!date || !Number.isFinite(amount)) return null;

    const currencyCode = (idx.currency >= 0 ? (cells[idx.currency] ?? '').trim() : '') || 'PLN';
    const typ = idx.type >= 0 ? (cells[idx.type] ?? '').trim() : '';
    const description = this.buildDescription(cells, idx) || typ;

    return {
      idx: i,
      kind: amount < 0 ? ('expense' as const) : ('income' as const),
      date,
      amount: Math.abs(amount),
      currencyCode,
      description,
      merchant: description || undefined,
      suggestedCategoryName: suggestCategoryFromMerchantPL(description),
    };
  }

  /**
   * Build a human-readable description from PKO's "Label: value" extra columns:
   * card-payment merchant (Adres: … Miasto:), then transfer counterparty
   * (Nazwa odbiorcy / Nazwa nadawcy), then a non-numeric Tytuł, else Typ.
   */
  private buildDescription(cells: string[], idx: PkoColIndex): string {
    const tail = cells.join(' | ');

    const adres = tail.match(/Adres:\s*([^|]+?)(?:\s+Miasto:|\s*\||$)/i);
    if (adres && adres[1].trim()) return adres[1].trim();

    const odbiorca = tail.match(/Nazwa odbiorcy:\s*([^|]+?)(?:\s*\||$)/i);
    if (odbiorca && odbiorca[1].trim()) return odbiorca[1].trim();

    const nadawca = tail.match(/Nazwa nadawcy:\s*([^|]+?)(?:\s*\||$)/i);
    if (nadawca && nadawca[1].trim()) return nadawca[1].trim();

    const opisRaw = idx.opis >= 0 ? cells[idx.opis] ?? '' : '';
    const tytul = opisRaw.replace(/^Tytuł:\s*/i, '').trim();
    if (tytul && !/^[\d\s]+$/.test(tytul)) return tytul;

    return '';
  }
}
