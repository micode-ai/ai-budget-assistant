import {
  apportionBp,
  checkMergeBalances,
  mergeConsent,
  normaliseMergePair,
  planMemberMerge,
  type MergeClaim,
} from './group-merge';
import { computeItemizedShares, type ClaimRow } from './group-items';

/** ABA-657: the pure half of the merge. The transaction and the in-transaction check are in group-merge.service.spec.ts. */

const guest = (id: string, claimed = false) => ({ id, userId: null, claimTokenHash: claimed ? `h-${id}` : null });
const app = (id: string) => ({ id, userId: `u-${id}`, claimTokenHash: null });

describe('normaliseMergePair', () => {
  it('refuses the same member and two app users', () => {
    expect(normaliseMergePair(guest('a'), guest('a'))).toEqual({ ok: false, reason: 'same_member' });
    expect(normaliseMergePair(app('a'), app('b'))).toEqual({ ok: false, reason: 'both_app_users' });
  });

  it('keeps the app-user row when it was named as the one to absorb', () => {
    const r = normaliseMergePair(app('a'), guest('g'));
    expect(r).toEqual({ ok: true, from: guest('g'), into: app('a') });
  });

  it('keeps the requested direction otherwise', () => {
    expect(normaliseMergePair(guest('g'), app('a'))).toEqual({ ok: true, from: guest('g'), into: app('a') });
    expect(normaliseMergePair(guest('g1'), guest('g2'))).toEqual({ ok: true, from: guest('g1'), into: guest('g2') });
  });
});

describe('mergeConsent', () => {
  const owner = { id: 'o', isOwner: true };
  const member = { id: 'm', isOwner: false };

  it('the owner may merge into a guest row or into their own row', () => {
    expect(mergeConsent(owner, guest('g1', true), guest('g2'))).toBe(true);
    expect(mergeConsent(owner, guest('g1', true), app('o'))).toBe(true);
  });

  it('the owner may NOT push a guest onto a guest row another person has claimed', () => {
    expect(mergeConsent(owner, guest('g1', true), guest('g2', true))).toBe(false);
    expect(mergeConsent(owner, guest('g1'), guest('g2', true))).toBe(false);
  });

  it('the owner may NOT push a balance onto another app user', () => {
    expect(mergeConsent(owner, guest('g1'), app('x'))).toBe(false);
  });

  it('any member may absorb an UNCLAIMED guest into their own row, nothing else', () => {
    expect(mergeConsent(member, guest('g'), app('m'))).toBe(true);
    expect(mergeConsent(member, guest('g', true), app('m'))).toBe(false);
    expect(mergeConsent(member, guest('g'), guest('g2'))).toBe(false);
    expect(mergeConsent(member, guest('g'), app('x'))).toBe(false);
  });

  it('never absorbs an app-user row', () => {
    expect(mergeConsent(owner, app('x'), guest('g'))).toBe(false);
  });
});

describe('apportionBp', () => {
  it('always sums to 10000, larger weights first on the remainder', () => {
    expect(apportionBp([2, 1])).toEqual([6667, 3333]);
    expect(apportionBp([2, 1, 1])).toEqual([5000, 2500, 2500]);
    expect(apportionBp([2, 1, 1, 1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(10000);
  });
});

describe('planMemberMerge', () => {
  const F = 'from';
  const I = 'into';
  const X = 'x';

  it('re-points a share when into has none, combines when both have one', () => {
    const plan = planMemberMerge({
      fromId: F,
      intoId: I,
      expenses: [
        { id: 'e1', splitType: 'exact', shares: [{ id: 's1', memberId: F, shareValue: 10, shareAmount: 10 }, { id: 's2', memberId: X, shareValue: 5, shareAmount: 5 }] },
        { id: 'e2', splitType: 'exact', shares: [{ id: 's3', memberId: F, shareValue: 3.5, shareAmount: 3.5 }, { id: 's4', memberId: I, shareValue: 1.25, shareAmount: 1.25 }] },
      ],
      claims: [],
      settlements: [],
    });
    expect(plan.shareRepoints).toEqual(['s1']);
    expect(plan.shareCombines).toEqual([{ expenseId: 'e2', keepId: 's4', deleteId: 's3', shareAmount: 4.75, shareValue: 4.75 }]);
    expect(plan.splitTypeChanges).toEqual([]);
  });

  it('an equal split both were on becomes a shares split, into holding 2 units', () => {
    const plan = planMemberMerge({
      fromId: F,
      intoId: I,
      expenses: [
        {
          id: 'e',
          splitType: 'equal',
          shares: [
            { id: 'sf', memberId: F, shareValue: null, shareAmount: 3.33 },
            { id: 'si', memberId: I, shareValue: null, shareAmount: 3.33 },
            { id: 'sx', memberId: X, shareValue: null, shareAmount: 3.34 },
          ],
        },
      ],
      claims: [],
      settlements: [],
    });
    expect(plan.shareCombines).toEqual([{ expenseId: 'e', keepId: 'si', deleteId: 'sf', shareAmount: 6.66, shareValue: 2 }]);
    expect(plan.splitTypeChanges).toEqual([{ expenseId: 'e', splitType: 'shares', values: [{ shareId: 'sx', value: 1 }] }]);
  });

  it('sums percentages and units', () => {
    const plan = planMemberMerge({
      fromId: F,
      intoId: I,
      expenses: [
        { id: 'p', splitType: 'percentage', shares: [{ id: 'a', memberId: F, shareValue: 25, shareAmount: 2.5 }, { id: 'b', memberId: I, shareValue: 40, shareAmount: 4 }] },
        { id: 'u', splitType: 'shares', shares: [{ id: 'c', memberId: F, shareValue: 1, shareAmount: 1 }, { id: 'd', memberId: I, shareValue: 3, shareAmount: 3 }] },
      ],
      claims: [],
      settlements: [],
    });
    expect(plan.shareCombines.map((c) => c.shareValue)).toEqual([65, 4]);
  });

  it('voids only LIVE settlements between the pair', () => {
    const plan = planMemberMerge({
      fromId: F,
      intoId: I,
      expenses: [],
      claims: [],
      settlements: [
        { id: 'fi', fromMemberId: F, toMemberId: I, voidedAt: null },
        { id: 'if', fromMemberId: I, toMemberId: F, voidedAt: null },
        { id: 'fx', fromMemberId: F, toMemberId: X, voidedAt: null },
        { id: 'old', fromMemberId: F, toMemberId: I, voidedAt: new Date() },
      ],
    });
    expect(plan.settlementVoids).toEqual(['fi', 'if']);
  });

  describe('claims', () => {
    const claim = (id: string, itemId: string, memberId: string, shareBp: number | null = null): MergeClaim => ({ id, itemId, memberId, shareBp });
    const plan = (claims: MergeClaim[], removedMemberIds: string[] = []) =>
      planMemberMerge({ fromId: F, intoId: I, expenses: [], claims, settlements: [], removedMemberIds });

    it('a line only from claimed is re-pointed as is (bp kept)', () => {
      const p = plan([claim('c1', 'l1', F), claim('c2', 'l2', F, 4000), claim('c3', 'l2', X, 6000)]);
      expect(p.claimRepoints.sort()).toEqual(['c1', 'c2']);
      expect(p.claimUpdates).toEqual([]);
      expect(p.claimDeletes).toEqual([]);
    });

    it('a line the pair split between them alone stays whole on into', () => {
      const p = plan([claim('cf', 'l', F), claim('ci', 'l', I)]);
      expect(p.claimDeletes).toEqual(['cf']);
      expect(p.claimUpdates).toEqual([]);
    });

    it('an equal line with a third claimant becomes explicit bp at its current fractions', () => {
      const p = plan([claim('cf', 'l', F), claim('ci', 'l', I), claim('cx', 'l', X)]);
      expect(p.claimDeletes).toEqual(['cf']);
      expect(p.claimUpdates).toEqual([
        { id: 'ci', shareBp: 6667 },
        { id: 'cx', shareBp: 3333 },
      ]);
    });

    it('a removed claimant does not count as a co-claimant (it reads as unclaimed everywhere)', () => {
      const p = plan([claim('cf', 'l', F), claim('ci', 'l', I), claim('cg', 'l', 'gone')], ['gone']);
      expect(p.claimUpdates).toEqual([]);
      expect(p.claimDeletes).toEqual(['cf']);
    });

    it('a hand-split line sums the pair onto into, null reading as 0, capped at 10000', () => {
      const p = plan([claim('cf', 'l', F, 3000), claim('ci', 'l', I, 2000), claim('cx', 'l', X, 5000), claim('df', 'm', F, null), claim('di', 'm', I, 7000)]);
      expect(p.claimUpdates).toEqual([
        { id: 'ci', shareBp: 5000 },
        { id: 'di', shareBp: 7000 },
      ]);
      expect(p.claimDeletes.sort()).toEqual(['cf', 'df']);
    });

    // This is why the merge SUMS the stored share rows instead of re-deriving them: a third of a line
    // is not a whole number of basis points, so a re-derivation from the converted claims can move a
    // cent between the third claimant and the payer. The merge itself never does; the next claim
    // change may, which is within the usual rounding of any claim change.
    it('the next re-derivation of the shares lands within a cent of the merged shares', () => {
      const items = [{ id: 'l', totalPrice: 30 }, { id: 'm', totalPrice: 12 }];
      const claims: ClaimRow[] = [
        { itemId: 'l', memberId: F, shareBp: null },
        { itemId: 'l', memberId: I, shareBp: null },
        { itemId: 'l', memberId: X, shareBp: null },
        { itemId: 'm', memberId: F, shareBp: null },
      ];
      const fig = { amount: 50, originalAmount: null, discountAmount: null, paidByMemberId: 'payer' };
      const before = computeItemizedShares(fig, items, claims);
      const p = plan(claims.map((c, k) => ({ id: `c${k}`, ...c })));
      const updated = new Map(p.claimUpdates.map((u) => [u.id, u.shareBp]));
      const after = claims
        .map((c, k) => ({ id: `c${k}`, ...c }))
        .filter((c) => !p.claimDeletes.includes(c.id))
        .map((c) => ({
          itemId: c.itemId,
          memberId: p.claimRepoints.includes(c.id) ? I : c.memberId,
          shareBp: updated.has(c.id) ? (updated.get(c.id) as number) : c.shareBp,
        }));
      const re = computeItemizedShares(fig, items, after);
      const amt = (rows: { memberId: string; shareAmount: number }[], id: string) => rows.find((r) => r.memberId === id)?.shareAmount ?? 0;
      const within = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(0.0100001);
      within(amt(re, I), amt(before, F) + amt(before, I));
      within(amt(re, X), amt(before, X));
      within(amt(re, 'payer'), amt(before, 'payer'));
      expect(re.reduce((t, r) => t + r.shareAmount, 0)).toBeCloseTo(50, 2);
    });
  });
});

describe('checkMergeBalances', () => {
  const m = (o: Record<string, number>) => new Map(Object.entries(o));

  it('holds when into carries the pair sum and everyone else is unchanged', () => {
    expect(checkMergeBalances(m({ f: -10, i: 4, x: 6 }), m({ i: -6, x: 6 }), 'f', 'i')).toEqual([]);
  });

  it('names every member that moved, the absorbed one included', () => {
    expect(checkMergeBalances(m({ f: -10, i: 4, x: 6 }), m({ f: -0.02, i: -6, x: 6.02 }), 'f', 'i').sort()).toEqual(['f', 'x']);
    expect(checkMergeBalances(m({ f: -10, i: 4, x: 6 }), m({ i: -5.99, x: 6 }), 'f', 'i')).toEqual(['i']);
  });

  it('counts a stray balance that appears out of nowhere', () => {
    expect(checkMergeBalances(m({ f: 0, i: 0 }), m({ i: 0, ghost: 1 }), 'f', 'i')).toEqual(['ghost']);
  });
});
