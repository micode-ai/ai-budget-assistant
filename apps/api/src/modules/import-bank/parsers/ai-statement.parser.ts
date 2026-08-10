import type { BankParser, ParserOptions, ParserResult } from './parser.interface';
import type { ExtractedRow } from '../ai/statement-ai.validator';

/**
 * Convert LLM-extracted rows into the shape every other parser produces.
 * A negative amount is money leaving the account; ImportRow carries a positive
 * magnitude plus a `kind`, so the sign moves into `kind` here.
 */
export function toParserResult(rows: ExtractedRow[]): ParserResult {
  return {
    rows: rows.map((r, idx) => ({
      idx,
      kind: r.amount < 0 ? ('expense' as const) : ('income' as const),
      date: r.date,
      amount: Math.abs(r.amount),
      currencyCode: r.currencyCode,
      description: r.description || r.merchant || '',
      merchant: r.merchant,
      suggestedCategoryName: undefined,
    })),
    detectedHeaders: [],
  };
}

/**
 * Registry entry for AI-extracted PDF statements. Like UniversalParser it is
 * never auto-selected — detect() always returns false — but unlike it, its
 * rows do not come from the raw text at all: StatementAiService produces them
 * and the service calls toParserResult directly. The class exists so that
 * `parser.id` is `'ai'` when buildExternalRef and buildPreviewResponse run.
 */
export class AiStatementParser implements BankParser {
  id = 'ai' as const;
  displayName = 'AI (any bank)';
  format = 'pdf' as const;

  detect(_headers: string[], _sampleRows: string[][]): boolean {
    return false;
  }

  parse(_text: string, _opts?: ParserOptions): ParserResult {
    throw new Error('AiStatementParser rows are supplied by StatementAiService');
  }
}
