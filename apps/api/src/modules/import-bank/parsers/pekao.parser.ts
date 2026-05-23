import * as Papa from 'papaparse';
import type { BankParser, ParserOptions, ParserResult } from './parser.interface';
import { parsePolishAmount } from '../utils/polish-amount';
import { parsePolishDate } from '../utils/polish-date';
import { suggestCategoryFromMerchantPL } from '../merchants/merchants-pl';

export class PekaoParser implements BankParser {
  id = 'pekao' as const;
  displayName = 'Pekao SA';

  detect(headers: string[]): boolean {
    const lower = headers.map((h) => h.toLowerCase());
    return lower.includes('data operacji') && lower.includes('data waluty') && lower.includes('kwota');
  }

  parse(text: string, _opts?: ParserOptions): ParserResult {
    const result = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      delimiter: ';',
    });
    const headers = result.meta.fields ?? [];
    const rows = result.data
      .map((r, i) => this.toRow(r, i))
      .filter((r): r is NonNullable<ReturnType<typeof this.toRow>> => r != null);
    return { rows, detectedHeaders: headers };
  }

  private toRow(r: Record<string, string>, idx: number) {
    const date = parsePolishDate(r['Data operacji'] || r['Data waluty'] || '');
    const amount = parsePolishAmount(r['Kwota'] || '');
    if (!date || !Number.isFinite(amount)) return null;
    const counterparty = (r['Nadawca/Odbiorca'] || '').trim();
    const description = (r['Opis'] || '').trim();
    return {
      idx,
      kind: amount < 0 ? ('expense' as const) : ('income' as const),
      date,
      amount: Math.abs(amount),
      currencyCode: (r['Waluta'] || 'PLN').trim(),
      description: description || counterparty,
      merchant: counterparty || undefined,
      suggestedCategoryName: suggestCategoryFromMerchantPL(counterparty),
    };
  }
}
