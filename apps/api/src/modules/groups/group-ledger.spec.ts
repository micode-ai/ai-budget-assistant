import {
  computeGroupLedger,
  isValidSettlement,
  myShareThisMonth,
  resolveGroupShares,
  type LedgerExpense,
} from './group-ledger';

const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `m${i + 1}` }));
const sum = (b: { netAmount: number }[]) => b.reduce((a, x) => a + x.netAmount, 0);

function expense(
  id: string,
  paidBy: string,
  amount: number,
  memberIds: string[],
  extra: Partial<LedgerExpense> = {},
): LedgerExpense {
  const shares = resolveGroupShares(amount, 'equal', memberIds.map((memberId) => ({ memberId })));
  return { id, paidByMemberId: paidBy, amount, shares, ...extra };
}

describe('resolveGroupShares', () => {
  it('gives the residual cent to the last member', () => {
    const r = resolveGroupShares(10, 'equal', [{ memberId: 'a' }, { memberId: 'b' }, { memberId: 'c' }]);
    expect(r.map((s) => s.shareAmount)).toEqual([3.33, 3.33, 3.34]);
    expect(r.every((s) => s.shareValue === null)).toBe(true);
  });

  it('keeps the raw value for non-equal splits', () => {
    const r = resolveGroupShares(100, 'percentage', [
      { memberId: 'a', value: 70 },
      { memberId: 'b', value: 30 },
    ]);
    expect(r).toEqual([
      { memberId: 'a', shareValue: 70, shareAmount: 70 },
      { memberId: 'b', shareValue: 30, shareAmount: 30 },
    ]);
  });

  it('throws when exact shares do not sum to the amount', () => {
    expect(() =>
      resolveGroupShares(100, 'exact', [
        { memberId: 'a', value: 10 },
        { memberId: 'b', value: 10 },
      ]),
    ).toThrow();
  });
});

describe('computeGroupLedger', () => {
  it('pads a member with no activity at 0', () => {
    const l = computeGroupLedger(ids(3), [expense('e1', 'm1', 20, ['m1', 'm2'])], []);
    expect(l.balances.find((b) => b.memberId === 'm3')).toEqual({ memberId: 'm3', netAmount: 0 });
    expect(l.balances).toHaveLength(3);
  });

  it('balances sum to 0 for a mix of split types', () => {
    const members = ids(4);
    const exps: LedgerExpense[] = [
      expense('e1', 'm1', 100.01, ['m1', 'm2', 'm3', 'm4']),
      {
        id: 'e2',
        paidByMemberId: 'm2',
        amount: 90,
        shares: resolveGroupShares(90, 'shares', [
          { memberId: 'm1', value: 1 },
          { memberId: 'm3', value: 2 },
        ]),
      },
      {
        id: 'e3',
        paidByMemberId: 'm4',
        amount: 33.33,
        shares: resolveGroupShares(33.33, 'percentage', [
          { memberId: 'm1', value: 33 },
          { memberId: 'm2', value: 33 },
          { memberId: 'm3', value: 34 },
        ]),
      },
    ];
    const l = computeGroupLedger(members, exps, []);
    expect(Math.abs(sum(l.balances))).toBeLessThanOrEqual(0.01);
  });

  it('nets a settlement into both balances and suggested transfers', () => {
    const members = ids(2);
    const exps = [expense('e1', 'm1', 100, ['m1', 'm2'])];
    const before = computeGroupLedger(members, exps, []);
    expect(before.suggestedTransfers).toEqual([{ fromMemberId: 'm2', toMemberId: 'm1', amount: 50 }]);
    const after = computeGroupLedger(members, exps, [
      { id: 's1', fromMemberId: 'm2', toMemberId: 'm1', amount: 50 },
    ]);
    expect(after.balances.every((b) => b.netAmount === 0)).toBe(true);
    expect(after.suggestedTransfers).toEqual([]);
  });

  it('excludes voided settlements and deleted expenses', () => {
    const l = computeGroupLedger(
      ids(2),
      [
        expense('e1', 'm1', 100, ['m1', 'm2']),
        expense('e2', 'm2', 500, ['m1', 'm2'], { deletedAt: new Date() }),
      ],
      [{ id: 's1', fromMemberId: 'm2', toMemberId: 'm1', amount: 50, voidedAt: new Date() }],
    );
    expect(l.balances).toEqual([
      { memberId: 'm1', netAmount: 50 },
      { memberId: 'm2', netAmount: -50 },
    ]);
  });

  it.each([4, 6])('yields at most n-1 transfers for %i members', (n) => {
    const members = ids(n);
    const all = members.map((m) => m.id);
    const exps = members.map((m, i) =>
      expense(`e${i}`, m.id, 37.77 + i * 11.13, all.slice(0, ((i + 1) % n) + 1)),
    );
    const l = computeGroupLedger(members, exps, []);
    expect(l.suggestedTransfers.length).toBeLessThanOrEqual(n - 1);
    expect(Math.abs(sum(l.balances))).toBeLessThanOrEqual(0.01);
  });

  it('applying every suggested transfer zeroes the ledger', () => {
    const members = ids(5);
    const all = members.map((m) => m.id);
    const exps = [
      expense('a', 'm1', 123.45, all),
      expense('b', 'm3', 50, ['m2', 'm4']),
      expense('c', 'm5', 9.99, all),
    ];
    const first = computeGroupLedger(members, exps, []);
    const settlements = first.suggestedTransfers.map((t, i) => ({ id: `s${i}`, ...t }));
    const after = computeGroupLedger(members, exps, settlements);
    expect(after.balances.every((b) => Math.abs(b.netAmount) <= 0.01)).toBe(true);
    expect(after.suggestedTransfers).toEqual([]);
  });
});

describe('isValidSettlement', () => {
  const suggested = [{ fromMemberId: 'a', toMemberId: 'b', amount: 25.5 }];

  it('accepts a match within 0.01', () => {
    expect(isValidSettlement({ fromMemberId: 'a', toMemberId: 'b', amount: 25.5 }, suggested)).toBe(true);
    expect(isValidSettlement({ fromMemberId: 'a', toMemberId: 'b', amount: 25.51 }, suggested)).toBe(true);
  });

  it('rejects a different amount, reversed direction or unknown pair', () => {
    expect(isValidSettlement({ fromMemberId: 'a', toMemberId: 'b', amount: 25.6 }, suggested)).toBe(false);
    expect(isValidSettlement({ fromMemberId: 'b', toMemberId: 'a', amount: 25.5 }, suggested)).toBe(false);
    expect(isValidSettlement({ fromMemberId: 'a', toMemberId: 'c', amount: 25.5 }, suggested)).toBe(false);
    expect(isValidSettlement({ fromMemberId: 'a', toMemberId: 'b', amount: 1 }, [])).toBe(false);
  });
});

describe('myShareThisMonth', () => {
  const now = new Date('2026-10-15T12:00:00Z');
  const sh = (amt: number) => [
    { memberId: 'm1', shareAmount: amt },
    { memberId: 'm2', shareAmount: 99 },
  ];

  it('sums only my live shares in the current month', () => {
    const total = myShareThisMonth(
      'm1',
      [
        { id: '1', date: new Date('2026-10-01T00:00:00Z'), shares: sh(10.25) },
        { id: '2', date: '2026-10-31', shares: sh(5) },
        { id: '3', date: new Date('2026-09-30T00:00:00Z'), shares: sh(100) },
        { id: '4', date: new Date('2026-10-10T00:00:00Z'), shares: sh(50), deletedAt: new Date() },
      ],
      now,
    );
    expect(total).toBe(15.25);
  });

  it('is 0 with no matching expenses', () => {
    expect(myShareThisMonth('m9', [{ id: '1', date: '2026-10-02', shares: sh(5) }], now)).toBe(0);
  });
});
