import { UniversalParser } from './universal.parser';

describe('UniversalParser', () => {
  const parser = new UniversalParser();

  it('detect() always returns false (never auto-selected)', () => {
    expect(parser.detect(['anything', 'goes'], [])).toBe(false);
  });

  it('parses with single-amount-column mapping', () => {
    const text = 'Data;Kwota;Opis\n15.01.2026;1500,00;Wynagrodzenie\n16.01.2026;-87,45;Sklep';
    const { rows } = parser.parse(text, {
      columnMapping: { date: 'Data', amount: 'Kwota', description: 'Opis' },
      amountFormat: 'polish',
      dateFormat: 'DD.MM.YYYY',
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].kind).toBe('income');
    expect(rows[1].kind).toBe('expense');
  });

  it('parses with debit/credit pair mapping', () => {
    const text = 'Data;Obc;Uzn;Opis\n15.01.2026;;1500,00;Wpływ\n16.01.2026;87,45;;Wydatek';
    const { rows } = parser.parse(text, {
      columnMapping: { date: 'Data', amount: { debit: 'Obc', credit: 'Uzn' }, description: 'Opis' },
      dateFormat: 'DD.MM.YYYY',
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].kind).toBe('income');
    expect(rows[1].kind).toBe('expense');
    expect(rows[1].amount).toBe(87.45);
  });

  it('throws when columnMapping is missing', () => {
    expect(() => parser.parse('a;b\n1;2')).toThrow(/columnMapping/);
  });
});
