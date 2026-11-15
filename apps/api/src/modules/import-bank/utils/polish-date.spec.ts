import { inferSlashDateOrder, parsePolishDate } from './polish-date';

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

  // Sentry 2026-11-15: a US-locale Monefy export ("01/13/2019") was read day-first into
  // "2019-13-01", which `new Date()` turns into Invalid Date and Prisma rejects, failing the
  // whole import preview. An impossible date must never leave the parser.
  it('rejects a calendar date that does not exist instead of emitting it', () => {
    expect(parsePolishDate('01/13/2019')).toBe('');
    expect(parsePolishDate('31.02.2024')).toBe('');
    expect(parsePolishDate('2024-13-01')).toBe('');
    expect(parsePolishDate('2024-02-30', 'YYYY-MM-DD')).toBe('');
    expect(parsePolishDate('29.02.2024')).toBe('2024-02-29');
  });

  it('parses an explicit MM/DD/YYYY', () => {
    expect(parsePolishDate('01/13/2019', 'MM/DD/YYYY')).toBe('2019-01-13');
    expect(parsePolishDate('1/3/2019', 'MM/DD/YYYY')).toBe('2019-01-03');
    expect(parsePolishDate('13/01/2019', 'MM/DD/YYYY')).toBe('');
  });
});

describe('inferSlashDateOrder', () => {
  it('is month-first when a second component exceeds 12 and no first one does', () => {
    expect(inferSlashDateOrder(['01/03/2019', '01/13/2019'])).toBe('MM/DD/YYYY');
  });

  it('stays day-first when a first component exceeds 12', () => {
    expect(inferSlashDateOrder(['13/01/2019', '01/03/2019'])).toBe('auto');
  });

  it('stays day-first when the file is ambiguous throughout or has ISO dates', () => {
    expect(inferSlashDateOrder(['01/02/2019', '03/04/2019'])).toBe('auto');
    expect(inferSlashDateOrder(['2019-01-13', ''])).toBe('auto');
  });
});
