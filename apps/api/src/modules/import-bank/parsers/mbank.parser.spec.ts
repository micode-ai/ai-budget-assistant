import * as fs from 'fs';
import * as path from 'path';
import { MBankParser } from './mbank.parser';

const FIXTURE = fs.readFileSync(path.join(__dirname, '__fixtures__/mbank.csv'), 'utf-8');
const REAL_FIXTURE = fs.readFileSync(path.join(__dirname, '__fixtures__/mbank-real.csv'), 'utf-8');

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

  // Real-world mBank export: multi-line metadata preamble before the
  // transaction header row, no per-row currency suffix, no balance column,
  // a summary block, and a legal trailer line. See ABA-126 bug report.
  describe('real mBank export format', () => {
    it('detects mBank from the preamble signature', () => {
      const firstLineCells = REAL_FIXTURE.split(/\r?\n/)[0].split(';');
      expect(parser.detect(firstLineCells, [])).toBe(true);
    });

    it('skips the preamble + trailer and parses only the transaction rows', () => {
      const { rows } = parser.parse(REAL_FIXTURE);
      expect(rows).toHaveLength(2);

      const zabka = rows.find((r) => r.description.includes('ZABKA'));
      expect(zabka).toBeDefined();
      expect(zabka?.kind).toBe('expense');
      expect(zabka?.amount).toBe(56.74);
      expect(zabka?.date).toBe('2026-01-11');
      expect(zabka?.currencyCode).toBe('PLN');
      expect(zabka?.suggestedCategoryName).toBe('Groceries');

      const odsetki = rows.find((r) => r.description === 'ODSETKI');
      expect(odsetki).toBeDefined();
      expect(odsetki?.kind).toBe('expense');
      expect(odsetki?.amount).toBe(52.8);
      expect(odsetki?.date).toBe('2026-01-12');
    });

    it('does not emit rows for summary or legal-trailer lines', () => {
      const { rows } = parser.parse(REAL_FIXTURE);
      // Łącznie / Obciążenia / Uznania summary rows and the legal disclaimer
      // must never appear as transactions.
      expect(rows.every((r) => r.date.startsWith('2026-01'))).toBe(true);
      expect(rows.some((r) => r.description.includes('Niniejszy dokument'))).toBe(false);
      expect(rows.some((r) => r.description.includes('Łącznie'))).toBe(false);
    });
  });
});
