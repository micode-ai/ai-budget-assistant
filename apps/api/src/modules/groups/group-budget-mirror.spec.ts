import {
  countedOutflow,
  dayDistance,
  isExactMatch,
  legKeyOf,
  mirrorStartFor,
  pairKeyOf,
  planCashLinks,
  planShareRows,
  type CashCandidate,
  type CashLeg,
} from './group-budget-mirror';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const leg = (over: Partial<CashLeg> = {}): CashLeg => ({
  key: legKeyOf('payer_expense', 'ge-1'),
  kind: 'payer_expense',
  refId: 'ge-1',
  amount: 200,
  currencyCode: 'PLN',
  date: d('2026-10-05'),
  authoredByMe: true,
  ...over,
});
const cand = (id: string, over: Partial<CashCandidate> = {}): CashCandidate => ({
  key: `e:${id}`,
  side: 'expense',
  id,
  amount: 200,
  currencyCode: 'PLN',
  date: d('2026-10-06'),
  ...over,
});

describe('group-budget-mirror (pure, ABA-660)', () => {
  it('mirrors from the first day of the current UTC month', () => {
    expect(mirrorStartFor(new Date('2026-10-19T23:30:00.000Z')).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('counts whole calendar days', () => {
    expect(dayDistance(d('2026-10-01'), new Date('2026-10-04T22:00:00.000Z'))).toBe(3);
  });

  describe('planShareRows', () => {
    const want = [
      { groupExpenseId: 'a', share: 50, date: d('2026-10-02') },
      { groupExpenseId: 'b', share: 0, date: d('2026-10-03') },
      { groupExpenseId: 'c', share: 12.5, date: d('2026-10-04') },
    ];

    it('creates a row per positive share, nothing for a zero share', () => {
      const plan = planShareRows(want, []);
      expect(plan.create.map((c) => c.groupExpenseId)).toEqual(['a', 'c']);
    });

    it('is idempotent on its own output', () => {
      const existing = [
        { id: 'r-a', groupExpenseId: 'a', isDeleted: false, date: d('2026-10-02'), groupShareAmount: 50 },
        { id: 'r-c', groupExpenseId: 'c', isDeleted: false, date: d('2026-10-04'), groupShareAmount: 12.5 },
      ];
      expect(planShareRows(want, existing)).toEqual({ create: [], update: [], remove: [], detach: [] });
    });

    it('re-prices a moved share, re-dates a moved date, removes a vanished one', () => {
      const existing = [
        { id: 'r-a', groupExpenseId: 'a', isDeleted: false, date: d('2026-10-02'), groupShareAmount: 40 },
        { id: 'r-b', groupExpenseId: 'b', isDeleted: false, date: d('2026-10-03'), groupShareAmount: 10 },
        { id: 'r-c', groupExpenseId: 'c', isDeleted: false, date: d('2026-10-01'), groupShareAmount: 12.5 },
        { id: 'r-x', groupExpenseId: 'x', isDeleted: false, date: d('2026-10-01'), groupShareAmount: 9 },
      ];
      const plan = planShareRows(want, existing);
      expect(plan.update).toEqual([
        { id: 'r-a', desired: want[0], reprice: true },
        { id: 'r-c', desired: want[2], reprice: false },
      ]);
      expect(plan.remove.sort()).toEqual(['r-b', 'r-x']);
      expect(plan.create).toEqual([]);
    });

    it('respects a row the user deleted, and detaches it once its expense is gone', () => {
      const existing = [
        { id: 'r-a', groupExpenseId: 'a', isDeleted: true, date: d('2026-10-01'), groupShareAmount: 1 },
        { id: 'r-x', groupExpenseId: 'x', isDeleted: true, date: d('2026-10-01'), groupShareAmount: 1 },
      ];
      const plan = planShareRows(want, existing);
      expect(plan.create.map((c) => c.groupExpenseId)).toEqual(['c']);
      expect(plan.update).toEqual([]);
      expect(plan.detach).toEqual(['r-x']);
    });
  });

  describe('planCashLinks (two tiers)', () => {
    it('auto-links a single exact candidate', () => {
      const plan = planCashLinks([leg()], [cand('x')], new Set());
      expect(plan.auto.map((a) => a.candidate.id)).toEqual(['x']);
      expect(plan.suggestions).toEqual([]);
    });

    it('H1: a leg someone else wrote is a suggestion even with one exact candidate', () => {
      const plan = planCashLinks([leg({ authoredByMe: false })], [cand('x')], new Set());
      expect(plan.auto).toEqual([]);
      expect(plan.suggestions.map((s) => s.candidate.id)).toEqual(['x']);
    });

    it('H1: a foreign leg still makes a shared exact candidate ambiguous for my own leg', () => {
      const mine = leg();
      const theirs = leg({ key: legKeyOf('payer_expense', 'ge-2'), refId: 'ge-2', authoredByMe: false });
      const plan = planCashLinks([mine, theirs], [cand('x')], new Set());
      expect(plan.auto).toEqual([]);
    });

    it('never auto-links when two rows match exactly: both are suggestions', () => {
      const plan = planCashLinks([leg()], [cand('x'), cand('y', { date: d('2026-10-04') })], new Set());
      expect(plan.auto).toEqual([]);
      expect(plan.suggestions.map((s) => s.candidate.id).sort()).toEqual(['x', 'y']);
    });

    it('never auto-links a row that is the exact match of two legs', () => {
      const l2 = leg({ key: legKeyOf('payer_expense', 'ge-2'), refId: 'ge-2' });
      const plan = planCashLinks([leg(), l2], [cand('x')], new Set());
      expect(plan.auto).toEqual([]);
      expect(plan.suggestions).toHaveLength(2);
    });

    it('suggests a near match (10%, 7 days) and ignores anything further', () => {
      const plan = planCashLinks(
        [leg()],
        [cand('tip', { amount: 215 }), cand('far', { amount: 230 }), cand('late', { date: d('2026-10-13') }), cand('eur', { currencyCode: 'EUR' })],
        new Set(),
      );
      expect(plan.auto).toEqual([]);
      expect(plan.suggestions.map((s) => s.candidate.id)).toEqual(['tip']);
    });

    it('an exact match 4 days away is only a suggestion', () => {
      expect(isExactMatch(leg(), cand('x', { date: d('2026-10-09') }))).toBe(false);
      const plan = planCashLinks([leg()], [cand('x', { date: d('2026-10-09') })], new Set());
      expect(plan.auto).toEqual([]);
      expect(plan.suggestions).toHaveLength(1);
    });

    it('matches a settlement received only against incomes', () => {
      const inLeg = leg({ key: legKeyOf('settlement_in', 's1'), kind: 'settlement_in', refId: 's1', amount: 150 });
      const plan = planCashLinks([inLeg], [cand('e', { amount: 150 }), cand('i', { side: 'income', key: 'i:i', amount: 150 })], new Set());
      expect(plan.auto.map((a) => a.candidate.id)).toEqual(['i']);
    });

    it('never plans a rejected pair again', () => {
      const plan = planCashLinks([leg()], [cand('x')], new Set([pairKeyOf(leg().key, 'e:x')]));
      expect(plan).toEqual({ auto: [], suggestions: [] });
    });
  });

  /**
   * The accounting table (spec H "Tests"): with every leg linked, the counted outflow equals the
   * member's consumption (the sum of their shares), and nothing is counted twice.
   */
  describe('accounting table', () => {
    it('payer: paid 200, my share 50 -> counts 50, not 250', () => {
      const rows = [
        { amount: 50, isSplitReceivable: false }, // share row
        { amount: 200, isSplitReceivable: true }, // the card payment, linked
      ];
      expect(countedOutflow(rows)).toBe(50);
    });

    it('debtor: share 50, paid my debt with a 50 transfer -> counts 50', () => {
      expect(countedOutflow([{ amount: 50, isSplitReceivable: false }, { amount: 50, isSplitReceivable: true }])).toBe(50);
    });

    it('mixed with netting: paid 90 (share 30), owe 40 on another (share 40), net transfer of 10 -> counts 70', () => {
      // Ann paid 120 split 3 ways (40 each), I paid 90 split 3 ways (30 each): netting leaves one transfer.
      const rows = [
        { amount: 30, isSplitReceivable: false },
        { amount: 40, isSplitReceivable: false },
        { amount: 90, isSplitReceivable: true }, // my card for my 90
        { amount: 10, isSplitReceivable: true }, // my netted transfer to Ann
      ];
      expect(countedOutflow(rows)).toBe(70);
    });

    it('an unlinked payment is counted twice, which is why the app lists unlinked legs', () => {
      expect(countedOutflow([{ amount: 50, isSplitReceivable: false }, { amount: 200, isSplitReceivable: false }])).toBe(250);
    });
  });
});
