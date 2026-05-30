import type { BankParser } from './parser.interface';
import { MBankParser } from './mbank.parser';
import { PkoParser } from './pko.parser';
import { RevolutParser } from './revolut.parser';
import { IngParser } from './ing.parser';
import { MillenniumParser } from './millennium.parser';
import { PekaoParser } from './pekao.parser';
import { ErsteParser } from './erste.parser';
import { AliorParser } from './alior.parser';
import { UniversalParser } from './universal.parser';

export const PARSERS: BankParser[] = [
  new MBankParser(),
  new PkoParser(),
  new RevolutParser(),
  new IngParser(),
  new MillenniumParser(),
  new PekaoParser(),
  new ErsteParser(),
  new AliorParser(),
  new UniversalParser(),
];

const parserFormat = (p: BankParser): 'csv' | 'pdf' => p.format ?? 'csv';

export function getParserById(id: BankParser['id']): BankParser | undefined {
  return PARSERS.find((p) => p.id === id);
}

/** Auto-detect a CSV bank parser from extracted header cells. */
export function detectParser(headers: string[], sampleRows: string[][] = []): BankParser | undefined {
  return PARSERS.find(
    (p) => p.id !== 'universal' && parserFormat(p) === 'csv' && p.detect(headers, sampleRows),
  );
}

/** Auto-detect a PDF bank parser from extracted statement text lines. */
export function detectPdfParser(lines: string[]): BankParser | undefined {
  return PARSERS.find((p) => parserFormat(p) === 'pdf' && p.detect(lines, []));
}
