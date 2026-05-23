import { parsePolishAmount } from './polish-amount';

describe('parsePolishAmount', () => {
  it('parses signed Polish amount with currency suffix', () => {
    expect(parsePolishAmount('1 500,00 PLN')).toBe(1500);
    expect(parsePolishAmount('-50,99 PLN')).toBe(-50.99);
  });

  it('parses unsigned bare amounts', () => {
    expect(parsePolishAmount('1500,00')).toBe(1500);
    expect(parsePolishAmount('0,01')).toBe(0.01);
  });

  it('parses standard-format amounts (period decimal)', () => {
    expect(parsePolishAmount('1500.00')).toBe(1500);
    expect(parsePolishAmount('1,234.56')).toBe(1234.56);
  });

  it('handles thousand separator with NBSP', () => {
    expect(parsePolishAmount('1 500,00')).toBe(1500);
  });

  it('returns NaN for empty / dash markers', () => {
    expect(parsePolishAmount('')).toBeNaN();
    expect(parsePolishAmount('-')).toBeNaN();
  });

  it('parses with explicit format hint "standard"', () => {
    expect(parsePolishAmount('1,234.56', 'standard')).toBe(1234.56);
  });
});
