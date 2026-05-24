import { PARSERS, getParserById, detectParser, detectPdfParser } from './registry';

describe('parser registry', () => {
  it('has all parsers in detection order', () => {
    expect(PARSERS.map((p) => p.id)).toEqual([
      'mbank', 'pko', 'ing', 'millennium', 'pekao', 'erste', 'universal',
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
