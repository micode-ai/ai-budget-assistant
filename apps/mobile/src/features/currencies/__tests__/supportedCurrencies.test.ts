import { SUPPORTED_CURRENCIES, CurrencySchema, formatCurrency, getCurrencySymbol } from '@budget/shared-utils';
import { SUPPORTED_CURRENCIES as PARSER_CURRENCIES } from '../../../services/notificationParser/generic';

const NEW_CODES = ['CZK', 'SEK', 'NOK', 'DKK', 'HUF', 'RON', 'CHF'];

describe('supported currencies (ABA-721)', () => {
  const codes = SUPPORTED_CURRENCIES.map((c) => c.code);

  it('includes the seven added currencies', () => {
    for (const c of NEW_CODES) expect(codes).toContain(c);
  });

  it('keeps validation, parser and constants on one list', () => {
    expect([...CurrencySchema.options].sort()).toEqual([...codes].sort());
    expect([...PARSER_CURRENCIES].sort()).toEqual([...codes].sort());
  });

  it('has a symbol and a real formatter for every code', () => {
    for (const { code, symbol } of SUPPORTED_CURRENCIES) {
      expect(getCurrencySymbol(code)).toBe(symbol);
      const out = formatCurrency(1234.5, code);
      expect(out).toContain(symbol);
      expect(out).toMatch(/1[\s  .,']?234[.,]50/);
    }
  });
});

describe('BRL', () => {
  it('is supported end to end', () => {
    expect(() => CurrencySchema.parse('BRL')).not.toThrow();
    expect(SUPPORTED_CURRENCIES).toContainEqual({ code: 'BRL', name: 'Brazilian Real', symbol: 'R$' });
  });

  it('formats with the symbol before the pt-BR number', () => {
    // Same 'before' convention as USD/GBP/CHF: symbol glued to a pt-BR formatted number.
    const number = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(1234.5);
    expect(number).toBe('1.234,50');
    expect(formatCurrency(1234.5, 'BRL')).toBe('R$1.234,50');
  });
});
