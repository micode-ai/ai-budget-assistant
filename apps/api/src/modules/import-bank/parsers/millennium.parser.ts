import * as Papa from 'papaparse';
import type { BankParser, ParserOptions, ParserResult } from './parser.interface';
import { parsePolishAmount } from '../utils/polish-amount';
import { parsePolishDate } from '../utils/polish-date';
import { suggestCategoryFromMerchantPL } from '../merchants/merchants-pl';

export class MillenniumParser implements BankParser {
  id = 'millennium' as const;
  displayName = 'Bank Millennium';

  detect(headers: string[]): boolean {
    const lower = headers.map((h) => h.toLowerCase());
    return lower.includes('obciążenie') && lower.includes('uznanie');
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
    const date = parsePolishDate(r['Data transakcji'] || '');
    if (!date) return null;

    const debit = parsePolishAmount(r['Obciążenie'] || '');
    const credit = parsePolishAmount(r['Uznanie'] || '');

    let amount: number;
    let kind: 'expense' | 'income';
    if (Number.isFinite(debit) && debit > 0) {
      amount = debit;
      kind = 'expense';
    } else if (Number.isFinite(credit) && credit > 0) {
      amount = credit;
      kind = 'income';
    } else {
      return null;
    }

    const description = (r['Opis'] || '').trim();
    return {
      idx,
      kind,
      date,
      amount,
      currencyCode: (r['Waluta'] || 'PLN').trim(),
      description,
      merchant: undefined,
      suggestedCategoryName: suggestCategoryFromMerchantPL(description),
    };
  }
}
