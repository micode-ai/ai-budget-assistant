import * as fs from 'fs';
import * as path from 'path';
import { ErsteParser } from './erste.parser';

const FIXTURE = fs.readFileSync(path.join(__dirname, '__fixtures__/erste.txt'), 'utf-8');

describe('ErsteParser', () => {
  const parser = new ErsteParser();

  it('id, displayName, pdf format', () => {
    expect(parser.id).toBe('erste');
    expect(parser.displayName).toBe('Erste Bank');
    expect(parser.format).toBe('pdf');
  });

  it('detects Erste from extracted statement text', () => {
    expect(parser.detect(['Erste Bank Polska S.A.'], [])).toBe(true);
    expect(parser.detect(['Wyciąg', 'opis wpływy wydatki saldo'], [])).toBe(true);
    expect(parser.detect(['#Data operacji', '#Kwota'], [])).toBe(false);
  });

  it('parses exactly the 15 transactions (skips opening/closing balance + page noise)', () => {
    const { rows } = parser.parse(FIXTURE);
    expect(rows).toHaveLength(15);
    // Never emits a balance row.
    expect(rows.some((r) => r.description.includes('Saldo'))).toBe(false);
  });

  it('uses the operation date and Polish amount columns', () => {
    const { rows } = parser.parse(FIXTURE);
    const first = rows[0];
    expect(first.date).toBe('2026-03-26'); // data operacji of the first tx
    expect(first.kind).toBe('expense');
    expect(first.amount).toBe(25);
  });

  it('classifies inflow (wpływy) as income, outflow (wydatki) as expense', () => {
    const { rows } = parser.parse(FIXTURE);
    const deposit = rows.find((r) => r.amount === 1200);
    expect(deposit?.kind).toBe('income');
    const zus = rows.find((r) => r.amount === 800);
    expect(zus?.kind).toBe('income');
    const expense = rows.find((r) => r.amount === 75.19);
    expect(expense?.kind).toBe('expense');
  });

  it('parses thousands-separated amounts', () => {
    const { rows } = parser.parse(FIXTURE);
    const big = rows.find((r) => r.amount === 1721.99);
    expect(big).toBeDefined();
    expect(big?.kind).toBe('expense');
  });

  it('extracts the card merchant and suggests a category', () => {
    const { rows } = parser.parse(FIXTURE);
    const zabka = rows.find((r) => r.description.includes('ZABKA'));
    expect(zabka).toBeDefined();
    expect(zabka?.suggestedCategoryName).toBe('Groceries');
    const rossmann = rows.find((r) => r.description.includes('ROSSMANN'));
    expect(rossmann?.suggestedCategoryName).toBe('Health');
  });
});
