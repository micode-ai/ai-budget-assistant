import * as Papa from 'papaparse';
import type { BankParser, ParserOptions, ParserResult } from './parser.interface';
import { parsePolishAmount } from '../utils/polish-amount';
import { parsePolishDate } from '../utils/polish-date';
import { suggestCategoryFromMerchantPL } from '../merchants/merchants-pl';

export class IngParser implements BankParser {
  id = 'ing' as const;
  displayName = 'ING Bank Śląski';

  detect(headers: string[]): boolean {
    const lower = headers.map((h) => h.toLowerCase());
    return lower.includes('dane kontrahenta') && lower.some((h) => h.includes('kwota transakcji'));
  }

  parse(text: string, _opts?: ParserOptions): ParserResult {
    const result = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      delimiter: ';',
    });

    const headers = result.meta.fields ?? [];
    const amountCol = headers.find((h) => h.toLowerCase().includes('kwota transakcji')) ?? '';
    const rows = result.data
      .map((r, i) => this.toRow(r, i, amountCol))
      .filter((r): r is NonNullable<ReturnType<typeof this.toRow>> => r != null);

    return { rows, detectedHeaders: headers };
  }

  private toRow(r: Record<string, string>, idx: number, amountCol: string) {
    const date = parsePolishDate(r['Data transakcji'] || r['Data księgowania'] || '');
    const amount = parsePolishAmount(r[amountCol] || '');
    if (!date || !Number.isFinite(amount)) return null;

    const counterparty = (r['Dane kontrahenta'] || '').trim();
    const tytul = (r['Tytuł'] || '').trim();
    const currencyCode = (r['Waluta'] || 'PLN').trim();

    const kind: 'expense' | 'income' = amount < 0 ? 'expense' : 'income';
    const description = tytul || counterparty;
    const merchant = counterparty || undefined;

    return {
      idx,
      kind,
      date,
      amount: Math.abs(amount),
      currencyCode,
      description,
      merchant,
      suggestedCategoryName: suggestCategoryFromMerchantPL(merchant),
    };
  }
}
