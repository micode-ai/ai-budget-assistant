import { readFileSync } from 'fs';
import { join } from 'path';
import { MoneyManagerParser } from './moneymanager.parser';

const fixture = readFileSync(join(__dirname, '__fixtures__', 'moneymanager.csv'), 'utf8');
// Trimmed per cell: on a CRLF checkout the raw split leaves a \r on the last
// header, and the parser trims — so an untrimmed expectation fails on Windows
// while passing on a CI runner that checks out LF.
const headers = fixture.split('\n')[0].split(',').map((h) => h.trim());

describe('MoneyManagerParser', () => {
  const parser = new MoneyManagerParser();

  describe('detect', () => {
    it('recognises the export by its Income/Expense + Subcategory pair', () => {
      expect(parser.detect(headers, [])).toBe(true);
    });

    it('does not claim an export that merely has date/category/amount', () => {
      expect(parser.detect(['date', 'account', 'category', 'amount', 'currency', 'description'], [])).toBe(false);
    });

    it('does not claim a Wallet export', () => {
      expect(parser.detect(['account', 'category', 'refAmount', 'type', 'transfer', 'note'], [])).toBe(false);
    });
  });

  describe('parse', () => {
    it('reads the Income/Expense column rather than the sign', () => {
      // This export writes every amount unsigned, so the sign carries no
      // information at all — reading it would book every income as spending.
      const { rows } = parser.parse(fixture);
      expect(rows.find((r) => r.description === 'Pensja luty')!.kind).toBe('income');
      expect(rows.find((r) => r.description === 'Biedronka')!.kind).toBe('expense');
    });

    it('skips transfers between the user own accounts', () => {
      const { rows } = parser.parse(fixture);
      expect(rows.find((r) => r.description === 'ATM')).toBeUndefined();
    });

    it('joins category and subcategory so the finer level is not lost', () => {
      const { rows } = parser.parse(fixture);
      expect(rows.find((r) => r.description === 'Biedronka')!.suggestedCategoryName).toBe('Food / Groceries');
    });

    it('uses the bare category when there is no subcategory', () => {
      const { rows } = parser.parse(fixture);
      expect(rows.find((r) => r.description === 'Pensja luty')!.suggestedCategoryName).toBe('Salary');
    });

    it('falls back to the description column when the note is empty', () => {
      const { rows } = parser.parse(fixture);
      expect(rows.find((r) => r.amount === 19.99)!.description).toBe('Spotify');
    });

    it('keeps the row currency', () => {
      const { rows } = parser.parse(fixture);
      expect(rows.find((r) => r.amount === 19.99)!.currencyCode).toBe('EUR');
    });

    it('reads a day-first slash date, the format this export uses outside ISO locales', () => {
      // Documented assumption, and the likeliest thing to need correcting
      // against a real export: a slash date is read day-first. Day 25 makes the
      // assertion prove the order rather than merely accept it.
      const slashFixture = [
        'Date,Account,Category,Subcategory,Note,Amount,Income/Expense,Description,Currency,Account Type',
        '25/02/2024,Cash,Food,,Biedronka,25.50,Expense,,PLN,Cash',
      ].join('\n');

      const { rows } = parser.parse(slashFixture);

      expect(rows[0].date).toBe('2024-02-25');
    });

    it('reports the detected headers', () => {
      const { detectedHeaders } = parser.parse(fixture);
      expect(detectedHeaders).toEqual(headers);
    });
  });
});
