import type { BankParser } from './parser.interface';
import { MBankParser } from './mbank.parser';
import { PkoParser } from './pko.parser';
import { IngParser } from './ing.parser';
import { MillenniumParser } from './millennium.parser';
import { PekaoParser } from './pekao.parser';
import { UniversalParser } from './universal.parser';

export const PARSERS: BankParser[] = [
  new MBankParser(),
  new PkoParser(),
  new IngParser(),
  new MillenniumParser(),
  new PekaoParser(),
  new UniversalParser(),
];

export function getParserById(id: BankParser['id']): BankParser | undefined {
  return PARSERS.find((p) => p.id === id);
}

export function detectParser(headers: string[], sampleRows: string[][] = []): BankParser | undefined {
  return PARSERS.find((p) => p.id !== 'universal' && p.detect(headers, sampleRows));
}
