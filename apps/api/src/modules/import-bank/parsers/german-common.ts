import * as Papa from 'papaparse';
import { parsePolishAmount } from '../utils/polish-amount';
import { parsePolishDate } from '../utils/polish-date';
import { suggestCategoryFromMerchantDE } from '../merchants/merchants-de';

/**
 * Helpers shared by the German bank parsers (Sparkasse, DKB, ING Deutschland,
 * comdirect, Commerzbank, N26).
 *
 * German exports share a number format with Polish ones (`1.234,56`, decimal
 * comma), so amounts go through `parsePolishAmount`; what differs is the
 * two-digit year some banks write (`24.11.26`), a trailing `€`, and the
 * metadata lines several banks put above the table.
 */

/** `24.11.2026` or `24.11.26` → `2026-11-24`; '' when unreadable. */
export function parseGermanDate(raw: string | undefined): string {
  const s = (raw ?? '').trim().replace(/^"|"$/g, '');
  const short = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/);
  if (short) return parsePolishDate(`${short[1]}.${short[2]}.20${short[3]}`);
  return parsePolishDate(s);
}

/** `-1.234,56`, `1.234,56 €`, `+12,00 EUR`, `-1.450` → number; NaN when empty. */
export function parseGermanAmount(raw: string | undefined): number {
  let s = (raw ?? '').replace(/€/g, '').trim().replace(/^\+/, '');
  // A German amount never uses the dot as a decimal point, so `-1.450` (DKB
  // writes whole euros without decimals) is minus one thousand four hundred
  // fifty. parsePolishAmount would read a lone dot as a decimal point.
  if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return parsePolishAmount(s);
}

/**
 * Index of the table's header line: the first line whose lower-cased text
 * contains every one of `needles`. -1 when none does.
 */
export function findHeaderLine(lines: string[], needles: string[]): number {
  return lines.findIndex((l) => {
    const low = l.toLowerCase();
    return needles.every((n) => low.includes(n));
  });
}

/**
 * Parses the table that starts at the header line matching `needles`, skipping
 * any metadata lines above it. Rows that do not have the header's columns
 * (a summary line under the table) come back as records with missing keys and
 * are dropped by each parser's own date/amount check.
 */
export function parseTable(
  text: string,
  needles: string[],
  delimiter = ';',
): { rows: Record<string, string>[]; headers: string[] } {
  const lines = text.split(/\r?\n/);
  const idx = findHeaderLine(lines, needles);
  const csv = idx >= 0 ? lines.slice(idx).join('\n') : text;
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    delimiter,
    transformHeader: (h) => h.trim(),
  });
  return { rows: result.data, headers: result.meta.fields ?? [] };
}

/** Lower-cased cells of the header line and the sample rows, for detect(). */
export function detectCells(headers: string[], sampleRows: string[][] = []): string[] {
  return [...headers, ...sampleRows.flat()].map((c) => (c ?? '').trim().toLowerCase());
}

/** Collapses the runs of spaces German banks pad purpose lines with. */
export function clean(s: string | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * One statement line → an import row, or null when it has no readable date or
 * amount, or a zero amount (balance and fee-statement info lines).
 *
 * `description` is what the dedup key hashes (`buildExternalRef`), so it must
 * come from the same fields on every import of the same file.
 */
export function germanRow(
  idx: number,
  f: { date: string; amount: number; currency?: string; counterparty?: string; purpose?: string },
) {
  if (!f.date || !Number.isFinite(f.amount) || f.amount === 0) return null;
  const counterparty = clean(f.counterparty);
  const purpose = clean(f.purpose);
  const currency = clean(f.currency).toUpperCase();
  return {
    idx,
    kind: (f.amount < 0 ? 'expense' : 'income') as 'expense' | 'income',
    date: f.date,
    amount: Math.abs(f.amount),
    currencyCode: /^[A-Z]{3}$/.test(currency) ? currency : 'EUR',
    description: purpose || counterparty,
    merchant: counterparty || undefined,
    suggestedCategoryName: suggestCategoryFromMerchantDE(`${counterparty} ${purpose}`),
  };
}

export type GermanRow = NonNullable<ReturnType<typeof germanRow>>;

export const notNull = <T>(r: T | null): r is T => r != null;
