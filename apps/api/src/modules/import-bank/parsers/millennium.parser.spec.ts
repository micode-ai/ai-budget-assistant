import * as fs from 'fs';
import * as path from 'path';
import { MillenniumParser } from './millennium.parser';

const FIXTURE = fs.readFileSync(path.join(__dirname, '__fixtures__/millennium.csv'), 'utf-8');

describe('MillenniumParser', () => {
  const parser = new MillenniumParser();

  it('id and displayName', () => {
    expect(parser.id).toBe('millennium');
    expect(parser.displayName).toBe('Bank Millennium');
  });

  it('detects Millennium by Obciążenie + Uznanie (singular) headers', () => {
    expect(parser.detect(['Data transakcji', 'Opis', 'Obciążenie', 'Uznanie', 'Saldo', 'Waluta'])).toBe(true);
    expect(parser.detect(['Data', 'Obciążenia', 'Uznania'])).toBe(false);
  });

  it('parses DD-MM-YYYY dates and ignores dash markers', () => {
    const { rows } = parser.parse(FIXTURE);
    expect(rows).toHaveLength(2);
    expect(rows[0].date).toBe('2026-01-15');
    expect(rows[0].kind).toBe('income');
    expect(rows[0].amount).toBe(1500);
    expect(rows[1].kind).toBe('expense');
    expect(rows[1].amount).toBe(87.45);
    expect(rows[1].date).toBe('2026-01-16');
  });

  it('suggests category from merchant name', () => {
    const { rows } = parser.parse(FIXTURE);
    const biedronka = rows.find((r) => r.amount === 87.45);
    expect(biedronka?.suggestedCategoryName).toBe('Groceries');
  });
});
