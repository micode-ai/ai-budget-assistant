import { PARSERS, getParserById, detectParser, detectPdfParser } from './registry';
import * as fs from 'fs';
import * as path from 'path';
import { sniffDelimiter } from '../utils/delimiter';
import * as Papa from 'papaparse';

describe('parser registry', () => {
  it('has all parsers in detection order', () => {
    expect(PARSERS.map((p) => p.id)).toEqual([
      'mbank', 'pko', 'revolut', 'ing', 'millennium', 'pekao', 'erste', 'alior', 'universal', 'ai',
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
