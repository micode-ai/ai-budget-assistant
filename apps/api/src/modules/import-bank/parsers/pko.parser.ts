import * as Papa from 'papaparse';
import type { BankParser, ParserOptions, ParserResult } from './parser.interface';
import { parsePolishAmount } from '../utils/polish-amount';
import { parsePolishDate } from '../utils/polish-date';
import { suggestCategoryFromMerchantPL } from '../merchants/merchants-pl';

export class PkoParser implements BankParser {
  id = 'pko' as const;
  displayName = 'PKO BP';

  detect(headers: string[]): boolean {
    const lower = headers.map((h) => h.toLowerCase());
    return lower.includes('obciążenia') && lower.includes('uznania') && lower.some((h) => h.startsWith('data'));
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
    const date = parsePolishDate(r['Data'] || '');
    if (!date) return null;

    const debit = parsePolishAmount(r['Obciążenia'] || '');
    const credit = parsePolishAmount(r['Uznania'] || '');
    const description = (r['Opis transakcji'] || '').trim();

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

    return {
      idx,
      kind,
      date,
      amount,
      currencyCode: 'PLN',
      description,
      merchant: undefined,
      suggestedCategoryName: suggestCategoryFromMerchantPL(description),
    };
  }
}
