import { parseAmount } from './parse-amount';

describe('parseAmount BRL', () => {
  it('reads "25 BRL" as BRL', () => {
    expect(parseAmount('25 BRL lunch')).toEqual({ amount: 25, currencyCode: 'BRL', description: 'lunch' });
  });

  it('reads the R$ prefix as BRL, not USD', () => {
    expect(parseAmount('R$ 25,90 padaria')).toEqual({ amount: 25.9, currencyCode: 'BRL', description: 'padaria' });
    expect(parseAmount('R$25')).toEqual({ amount: 25, currencyCode: 'BRL', description: undefined });
  });

  it('reads the R$ suffix and "reais" as BRL', () => {
    expect(parseAmount('25 R$ taxi')?.currencyCode).toBe('BRL');
    expect(parseAmount('25 reais taxi')?.currencyCode).toBe('BRL');
  });

  it('does not read the word "real" as BRL', () => {
    expect(parseAmount('50 real estate fee')?.currencyCode).toBeUndefined();
  });

  it('still reads a bare $ as USD', () => {
    expect(parseAmount('$25')?.currencyCode).toBe('USD');
  });
});
