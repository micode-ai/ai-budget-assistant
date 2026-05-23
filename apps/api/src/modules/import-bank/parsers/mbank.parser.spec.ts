import * as fs from 'fs';
import * as path from 'path';
import { MBankParser } from './mbank.parser';

const FIXTURE = fs.readFileSync(path.join(__dirname, '__fixtures__/mbank.csv'), 'utf-8');

describe('MBankParser', () => {
  const parser = new MBankParser();

  it('id and displayName', () => {
    expect(parser.id).toBe('mbank');
    expect(parser.displayName).toBe('mBank');
  });

  it('detects mBank by column prefix #', () => {
    expect(parser.detect(['#Data operacji', '#Kwota', '#Opis operacji'])).toBe(true);
    expect(parser.detect(['Data', 'Amount'])).toBe(false);
  });

  it('parses rows into normalized ImportRow shape', () => {
    const { rows, detectedHeaders } = parser.parse(FIXTURE);
    expect(detectedHeaders).toContain('#Data operacji');
    expect(rows).toHaveLength(4);
    const income = rows.find((r) => r.amount === 1500);
    expect(income?.kind).toBe('income');
    expect(income?.date).toBe('2026-01-15');
    expect(income?.currencyCode).toBe('PLN');
    const expense = rows.find((r) => r.amount === 87.45);
    expect(expense?.kind).toBe('expense');
    expect(expense?.suggestedCategoryName).toBe('Groceries');
  });
});
