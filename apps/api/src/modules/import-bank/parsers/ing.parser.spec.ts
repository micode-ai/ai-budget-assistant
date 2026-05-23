import * as fs from 'fs';
import * as path from 'path';
import { IngParser } from './ing.parser';

const FIXTURE = fs.readFileSync(path.join(__dirname, '__fixtures__/ing.csv'), 'utf-8');

describe('IngParser', () => {
  const parser = new IngParser();

  it('id and displayName', () => {
    expect(parser.id).toBe('ing');
    expect(parser.displayName).toBe('ING Bank Śląski');
  });

  it('detects ING by Dane kontrahenta + Kwota transakcji', () => {
    expect(
      parser.detect([
        'Data transakcji',
        'Dane kontrahenta',
        'Tytuł',
        'Kwota transakcji (waluta rachunku)',
        'Waluta',
      ]),
    ).toBe(true);
    expect(parser.detect(['Data', 'Obciążenia', 'Uznania'])).toBe(false);
  });

  it('parses signed amount and currency column', () => {
    const { rows } = parser.parse(FIXTURE);
    expect(rows).toHaveLength(2);

    const income = rows[0];
    expect(income.kind).toBe('income');
    expect(income.amount).toBe(1500);
    expect(income.date).toBe('2026-01-15');
    expect(income.currencyCode).toBe('PLN');
    expect(income.merchant).toBe('Jan Kowalski');
    expect(income.description).toBe('Wynagrodzenie');

    const expense = rows[1];
    expect(expense.kind).toBe('expense');
    expect(expense.amount).toBe(87.45);
    expect(expense.date).toBe('2026-01-16');
    expect(expense.currencyCode).toBe('PLN');
    expect(expense.merchant).toBe('BIEDRONKA 5234');
    expect(expense.suggestedCategoryName).toBe('Groceries');
  });
});
