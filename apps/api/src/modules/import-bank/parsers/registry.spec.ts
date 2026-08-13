import { PARSERS, getParserById, detectParser, detectPdfParser } from './registry';
import * as fs from 'fs';
import * as path from 'path';
import { sniffDelimiter } from '../utils/delimiter';
import * as Papa from 'papaparse';

describe('parser registry', () => {
  it('has all parsers in detection order', () => {
    expect(PARSERS.map((p) => p.id)).toEqual([
      'mbank', 'pko', 'revolut', 'ing', 'millennium', 'pekao', 'erste', 'alior',
      'monefy', 'wallet', 'moneymanager', 'universal', 'ai',
    ]);
  });

  it('getParserById returns matching parser', () => {
    expect(getParserById('mbank')?.displayName).toBe('mBank');
    expect(getParserById('universal')?.id).toBe('universal');
    expect(getParserById('unknown' as any)).toBeUndefined();
  });

  it('detectParser returns the first bank parser whose detect() is true', () => {
    expect(detectParser(['#Data operacji', '#Kwota'])?.id).toBe('mbank');
    expect(detectParser(['Data operacji', 'Typ transakcji', 'Kwota', 'Waluta'])?.id).toBe('pko');
    expect(detectParser(['Random', 'Headers'])).toBeUndefined();
  });

  it('never auto-detects universal', () => {
    expect(detectParser(['anything'])?.id).not.toBe('universal');
  });

  it('CSV detection never returns the PDF-only Erste parser', () => {
    expect(detectParser(['Erste Bank Polska S.A.', 'Wyciąg'])?.id).not.toBe('erste');
  });

  it('detectPdfParser finds Erste from statement text lines', () => {
    expect(detectPdfParser(['Erste Bank Polska S.A.', 'Wyciąg'])?.id).toBe('erste');
    expect(detectPdfParser(['Some random pdf'])).toBeUndefined();
  });
});

describe('detectParser with sniffed delimiter', () => {
  const readFixture = (name: string) =>
    fs.readFileSync(path.join(__dirname, '__fixtures__', name), 'utf-8');

  const headersOf = (text: string) => {
    const delimiter = sniffDelimiter(text);
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true, delimiter, preview: 1 });
    return (parsed.data[0] ?? []).map((h) => String(h).trim());
  };

  it('now detects Revolut, which a hardcoded semicolon delimiter never could', () => {
    expect(detectParser(headersOf(readFixture('revolut.csv')), [])?.id).toBe('revolut');
  });

  it.each([
    ['mbank.csv', 'mbank'],
    ['pko.csv', 'pko'],
    ['ing.csv', 'ing'],
    ['millennium.csv', 'millennium'],
    ['pekao.csv', 'pekao'],
  ])('still detects %s', (fixture, expectedId) => {
    expect(detectParser(headersOf(readFixture(fixture)), [])?.id).toBe(expectedId);
  });
});

// ---------------------------------------------------------------------------
// Cross-detection — no parser may claim another's file
//
// Thirteen parsers now race on every upload and the first `detect()` to return
// true wins. A parser that grabs a foreign format does not fail loudly: it
// produces plausible-looking rows with the wrong columns read, which is far
// worse than not recognising the file at all — an unclaimed file falls through
// to AI inference and still imports correctly.
// ---------------------------------------------------------------------------

describe('cross-detection between every CSV fixture and every parser', () => {
  const CSV_FIXTURES: Array<{ file: string; expected: string }> = [
    { file: 'mbank.csv', expected: 'mbank' },
    { file: 'pko.csv', expected: 'pko' },
    { file: 'revolut.csv', expected: 'revolut' },
    { file: 'ing.csv', expected: 'ing' },
    { file: 'millennium.csv', expected: 'millennium' },
    { file: 'pekao.csv', expected: 'pekao' },
    { file: 'monefy.csv', expected: 'monefy' },
    { file: 'wallet.csv', expected: 'wallet' },
    { file: 'moneymanager.csv', expected: 'moneymanager' },
  ];

  function headersOf(file: string): string[] {
    const text = fs.readFileSync(path.join(__dirname, '__fixtures__', file), 'utf8');
    const delimiter = sniffDelimiter(text);
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true, delimiter, preview: 1 });
    return (parsed.data[0] ?? []).map((h) => String(h).trim());
  }

  function claimantsOf(file: string): string[] {
    const headers = headersOf(file);
    return PARSERS.filter(
      (p) => p.id !== 'universal' && p.id !== 'ai' && (p.format ?? 'csv') === 'csv' && p.detect(headers, []),
    ).map((p) => p.id);
  }

  it.each(CSV_FIXTURES)('$file resolves to $expected', ({ file, expected }) => {
    // First claimant wins — that is what detectParser() implements.
    expect(claimantsOf(file)[0]).toBe(expected);
  });

  it.each(CSV_FIXTURES)('no competitor-app parser claims $file unless it owns it', ({ file, expected }) => {
    const COMPETITOR_IDS = ['monefy', 'wallet', 'moneymanager'];
    const wrongfulClaims = claimantsOf(file).filter((id) => COMPETITOR_IDS.includes(id) && id !== expected);
    expect(wrongfulClaims).toEqual([]);
  });

  it('KNOWN PRE-EXISTING OVERLAP: the Pekao detector also matches a PKO export', () => {
    // Not introduced by the competitor parsers — recorded here because it is
    // real and load-bearing: PKO files parse correctly today only because
    // `pko` sits before `pekao` in PARSERS. Reordering that array, or adding a
    // parser between them, would silently route PKO statements to the wrong
    // parser. Pinned so the next person to touch the order finds out here
    // rather than from a user's mis-parsed statement.
    expect(claimantsOf('pko.csv')).toEqual(['pko', 'pekao']);
  });
});
