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

  it('detects PKO from comma-delimited header (mushed or split cells)', () => {
    // The service extracts headers with a ';' delimiter, so for a comma file it
    // hands detect() one mushed cell — detection must work either way.
    const mushed = ['"Data operacji","Data waluty","Typ transakcji","Kwota","Waluta"'];
    expect(parser.detect(mushed, [])).toBe(true);
    const split = ['Data operacji', 'Typ transakcji', 'Kwota', 'Waluta'];
    expect(parser.detect(split, [])).toBe(true);
    expect(parser.detect(['#Data operacji', '#Kwota'], [])).toBe(false);
  });

  it('parses comma-delimited rows with a single signed Kwota column', () => {
    const { rows } = parser.parse(FIXTURE);
    expect(rows).toHaveLength(5);

    const eleclerc = rows.find((r) => r.description === 'eLeclerc 01');
    expect(eleclerc).toBeDefined();
    expect(eleclerc?.kind).toBe('expense');
    expect(eleclerc?.amount).toBe(64.1);
    expect(eleclerc?.date).toBe('2026-05-22');
    expect(eleclerc?.currencyCode).toBe('PLN');
  });

  it('extracts the card merchant and suggests a category', () => {
    const { rows } = parser.parse(FIXTURE);
    const zabka = rows.find((r) => r.description.includes('ZABKA'));
    expect(zabka).toBeDefined();
    expect(zabka?.kind).toBe('expense');
    expect(zabka?.amount).toBe(28.2);
    expect(zabka?.suggestedCategoryName).toBe('Groceries');
  });

  it('extracts merchant from Adres even without Miasto (web payment)', () => {
    const { rows } = parser.parse(FIXTURE);
    const orange = rows.find((r) => r.description === 'doladowania.orange.pl');
    expect(orange).toBeDefined();
    expect(orange?.kind).toBe('expense');
  });

  it('classifies a positive Kwota as income and names the sender', () => {
    const { rows } = parser.parse(FIXTURE);
    const income = rows.find((r) => r.kind === 'income');
    expect(income).toBeDefined();
    expect(income?.amount).toBe(6600);
    expect(income?.description).toContain('PRACODAWCA');
  });

  it('names the recipient on an outgoing transfer', () => {
    const { rows } = parser.parse(FIXTURE);
    const transfer = rows.find((r) => r.description === 'FIRMA TESTOWA');
    expect(transfer).toBeDefined();
    expect(transfer?.kind).toBe('expense');
    expect(transfer?.amount).toBe(10000);
  });
});
