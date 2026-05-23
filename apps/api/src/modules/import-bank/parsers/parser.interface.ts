import type { ImportRow, ColumnMapping } from '@budget/shared-types';

export interface ParserOptions {
  columnMapping?: ColumnMapping;
  amountFormat?: 'polish' | 'standard';
  dateFormat?: 'auto' | 'DD.MM.YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD';
  delimiter?: string;
}

export interface ParserResult {
  rows: Omit<ImportRow, 'externalRef' | 'alreadyImported'>[];
  detectedHeaders: string[];
}

export interface BankParser {
  id: 'mbank' | 'pko' | 'ing' | 'millennium' | 'pekao' | 'universal';
  displayName: string;
  detect(headers: string[], sampleRows: string[][]): boolean;
  parse(text: string, opts?: ParserOptions): ParserResult;
}
