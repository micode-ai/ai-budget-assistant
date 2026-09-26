import { isCategorizableIncome } from '../categorizableIncome';

const base = { id: 'inc-1', categoryId: undefined, isDebt: false, isDebtRepayment: false } as any;

describe('isCategorizableIncome', () => {
  it('counts an ordinary uncategorized income', () => {
    expect(isCategorizableIncome(base)).toBe(true);
  });

  it('skips a categorized income, a debt and a debt repayment', () => {
    expect(isCategorizableIncome({ ...base, categoryId: 'c1' })).toBe(false);
    expect(isCategorizableIncome({ ...base, isDebt: true })).toBe(false);
    expect(isCategorizableIncome({ ...base, isDebtRepayment: true })).toBe(false);
  });

  it('skips a transfer counted as income, whichever id carries the pattern', () => {
    expect(isCategorizableIncome({ ...base, id: 'transfer-income-abc' })).toBe(false);
    expect(isCategorizableIncome({ ...base, clientId: 'transfer-income-abc' })).toBe(false);
    expect(isCategorizableIncome({ ...base, localId: 'transfer-income-abc' })).toBe(false);
  });
});
