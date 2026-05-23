import * as Papa from 'papaparse';
import type { BankParser, ParserOptions, ParserResult } from './parser.interface';
import { parsePolishAmount } from '../utils/polish-amount';
import { parsePolishDate } from '../utils/polish-date';

export class UniversalParser implements BankParser {
  id = 'universal' as const;
  displayName = 'Other (custom mapping)';

  detect(_headers: string[], _sampleRows: string[][]): boolean {
    return false;
  }

  parse(text: string, opts?: ParserOptions): ParserResult {
    const mapping = opts?.columnMapping;
    if (!mapping) {
      throw new Error('UniversalParser requires opts.columnMapping');
    }

    const delimiter = opts?.delimiter ?? ';';
    const amountFormat = opts?.amountFormat ?? 'polish';
    const dateFormat = opts?.dateFormat ?? 'auto';

    const result = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      delimiter,
    });
    const headers = result.meta.fields ?? [];

    const rows = result.data
      .map((r, i) => this.toRow(r, i, mapping, amountFormat, dateFormat))
      .filter((r): r is NonNullable<ReturnType<typeof this.toRow>> => r != null);

    return { rows, detectedHeaders: headers };
  }

  private toRow(
    r: Record<string, string>,
    idx: number,
    mapping: NonNullable<ParserOptions['columnMapping']>,
    amountFormat: 'polish' | 'standard',
    dateFormat: 'auto' | 'DD.MM.YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD',
  ) {
    const date = parsePolishDate(r[mapping.date] || '', dateFormat);
    if (!date) return null;

    let amount: number;
    let kind: 'expense' | 'income';

    if (typeof mapping.amount === 'string') {
      const raw = parsePolishAmount(r[mapping.amount] || '', amountFormat);
      if (!Number.isFinite(raw)) return null;
      amount = Math.abs(raw);
      kind = raw < 0 ? 'expense' : 'income';
    } else {
      const debit = parsePolishAmount(r[mapping.amount.debit] || '', amountFormat);
      const credit = parsePolishAmount(r[mapping.amount.credit] || '', amountFormat);
      if (Number.isFinite(debit) && debit > 0) {
        amount = debit;
        kind = 'expense';
      } else if (Number.isFinite(credit) && credit > 0) {
        amount = credit;
        kind = 'income';
      } else {
        return null;
      }
    }

    const description = (r[mapping.description] || '').trim();
    const counterparty = mapping.counterparty ? (r[mapping.counterparty] || '').trim() : undefined;
    const currencyCode = mapping.currency ? (r[mapping.currency] || 'PLN').trim() : 'PLN';

    return {
      idx,
      kind,
      date,
      amount,
      currencyCode,
      description: description || counterparty || '',
      merchant: counterparty,
      suggestedCategoryName: undefined,
    };
  }
}
