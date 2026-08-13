import { readFileSync } from 'fs';
import { join } from 'path';
import { MonefyParser } from './monefy.parser';

const fixture = readFileSync(join(__dirname, '__fixtures__', 'monefy.csv'), 'utf8');
// Trimmed per cell: on a CRLF checkout the raw split leaves a \r on the last
// header, and the parser trims — so an untrimmed expectation fails on Windows
// while passing on a CI runner that checks out LF.
const headers = fixture.split('\n')[0].split(';').map((h) => h.trim());

describe('MonefyParser', () => {
  const parser = new MonefyParser();

  describe('detect', () => {
    it('recognises a Monefy export by its duplicated currency column', () => {
      expect(parser.detect(headers, [])).toBe(true);
    });

    it('does not claim a file that merely has date/category/amount columns', () => {
      // A single `currency` column is some other app's export — Monefy always
      // emits two (raw and converted). Detection must stay tight: a parser that
      // grabs a foreign format produces plausible-looking garbage, whereas an
      // unrecognised file falls through to AI inference and still imports.
      expect(parser.detect(['date', 'account', 'category', 'amount', 'currency', 'description'], [])).toBe(false);
    });

    it('does not claim a bank statement', () => {
      expect(parser.detect(['Started Date', 'Completed Date', 'Balance', 'Amount'], [])).toBe(false);
    });
  });

  describe('parse', () => {
    it('splits signed amounts into expense and income rows', () => {
      const { rows } = parser.parse(fixture);

      const expenses = rows.filter((r) => r.kind === 'expense');
      const incomes = rows.filter((r) => r.kind === 'income');
      expect(expenses).toHaveLength(4);
      expect(incomes).toHaveLength(1);
      expect(incomes[0].amount).toBe(5000);
    });

    it('always reports a positive amount, with the sign carried by kind', () => {
      const { rows } = parser.parse(fixture);
      expect(rows.every((r) => r.amount > 0)).toBe(true);
      expect(rows.find((r) => r.description === 'Biedronka')!.amount).toBe(25.5);
    });

    it('carries the exporting app own category through instead of guessing from the merchant', () => {
      // The whole point of a dedicated parser over AI inference: the user's own
      // taxonomy travels with their history.
      const { rows } = parser.parse(fixture);
      expect(rows.find((r) => r.description === 'Biedronka')!.suggestedCategoryName).toBe('Jedzenie');
      expect(rows.find((r) => r.amount === 5000)!.suggestedCategoryName).toBe('Wynagrodzenie');
    });

    it('leaves the category unset when the export has none for that row', () => {
      const { rows } = parser.parse(fixture);
      expect(rows.find((r) => r.description === 'Kiosk')!.suggestedCategoryName).toBeUndefined();
    });

    it('reads day-first dates into ISO', () => {
      const { rows } = parser.parse(fixture);
      expect(rows[0].date).toBe('2024-02-01');
    });

    it('reads comma decimals', () => {
      const { rows } = parser.parse(fixture);
      expect(rows.find((r) => r.description === 'Bilet tramwajowy')!.amount).toBe(4.6);
    });

    it('falls back to the category as the description when the export has no note', () => {
      const { rows } = parser.parse(fixture);
      const row = rows.find((r) => r.amount === 89.99)!;
      expect(row.description).toBe('Rozrywka');
    });

    it('parses a comma-delimited export with dot decimals', () => {
      // A locale that separates cells with commas writes decimals with dots —
      // the two always travel together, so this is a distinct real-world shape
      // rather than the semicolon fixture with its separators swapped.
      const commaFixture = [
        'date,account,category,amount,currency,converted amount,currency,description',
        '01/02/2024,Cash,Food,-25.50,EUR,-25.50,EUR,Lidl',
        '02/02/2024,Bank,Salary,5000.00,EUR,5000.00,EUR,February salary',
      ].join('\n');

      const { rows } = parser.parse(commaFixture);

      expect(rows).toHaveLength(2);
      expect(rows[0].date).toBe('2024-02-01');
      expect(rows[0].amount).toBe(25.5);
      expect(rows[0].currencyCode).toBe('EUR');
      expect(rows[0].suggestedCategoryName).toBe('Food');
    });

    it('reports the detected headers', () => {
      const { detectedHeaders } = parser.parse(fixture);
      expect(detectedHeaders).toEqual(headers);
    });
  });
});
