import {
  buildShareInputs,
  equalShare,
  initialSplitDraft,
  parseAmount,
  splitRemainder,
  validateExpenseForm,
  validateGroupSplit,
  type SplitDraft,
} from '../groupSplit';

const draft = (over: Partial<SplitDraft>): SplitDraft => ({
  splitType: 'equal',
  selectedIds: ['a', 'b'],
  values: {},
  ...over,
});

describe('parseAmount', () => {
  it('accepts a comma decimal and rejects garbage as 0', () => {
    expect(parseAmount('12,50')).toBe(12.5);
    expect(parseAmount(' 7.25 ')).toBe(7.25);
    expect(parseAmount('abc')).toBe(0);
    expect(parseAmount('')).toBe(0);
  });
});

describe('validateGroupSplit', () => {
  it('needs at least one member', () => {
    expect(validateGroupSplit(draft({ selectedIds: [] }), 10)).toBe('noMembers');
  });

  it('equal is always valid with members', () => {
    expect(validateGroupSplit(draft({}), 10)).toBeNull();
  });

  it('exact must add up to the amount within a cent', () => {
    const d = (a: string, b: string) => draft({ splitType: 'exact', values: { a, b } });
    expect(validateGroupSplit(d('6', '4'), 10)).toBeNull();
    expect(validateGroupSplit(d('6', '3.99'), 10)).toBeNull();
    expect(validateGroupSplit(d('6', '3'), 10)).toBe('exactSum');
  });

  it('percentage must add up to 100', () => {
    const d = (a: string, b: string) => draft({ splitType: 'percentage', values: { a, b } });
    expect(validateGroupSplit(d('60', '40'), 10)).toBeNull();
    expect(validateGroupSplit(d('60', '30'), 10)).toBe('percentSum');
  });

  it('shares need a positive number for each member', () => {
    const d = (a: string, b: string) => draft({ splitType: 'shares', values: { a, b } });
    expect(validateGroupSplit(d('1', '2'), 10)).toBeNull();
    expect(validateGroupSplit(d('1', '0'), 10)).toBe('valueMissing');
    expect(validateGroupSplit(d('1', ''), 10)).toBe('valueMissing');
  });
});

describe('splitRemainder', () => {
  it('reports the currency left for exact and the percent left for percentage', () => {
    expect(splitRemainder(draft({ splitType: 'exact', values: { a: '3', b: '2.5' } }), 10)).toBe(4.5);
    expect(splitRemainder(draft({ splitType: 'percentage', values: { a: '30' } }), 10)).toBe(70);
    expect(splitRemainder(draft({ splitType: 'equal' }), 10)).toBe(0);
  });
});

describe('buildShareInputs', () => {
  it('omits values for an equal split and sends numbers otherwise', () => {
    expect(buildShareInputs(draft({}))).toEqual([{ memberId: 'a' }, { memberId: 'b' }]);
    expect(buildShareInputs(draft({ splitType: 'exact', values: { a: '6,5', b: '3.5' } }))).toEqual([
      { memberId: 'a', value: 6.5 },
      { memberId: 'b', value: 3.5 },
    ]);
  });
});

describe('equalShare', () => {
  it('rounds to cents and guards zero members', () => {
    expect(equalShare(10, 3)).toBe(3.33);
    expect(equalShare(10, 0)).toBe(0);
  });
});

describe('validateExpenseForm', () => {
  const base = { description: 'Pizza', amount: 30, paidByMemberId: 'a', draft: draft({}) };

  it('accepts a complete form', () => {
    expect(validateExpenseForm(base)).toEqual({ ok: true, issue: null });
  });

  it('names the first thing missing', () => {
    expect(validateExpenseForm({ ...base, description: '  ' }).issue).toBe('description');
    expect(validateExpenseForm({ ...base, amount: 0 }).issue).toBe('amount');
    expect(validateExpenseForm({ ...base, amount: 2_000_000 }).issue).toBe('amount');
    expect(validateExpenseForm({ ...base, paidByMemberId: null }).issue).toBe('payer');
    expect(
      validateExpenseForm({ ...base, draft: draft({ splitType: 'exact', values: { a: '1', b: '1' } }) }).issue,
    ).toBe('exactSum');
  });
});

describe('initialSplitDraft', () => {
  it('starts equal between all live members', () => {
    expect(initialSplitDraft(['a', 'b', 'c'])).toEqual({
      splitType: 'equal',
      selectedIds: ['a', 'b', 'c'],
      values: {},
    });
  });

  it('restores an edited expense with its raw values', () => {
    const out = initialSplitDraft(['a', 'b', 'c'], {
      splitType: 'percentage',
      shares: [
        { memberId: 'a', shareValue: 70, shareAmount: 7 },
        { memberId: 'c', shareValue: 30, shareAmount: 3 },
      ],
    });
    expect(out.selectedIds).toEqual(['a', 'c']);
    expect(out.values).toEqual({ a: '70', c: '30' });
  });
});
