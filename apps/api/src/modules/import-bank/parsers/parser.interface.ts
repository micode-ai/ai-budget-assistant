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
  id: 'mbank' | 'pko' | 'revolut' | 'ing' | 'millennium' | 'pekao' | 'erste' | 'alior' | 'universal';
  displayName: string;
  /**
   * Input format the parser consumes. 'csv' parsers receive decoded CSV text;
   * 'pdf' parsers receive text extracted from a PDF statement. Defaults to 'csv'.
   */
  format?: 'csv' | 'pdf';
  detect(headers: string[], sampleRows: string[][]): boolean;
  parse(text: string, opts?: ParserOptions): ParserResult;
}
