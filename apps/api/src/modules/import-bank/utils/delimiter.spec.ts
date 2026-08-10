import { sniffDelimiter } from './delimiter';

describe('sniffDelimiter', () => {
  it('detects semicolon', () => {
    expect(sniffDelimiter('#Data operacji;#Kwota;#Opis\n2026-01-01;-12,00;Sklep')).toBe(';');
  });

  it('detects comma', () => {
    expect(
      sniffDelimiter('Type,Product,Started Date,Amount\nCARD_PAYMENT,Current,2026-01-15,-50.00'),
    ).toBe(',');
  });

  it('detects tab', () => {
    expect(sniffDelimiter('Date\tAmount\tDescription\n2026-01-01\t-12.00\tShop')).toBe('\t');
  });

  it('prefers the delimiter that yields a consistent column count', () => {
    // Commas appear inside quoted description cells; semicolon is the real delimiter.
    const text = 'Data;Kwota;Opis\n2026-01-01;-12,00;"Sklep, Warszawa"\n2026-01-02;-8,00;"Kawa, duza"';
    expect(sniffDelimiter(text)).toBe(';');
  });

  it('falls back to semicolon on a single-column file', () => {
    expect(sniffDelimiter('OnlyOneColumn\nvalue')).toBe(';');
  });

  it('falls back to semicolon on empty input', () => {
    expect(sniffDelimiter('')).toBe(';');
  });
});
