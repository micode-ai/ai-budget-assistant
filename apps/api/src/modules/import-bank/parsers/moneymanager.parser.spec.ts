import { readFileSync } from 'fs';
import { join } from 'path';
import { MoneyManagerParser, resolveDateOrder } from './moneymanager.parser';

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

// The shape of a real export a user sent (ABA-581) — a different app that also
// ships as "Money Manager". Values here are made up; the shape is not: UTF-8
// BOM, CRLF, a date with a time, a currency SYMBOL inside the amount, `Title`
// as the category and `Expenses` (plural) as the direction.
describe('MoneyManagerParser — simple export (ID,Date,Type,Title,Amount,Note)', () => {
  const parser = new MoneyManagerParser();
  const simple = readFileSync(join(__dirname, '__fixtures__', 'moneymanager-simple.csv'), 'utf8');
  const simpleHeaders = ['ID', 'Date', 'Type', 'Title', 'Amount', 'Note'];

  it('detects the header even with a BOM glued to the first name', () => {
    expect(parser.detect([String.fromCharCode(0xfeff) + 'ID', 'Date', 'Type', 'Title', 'Amount', 'Note'], [])).toBe(true);
    expect(parser.detect(simpleHeaders, [])).toBe(true);
  });

  it('does not claim a file that merely shares some of those names', () => {
    expect(parser.detect(['ID', 'Date', 'Type', 'Amount'], [])).toBe(false);
    expect(parser.detect([...simpleHeaders, 'Balance'], [])).toBe(false);
  });

  it('reads every row, with direction from Type and the category from Title', () => {
    const { rows } = parser.parse(simple);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ kind: 'income', amount: 1500, suggestedCategoryName: 'Salary' });
    expect(rows[1]).toMatchObject({ kind: 'expense', amount: 60.5, suggestedCategoryName: 'Groceries' });
  });

  it('takes the currency from the symbol in the amount', () => {
    const { rows } = parser.parse(simple);
    expect(rows.every((r) => r.currencyCode === 'USD')).toBe(true);
    const zl = parser.parse('ID,Date,Type,Title,Amount,Note\n1,25/02/2024 - 10:00 AM,Expenses,Food,"12,50 zł",');
    expect(zl.rows[0]).toMatchObject({ amount: 12.5, currencyCode: 'PLN' });
  });

  it('drops the time from the date and reads it day-first', () => {
    const { rows } = parser.parse(simple);
    expect(rows.map((r) => r.date)).toEqual(['2024-02-03', '2024-02-25', '2024-02-26']);
  });

  it('uses the note as the description when there is one, else the category', () => {
    const { rows } = parser.parse(simple);
    expect(rows[1]).toMatchObject({ description: 'Biedronka', merchant: 'Biedronka' });
    expect(rows[2]).toMatchObject({ description: 'Transport', merchant: undefined });
  });

  it('falls back to the caller currency when the amount has no symbol', () => {
    const { rows } = parser.parse('ID,Date,Type,Title,Amount,Note\n1,25/02/2024,Expenses,Food,12,', {
      defaultCurrency: 'EUR',
    });
    expect(rows[0].currencyCode).toBe('EUR');
  });
});

describe('resolveDateOrder', () => {
  it('is day-first when a first field exceeds 12', () => {
    expect(resolveDateOrder(['03/02/2024', '25/02/2024'])).toBe('dmy');
  });

  it('is month-first when a second field exceeds 12', () => {
    expect(resolveDateOrder(['02/03/2024', '02/25/2024'])).toBe('mdy');
  });

  it('defaults to day-first when every date is ambiguous', () => {
    expect(resolveDateOrder(['03/02/2024', '2024-02-01'])).toBe('dmy');
  });

  it('reads a whole month-first file consistently, and never emits month 13+', () => {
    const parser = new MoneyManagerParser();
    const text = [
      'Date,Account,Category,Subcategory,Note,Amount,Income/Expense,Description,Currency,Account Type',
      '02/03/2024,Cash,Food,,A,1,Expense,,PLN,Cash',
      '02/25/2024,Cash,Food,,B,2,Expense,,PLN,Cash',
    ].join('\n');
    expect(parser.parse(text).rows.map((r) => r.date)).toEqual(['2024-02-03', '2024-02-25']);
  });
});
