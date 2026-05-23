import { parsePolishDate } from './polish-date';

describe('parsePolishDate', () => {
  it('parses YYYY-MM-DD', () => {
    expect(parsePolishDate('2026-01-15')).toBe('2026-01-15');
  });

  it('parses DD-MM-YYYY', () => {
    expect(parsePolishDate('15-01-2026')).toBe('2026-01-15');
  });

  it('parses DD.MM.YYYY', () => {
    expect(parsePolishDate('15.01.2026')).toBe('2026-01-15');
  });

  it('parses DD/MM/YYYY', () => {
    expect(parsePolishDate('15/01/2026')).toBe('2026-01-15');
  });

  it('honors explicit dateFormat override', () => {
    // Ambiguous 01-02-2026: MM-DD-YYYY would be Feb 1; DD-MM-YYYY is Jan 2
    expect(parsePolishDate('01-02-2026', 'DD-MM-YYYY')).toBe('2026-02-01');
  });

  it('returns empty string for unparseable input', () => {
    expect(parsePolishDate('not a date')).toBe('');
    expect(parsePolishDate('')).toBe('');
  });
});
