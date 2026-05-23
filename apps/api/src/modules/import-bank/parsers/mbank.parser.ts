import * as Papa from 'papaparse';
import type { BankParser, ParserOptions, ParserResult } from './parser.interface';
import { parsePolishAmount } from '../utils/polish-amount';
import { parsePolishDate } from '../utils/polish-date';
import { suggestCategoryFromMerchantPL } from '../merchants/merchants-pl';

export class MBankParser implements BankParser {
  id = 'mbank' as const;
  displayName = 'mBank';

  detect(headers: string[]): boolean {
    const h = headers.map((x) => x.toLowerCase());
    return h.some((x) => x.startsWith('#data operacji')) && h.some((x) => x.startsWith('#kwota'));
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
    const dateRaw = r['#Data operacji'] || r['#Data księgowania'] || '';
    const amountRaw = r['#Kwota'] || '';
    const opis = r['#Opis operacji'] || '';
    const tytul = r['#Tytuł'] || '';
    const counterparty = r['#Nadawca/Odbiorca'] || '';

    const date = parsePolishDate(dateRaw);
    const amount = parsePolishAmount(amountRaw);
    if (!date || !Number.isFinite(amount)) return null;

    // Currency code: extract trailing 3-letter code if present, else PLN
    const currencyMatch = amountRaw.trim().match(/([A-Z]{3})$/u);
    const currencyCode = currencyMatch?.[1] ?? 'PLN';

    const kind: 'expense' | 'income' = amount < 0 ? 'expense' : 'income';
    const description = tytul || opis || counterparty;
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
