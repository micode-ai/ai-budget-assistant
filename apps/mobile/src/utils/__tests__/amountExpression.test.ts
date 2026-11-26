import { evaluateAmountExpression } from '@budget/shared-utils';
import { parseAmountExpression, isAmountExpressionInvalid } from '../amount';

const val = (s: string) => {
  const r = evaluateAmountExpression(s);
  return r.ok ? r.value : r.reason;
};

describe('evaluateAmountExpression', () => {
  it('evaluates precedence and decimals', () => {
    expect(val('12.50+3.20*2')).toBe(18.9);
    expect(val('(1+2)*3')).toBe(9);
    expect(val('10/4')).toBe(2.5);
  });
  it('accepts comma decimals and unary minus', () => {
    expect(val('12,5+0,5')).toBe(13);
    expect(val('-5+10')).toBe(5);
  });
  it('rounds to minor units', () => {
    expect(val('10/3')).toBe(3.33);
  });
  it('flags plain numbers as non-expressions', () => {
    expect(evaluateAmountExpression('12,5')).toEqual({ ok: true, value: 12.5, isExpression: false });
  });
  it('rejects anything else', () => {
    expect(val('')).toBe('empty');
    expect(val('2+')).toBe('invalid');
    expect(val('(1+2')).toBe('invalid');
    expect(val('1..2')).toBe('invalid');
    expect(val('alert(1)')).toBe('invalid');
    expect(val('2**3')).toBe('invalid');
    expect(val('5/0')).toBe('divide_by_zero');
  });
});

describe('mobile helpers', () => {
  it('parseAmountExpression', () => {
    expect(parseAmountExpression('2*3')).toBe(6);
    expect(parseAmountExpression('x')).toBeNaN();
  });
  it('isAmountExpressionInvalid ignores empty text', () => {
    expect(isAmountExpressionInvalid('')).toBe(false);
    expect(isAmountExpressionInvalid('2+')).toBe(true);
    expect(isAmountExpressionInvalid('2+2')).toBe(false);
  });
});
