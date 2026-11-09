import { groupExpensesByMember, memberCategoryBreakdown } from '../memberGrouping';

const id = (a: number) => a;

describe('groupExpensesByMember', () => {
  it('sums per creator, sorted desc, keeps the name', () => {
    const r = groupExpensesByMember(
      [
        { userId: 'a', createdByUserName: 'Anna', amount: 10, currencyCode: 'USD' },
        { userId: 'b', createdByUserName: 'Bob', amount: 50, currencyCode: 'USD' },
        { userId: 'a', createdByUserName: null, amount: 15, currencyCode: 'USD' },
      ],
      id,
    );
    expect(r).toEqual([
      { userId: 'b', name: 'Bob', amount: 50 },
      { userId: 'a', name: 'Anna', amount: 25 },
    ]);
  });

  it('converts currency and groups rows without a creator under null', () => {
    const r = groupExpensesByMember([{ amount: 10, currencyCode: 'EUR' }], (a) => a * 2);
    expect(r).toEqual([{ userId: null, name: null, amount: 20 }]);
  });
});

describe('memberCategoryBreakdown', () => {
  it('counts only that member', () => {
    const m = memberCategoryBreakdown(
      [
        { userId: 'a', amount: 10, currencyCode: 'USD', categoryId: 'food' },
        { userId: 'b', amount: 99, currencyCode: 'USD', categoryId: 'food' },
      ],
      'a',
      id,
    );
    expect(m.get('food')).toBe(10);
    expect(m.size).toBe(1);
  });
});
