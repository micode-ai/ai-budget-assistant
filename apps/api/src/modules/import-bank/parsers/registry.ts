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
import { AiStatementParser } from './ai-statement.parser';
import { MonefyParser } from './monefy.parser';
import { WalletParser } from './wallet.parser';
import { MoneyManagerParser } from './moneymanager.parser';
import { SparkasseParser } from './sparkasse.parser';
import { VolksbankParser } from './volksbank.parser';
import { DkbParser } from './dkb.parser';
import { IngDeParser } from './ing-de.parser';
import { ComdirectParser } from './comdirect.parser';
import { CommerzbankParser } from './commerzbank.parser';
import { N26Parser } from './n26.parser';

export const PARSERS: BankParser[] = [
  new MBankParser(),
  new PkoParser(),
  new RevolutParser(),
  new IngParser(),
  new MillenniumParser(),
  new PekaoParser(),
  new ErsteParser(),
  new AliorParser(),
  // German banks (ABA-843). Their signatures are German column names no Polish
  // export carries, so their position relative to the Polish parsers does not
  // matter; they only have to stay ahead of UniversalParser.
  new SparkasseParser(),
  new VolksbankParser(),
  new DkbParser(),
  new IngDeParser(),
  new ComdirectParser(),
  new CommerzbankParser(),
  new N26Parser(),
  // Competitor app exports — tried before UniversalParser, which never
  // self-detects, so an unclaimed file still falls through to AI inference.
  new MonefyParser(),
  new WalletParser(),
  new MoneyManagerParser(),
  new UniversalParser(),
  new AiStatementParser(),
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
  return PARSERS.find(
    (p) => p.id !== 'ai' && parserFormat(p) === 'pdf' && p.detect(lines, []),
  );
}
