import {
  computeGroupLedger,
  maxSettlementAmount,
  validateSettlement,
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

describe('validateSettlement (ABA-652)', () => {
  // a owes 50, b owes 10, c is owed 30, d is owed 30. Suggested: a->c 30, a->d 20, b->d 10.
  const balances = [
    { memberId: 'a', netAmount: -50 },
    { memberId: 'b', netAmount: -10 },
    { memberId: 'c', netAmount: 30 },
    { memberId: 'd', netAmount: 30 },
    { memberId: 'z', netAmount: 0 },
  ];
  const v = (fromMemberId: string, toMemberId: string, amount: number) =>
    validateSettlement({ fromMemberId, toMemberId, amount }, balances);

  it.each([
    ['partial', 'a', 'c', 12.34, { ok: true, amount: 12.34 }],
    ['exact bound', 'a', 'c', 30, { ok: true, amount: 30 }],
    ['bound + 0.01 is clamped', 'a', 'c', 30.01, { ok: true, amount: 30 }],
    ['over by 0.02', 'a', 'c', 30.02, { ok: false, reason: 'exceeds_balance' }],
    ['bound is the smaller side (debtor)', 'b', 'c', 10.01, { ok: true, amount: 10 }],
    ['debtor side over', 'b', 'c', 10.02, { ok: false, reason: 'exceeds_balance' }],
    ['non-suggested creditor', 'b', 'c', 10, { ok: true, amount: 10 }],
    ['non-debtor from (a creditor)', 'c', 'd', 1, { ok: false, reason: 'not_debtor' }],
    ['non-debtor from (zero)', 'z', 'c', 1, { ok: false, reason: 'not_debtor' }],
    ['non-creditor to (a debtor)', 'a', 'b', 1, { ok: false, reason: 'not_creditor' }],
    ['non-creditor to (zero)', 'a', 'z', 1, { ok: false, reason: 'not_creditor' }],
    ['unknown member', 'a', 'nobody', 1, { ok: false, reason: 'not_creditor' }],
    ['same member', 'a', 'a', 1, { ok: false, reason: 'same_member' }],
    ['zero', 'a', 'c', 0, { ok: false, reason: 'too_small' }],
    ['negative', 'a', 'c', -5, { ok: false, reason: 'too_small' }],
    ['NaN', 'a', 'c', Number.NaN, { ok: false, reason: 'too_small' }],
  ])('%s', (_label, from, to, amount, expected) => {
    expect(v(from as string, to as string, amount as number)).toEqual(expected);
  });

  it('accepts every suggested transfer of a real ledger', () => {
    const members = ids(5);
    const all = members.map((m) => m.id);
    const l = computeGroupLedger(
      members,
      [expense('a', 'm1', 123.45, all), expense('b', 'm3', 50, ['m2', 'm4']), expense('c', 'm5', 9.99, all)],
      [],
    );
    expect(l.suggestedTransfers.length).toBeGreaterThan(0);
    for (const t of l.suggestedTransfers) {
      expect(validateSettlement(t, l.balances)).toEqual({ ok: true, amount: t.amount });
    }
  });

  it('only shrinks both balances and never flips a sign, whatever amount is accepted', () => {
    const members = ids(3);
    const exps = [expense('e1', 'm1', 100, ['m1', 'm2', 'm3'])]; // m1 +66.67, m2 -33.33, m3 -33.34
    const before = computeGroupLedger(members, exps, []);
    const net = (l: typeof before, id: string) => l.balances.find((b) => b.memberId === id)!.netAmount;
    for (const amount of [0.01, 1, 33.32, 33.33, 33.34, 40]) {
      const check = validateSettlement({ fromMemberId: 'm2', toMemberId: 'm1', amount }, before.balances);
      if (!check.ok) {
        expect(amount).toBeGreaterThan(33.34);
        continue;
      }
      const after = computeGroupLedger(members, exps, [
        { id: 's', fromMemberId: 'm2', toMemberId: 'm1', amount: check.amount },
      ]);
      expect(net(after, 'm2')).toBeLessThanOrEqual(0);
      expect(net(after, 'm2')).toBeGreaterThan(net(before, 'm2'));
      expect(net(after, 'm1')).toBeGreaterThanOrEqual(0);
      expect(net(after, 'm1')).toBeLessThan(net(before, 'm1'));
    }
  });

  it('ignores a sub-cent rounding residue as a balance', () => {
    const tiny = [
      { memberId: 'a', netAmount: -0.004 },
      { memberId: 'b', netAmount: 0.004 },
    ];
    expect(validateSettlement({ fromMemberId: 'a', toMemberId: 'b', amount: 0.01 }, tiny)).toEqual({
      ok: false,
      reason: 'not_debtor',
    });
  });

  it('maxSettlementAmount is min(owed, owed-to), or null off the debtor -> creditor direction', () => {
    expect(maxSettlementAmount('a', 'c', balances)).toBe(30);
    expect(maxSettlementAmount('b', 'd', balances)).toBe(10);
    expect(maxSettlementAmount('c', 'a', balances)).toBeNull();
    expect(maxSettlementAmount('a', 'a', balances)).toBeNull();
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
