import * as fs from 'fs';
import * as path from 'path';
import { PekaoParser } from './pekao.parser';

const FIXTURE = fs.readFileSync(path.join(__dirname, '__fixtures__/pekao.csv'), 'utf-8');

describe('PekaoParser', () => {
  const parser = new PekaoParser();

  it('detects Pekao by Data operacji + Data waluty combo', () => {
    expect(parser.detect(
      ['Data operacji', 'Data waluty', 'Opis', 'Nadawca/Odbiorca', 'Kwota', 'Waluta', 'Saldo'],
    )).toBe(true);
    expect(parser.detect(['#Data operacji', '#Kwota'])).toBe(false);
  });

  it('parses DD.MM.YYYY dates and signed amount', () => {
    const { rows } = parser.parse(FIXTURE);
    expect(rows).toHaveLength(2);
    expect(rows[0].date).toBe('2026-01-15');
    expect(rows[0].kind).toBe('income');
    expect(rows[0].amount).toBe(1500);
    expect(rows[1].kind).toBe('expense');
    expect(rows[1].suggestedCategoryName).toBe('Groceries');
  });
});
