import * as fs from 'fs';
import * as path from 'path';
import { AliorParser } from './alior.parser';

const FIXTURE = fs.readFileSync(path.join(__dirname, '__fixtures__/alior.txt'), 'utf-8');

describe('AliorParser', () => {
  const parser = new AliorParser();

  it('id, displayName, pdf format', () => {
    expect(parser.id).toBe('alior');
    expect(parser.displayName).toBe('Alior Bank');
    expect(parser.format).toBe('pdf');
  });

  it('detects Alior from extracted statement text', () => {
    expect(parser.detect(['Alior Bank SA, ul. Chmielna 69'], [])).toBe(true);
    expect(parser.detect(['Erste Bank Polska S.A.'], [])).toBe(false);
  });

  it('parses all 7 transactions (date/date/amount triples)', () => {
    const { rows } = parser.parse(FIXTURE);
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.date.startsWith('2026-04'))).toBe(true);
  });

  it('classifies signed KWOTA: positive = income, negative = expense', () => {
    const { rows } = parser.parse(FIXTURE);
    expect(rows.filter((r) => r.kind === 'income')).toHaveLength(1);
    expect(rows.filter((r) => r.kind === 'expense')).toHaveLength(6);

    const incoming = rows.find((r) => r.kind === 'income');
    expect(incoming?.amount).toBe(100);
    expect(incoming?.date).toBe('2026-04-17');
    expect(incoming?.description).toContain('PRZELEW KRAJOWY');
  });

  it('uses the operation (second) date and absolute amount', () => {
    const { rows } = parser.parse(FIXTURE);
    const parking = rows.find((r) => r.description.includes('ZAKUP BILETU PARKINGOWEGO'));
    expect(parking?.kind).toBe('expense');
    expect(parking?.amount).toBe(2.67);
    expect(parking?.date).toBe('2026-04-24');

    const vinted = rows.find((r) => r.amount === 6.2);
    expect(vinted?.kind).toBe('expense');
    expect(vinted?.date).toBe('2026-04-22'); // operation date, not booking date
  });

  it('enriches the description with the merchant from the next line', () => {
    const { rows } = parser.parse(FIXTURE);
    const vinted = rows.find((r) => r.amount === 6.2);
    expect(vinted?.description).toContain('Vinted');
  });
});
