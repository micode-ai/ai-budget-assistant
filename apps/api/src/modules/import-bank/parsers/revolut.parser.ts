import * as Papa from 'papaparse';
import type { BankParser, ParserOptions, ParserResult } from './parser.interface';
import { suggestCategoryFromMerchantPL } from '../merchants/merchants-pl';

/**
 * Revolut CSV export ("Statements → CSV" in the Revolut app).
 * Format: comma-delimited UTF-8, headers on row 0, no preamble.
 * Columns: Type, Product, Started Date, Completed Date, Description,
 *          Amount, Fee, Currency, State, Balance.
 * Amount is signed (negative = debit/expense). Fee is already folded in.
 * Exchange rows (Type=EXCHANGE) appear as paired debit+credit rows with the
 * same Started Date and opposite signs in different currencies — the shared
 * pairFxRows() utility converts them to kind='fx' ImportRows.
 */
export class RevolutParser implements BankParser {
  id = 'revolut' as const;
  displayName = 'Revolut';

  detect(headers: string[]): boolean {
    const lower = new Set(headers.map((h) => h.toLowerCase().trim()));
    return (
      lower.has('started date') &&
      lower.has('completed date') &&
      lower.has('balance')
    );
  }

  parse(text: string, _opts?: ParserOptions): ParserResult {
    const result = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      delimiter: ',',
    });

    const headers = result.meta.fields ?? [];
    const rows = result.data
      .map((r, i) => this.toRow(r, i))
      .filter((r): r is NonNullable<ReturnType<typeof this.toRow>> => r != null);

    return { rows, detectedHeaders: headers };
  }

  private toRow(r: Record<string, string>, idx: number) {
    const state = (r['State'] ?? '').trim().toUpperCase();
    if (state !== 'COMPLETED') return null;

    const dateRaw = (r['Started Date'] ?? '').trim();
    const date = this.parseDate(dateRaw);
    if (!date) return null;

    const amountRaw = (r['Amount'] ?? '').trim();
    const amount = parseFloat(amountRaw);
    if (!Number.isFinite(amount)) return null;

    const currencyCode = (r['Currency'] ?? 'PLN').trim().toUpperCase();
    const description = (r['Description'] ?? '').trim();
    const merchant = description || undefined;

    const kind: 'expense' | 'income' = amount < 0 ? 'expense' : 'income';

    return {
      idx,
      kind,
      date,
      amount: Math.abs(amount),
      currencyCode,
      description,
      merchant,
      suggestedCategoryName: suggestCategoryFromMerchantPL(description),
    };
  }

  /** Parse Revolut date: 'YYYY-MM-DD HH:MM:SS' or 'YYYY-MM-DD' → 'YYYY-MM-DD'. */
  private parseDate(raw: string): string | null {
    const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  }
}
