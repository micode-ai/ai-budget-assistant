import * as fs from 'fs';
import * as path from 'path';
import { PkoParser } from './pko.parser';

const FIXTURE = fs.readFileSync(path.join(__dirname, '__fixtures__/pko.csv'), 'utf-8');

describe('PkoParser', () => {
  const parser = new PkoParser();

  it('id and displayName', () => {
    expect(parser.id).toBe('pko');
    expect(parser.displayName).toBe('PKO BP');
  });

  it('detects PKO by Obciążenia + Uznania split-amount columns', () => {
    expect(parser.detect(['Data', 'Opis transakcji', 'Obciążenia', 'Uznania', 'Saldo po transakcji'])).toBe(true);
    expect(parser.detect(['#Data operacji', '#Kwota'])).toBe(false);
  });

  it('parses split debit/credit into signed amount', () => {
    const { rows, detectedHeaders } = parser.parse(FIXTURE);
    expect(detectedHeaders).toContain('Data');
    expect(rows).toHaveLength(3);

    const income = rows.find((r) => r.amount === 1500);
    expect(income?.kind).toBe('income');
    expect(income?.date).toBe('2026-01-15');
    expect(income?.currencyCode).toBe('PLN');

    const biedronka = rows.find((r) => r.amount === 87.45);
    expect(biedronka?.kind).toBe('expense');
    expect(biedronka?.suggestedCategoryName).toBe('Groceries');

    const czynsz = rows.find((r) => r.amount === 1200);
    expect(czynsz?.kind).toBe('expense');
    expect(czynsz?.description).toBe('Czynsz mieszkanie');
  });
});
