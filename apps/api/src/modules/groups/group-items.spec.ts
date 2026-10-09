import { allocateItemShares, resolveItemSplit } from '../receipt-split/split-calculator';
import {
  applyManagedClaims,
  applyOwnClaims,
  canManageClaims,
  claimWindowEnd,
  claimsToAssignments,
  computeItemizedShares,
  isClaimsOpen,
  membersWithMovedShares,
  myLineParts,
  resolveItemizedSplit,
  sameShares,
  toGroupCurrencyShares,
  validateClaimShares,
  validateItemLines,
  CLAIM_WINDOW_MS,
  type ClaimRow,
  type ItemRow,
} from './group-items';

const PAYER = 'm-pay';
const ANN = 'm-ann';
const BO = 'm-bo';

const items: ItemRow[] = [
  { id: 'i-pizza', totalPrice: 40 },
  { id: 'i-wine', totalPrice: 60 },
  { id: 'i-bread', totalPrice: 10.01 },
  { id: 'i-salad', totalPrice: 20, lineDiscount: 5 },
];

const cents = (n: number) => Math.round(n * 100);
const sumCents = (xs: { amount?: number; shareAmount?: number }[]) =>
  xs.reduce((s, x) => s + cents(x.amount ?? x.shareAmount ?? 0), 0);

describe('group-items: receipt-split math, payer as a participant (ABA-655)', () => {
  it('matches resolveItemSplit for the same input: claimants as participants, payer = own claims + ownShare', () => {
    const claims: ClaimRow[] = [
      { itemId: 'i-pizza', memberId: ANN, shareBp: null },
      { itemId: 'i-wine', memberId: ANN, shareBp: null },
      { itemId: 'i-wine', memberId: BO, shareBp: null },
      { itemId: 'i-wine', memberId: PAYER, shareBp: null },
      { itemId: 'i-bread', memberId: PAYER, shareBp: null },
    ];
    const billTotal = 140; // lines 125.01 + a 14.99 deposit that is not a line
    const ref = resolveItemSplit(
      items.map((i) => ({ id: i.id, totalPrice: i.totalPrice, ...(i.lineDiscount ? { lineDiscount: i.lineDiscount } : {}) })),
      claimsToAssignments(claims),
      billTotal,
    );
    const out = resolveItemizedSplit({ items, claims, billTotal, payerMemberId: PAYER });

    const refOf = (id: string) => ref.shares.find((s) => s.participantId === id)?.amount ?? 0;
    expect(out.find((s) => s.memberId === ANN)?.amount).toBe(refOf(ANN));
    expect(out.find((s) => s.memberId === BO)?.amount).toBe(refOf(BO));
    expect(cents(out.find((s) => s.memberId === PAYER)!.amount)).toBe(cents(refOf(PAYER)) + cents(ref.ownShare));
    expect(out[out.length - 1].memberId).toBe(PAYER);
    expect(sumCents(out)).toBe(cents(billTotal));
  });

  it('gives the payer every unclaimed line, the rounding and anything that is not a line (a deposit)', () => {
    const out = resolveItemizedSplit({
      items: [{ id: 'a', totalPrice: 10 }],
      claims: [
        { itemId: 'a', memberId: ANN, shareBp: null },
        { itemId: 'a', memberId: BO, shareBp: null },
        { itemId: 'a', memberId: 'm-cy', shareBp: null },
      ],
      billTotal: 12.5, // 10 of lines + 2.50 deposit
      payerMemberId: PAYER,
    });
    expect(out).toEqual([
      { memberId: ANN, amount: 3.33 },
      { memberId: BO, amount: 3.33 },
      { memberId: 'm-cy', amount: 3.33 },
      { memberId: PAYER, amount: 2.51 }, // 2.50 deposit + 0.01 rounding
    ]);
  });

  it('with no claims the payer holds the whole amount', () => {
    expect(resolveItemizedSplit({ items, claims: [], billTotal: 125.01, payerMemberId: PAYER })).toEqual([
      { memberId: PAYER, amount: 125.01 },
    ]);
  });

  it('scales every claim by (lines - discount) / lines for a basket discount, the deposit untouched', () => {
    const out = resolveItemizedSplit({
      items: [
        { id: 'a', totalPrice: 50 },
        { id: 'b', totalPrice: 50 },
      ],
      claims: [{ itemId: 'a', memberId: ANN, shareBp: null }],
      billTotal: 85, // 100 lines - 20 discount + 5 deposit
      discountAmount: 20,
      payerMemberId: PAYER,
    });
    expect(out.find((s) => s.memberId === ANN)?.amount).toBe(40);
    expect(out.find((s) => s.memberId === PAYER)?.amount).toBe(45);
  });

  it('applies per-line discounts and explicit shares; the rest of a hand-split line is the payer’s', () => {
    const out = resolveItemizedSplit({
      items: [{ id: 'w', totalPrice: 60, lineDiscount: 10 }],
      claims: [{ itemId: 'w', memberId: ANN, shareBp: 6000 }],
      billTotal: 50,
      payerMemberId: PAYER,
    });
    expect(out).toEqual([
      { memberId: ANN, amount: 30 },
      { memberId: PAYER, amount: 20 },
    ]);
  });

  it('a claimant with no share on a hand-split line takes nothing (receipt-split semantics)', () => {
    const out = resolveItemizedSplit({
      items: [{ id: 'w', totalPrice: 60 }],
      claims: [
        { itemId: 'w', memberId: ANN, shareBp: 5000 },
        { itemId: 'w', memberId: BO, shareBp: null },
      ],
      billTotal: 60,
      payerMemberId: PAYER,
    });
    expect(out).toEqual([
      { memberId: ANN, amount: 30 },
      { memberId: PAYER, amount: 30 },
    ]);
  });
});

describe('group-items: group-currency shares (spec F weights, payer residual)', () => {
  it('without a conversion the amounts are the shares', () => {
    const line = [
      { memberId: ANN, amount: 10 },
      { memberId: PAYER, amount: 5 },
    ];
    expect(toGroupCurrencyShares(line, 15, false)).toEqual([
      { memberId: ANN, shareValue: 10, shareAmount: 10 },
      { memberId: PAYER, shareValue: 5, shareAmount: 5 },
    ]);
  });

  it('a foreign expense: lines split in the original currency, converted as weights, payer last absorbs the cent', () => {
    // 100.00 EUR at 4.3167 -> 431.67 PLN stored.
    const expense = { amount: 431.67, originalAmount: 100, discountAmount: null, paidByMemberId: PAYER };
    const shares = computeItemizedShares(
      expense,
      [
        { id: 'a', totalPrice: 33.33 },
        { id: 'b', totalPrice: 33.33 },
        { id: 'c', totalPrice: 33.34 },
      ],
      [
        { itemId: 'a', memberId: ANN, shareBp: null },
        { itemId: 'b', memberId: BO, shareBp: null },
      ],
    );
    expect(shares.map((s) => s.memberId)).toEqual([ANN, BO, PAYER]);
    expect(sumCents(shares)).toBe(cents(431.67)); // the ledger sums to the stored amount exactly
    expect(shares[0].shareValue).toBe(33.33); // entry currency kept as the raw value
    expect(shares[0].shareAmount).toBeCloseTo(143.87, 2);
  });

  it('sums to the expense total for many random receipts (group currency and converted)', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let n = 0; n < 200; n++) {
      const lines: ItemRow[] = Array.from({ length: 1 + Math.floor(rnd() * 8) }, (_, i) => ({
        id: `l${i}`,
        totalPrice: Math.round(rnd() * 5000) / 100,
      }));
      const lineSum = lines.reduce((s, l) => s + cents(l.totalPrice), 0) / 100;
      const deposit = Math.round(rnd() * 300) / 100;
      const billTotal = Math.round((lineSum + deposit) * 100) / 100 || 0.01;
      const who = [ANN, BO, 'm-cy', PAYER];
      const claims: ClaimRow[] = [];
      for (const l of lines) for (const m of who) if (rnd() < 0.4) claims.push({ itemId: l.id, memberId: m, shareBp: null });
      const local = computeItemizedShares({ amount: billTotal, originalAmount: null, discountAmount: null, paidByMemberId: PAYER }, lines, claims);
      expect(sumCents(local)).toBe(cents(billTotal));
      expect(local.every((s) => s.shareAmount >= 0)).toBe(true);
      const groupAmount = Math.round(billTotal * 4.2 * 100) / 100;
      const conv = computeItemizedShares({ amount: groupAmount, originalAmount: billTotal, discountAmount: null, paidByMemberId: PAYER }, lines, claims);
      expect(sumCents(conv)).toBe(cents(groupAmount));
    }
  });

  it('sameShares / membersWithMovedShares compare in cents, order-insensitive', () => {
    const a = [
      { memberId: ANN, shareAmount: 10 },
      { memberId: PAYER, shareAmount: 5 },
    ];
    expect(sameShares(a, [...a].reverse())).toBe(true);
    expect(sameShares(a, [{ memberId: PAYER, shareAmount: 15 }])).toBe(false);
    expect(membersWithMovedShares(a, [{ memberId: PAYER, shareAmount: 10 }, { memberId: BO, shareAmount: 5 }]).sort()).toEqual(
      [ANN, BO, PAYER].sort(),
    );
  });
});

describe('group-items: the lock rule', () => {
  const now = new Date('2026-10-09T12:00:00Z');

  it('is open only for an itemised expense before claimsOpenUntil', () => {
    expect(isClaimsOpen({ itemized: true, claimsOpenUntil: claimWindowEnd(now) }, now)).toBe(true);
    expect(isClaimsOpen({ itemized: true, claimsOpenUntil: new Date(now.getTime() + CLAIM_WINDOW_MS - 1) }, new Date(now.getTime() + CLAIM_WINDOW_MS))).toBe(false);
    expect(isClaimsOpen({ itemized: true, claimsOpenUntil: now }, now)).toBe(false); // closed = "now"
    expect(isClaimsOpen({ itemized: true, claimsOpenUntil: null }, now)).toBe(false);
    expect(isClaimsOpen({ itemized: false, claimsOpenUntil: claimWindowEnd(now) }, now)).toBe(false);
  });

  it('the window is 7 days', () => {
    expect(claimWindowEnd(now).toISOString()).toBe('2026-10-16T12:00:00.000Z');
  });

  it('payer, creator and owner manage claims; anyone else does not', () => {
    const e = { paidByMemberId: PAYER, createdByMemberId: 'm-creator' };
    expect(canManageClaims({ id: PAYER, isOwner: false }, e)).toBe(true);
    expect(canManageClaims({ id: 'm-creator', isOwner: false }, e)).toBe(true);
    expect(canManageClaims({ id: 'm-x', isOwner: true }, e)).toBe(true);
    expect(canManageClaims({ id: ANN, isOwner: false }, e)).toBe(false);
  });
});

describe('group-items: validation', () => {
  it('lines must fit what was paid; the rest is the payer’s', () => {
    expect(validateItemLines([{ totalPrice: 10 }], 12)).toBeNull();
    expect(validateItemLines([{ totalPrice: 10 }], 9.99)).toBe('lines_exceed_total');
    expect(validateItemLines([{ totalPrice: 10 }], 8, 2)).toBeNull();
    expect(validateItemLines([{ totalPrice: 10 }], 10, 10)).toBe('bad_discount');
    expect(validateItemLines([{ totalPrice: 10, lineDiscount: 11 }], 10)).toBe('bad_line_discount');
    expect(validateItemLines([], 10)).toBe('no_items');
    expect(validateItemLines(Array.from({ length: 101 }, () => ({ totalPrice: 0 })), 10)).toBe('too_many_items');
  });

  it('shares are whole bp in 0..10000 and at most 10000 per line', () => {
    expect(validateClaimShares([{ itemId: 'a', memberId: ANN, shareBp: 6000 }, { itemId: 'a', memberId: BO, shareBp: 4000 }])).toBeNull();
    expect(validateClaimShares([{ itemId: 'a', memberId: ANN, shareBp: 6000 }, { itemId: 'a', memberId: BO, shareBp: 4001 }])).toBe('line_over_full');
    expect(validateClaimShares([{ itemId: 'a', memberId: ANN, shareBp: 1.5 }])).toBe('bad_share');
    expect(validateClaimShares([{ itemId: 'a', memberId: ANN, shareBp: -1 }])).toBe('bad_share');
    expect(validateClaimShares([{ itemId: 'a', memberId: ANN, shareBp: 0 }])).toBeNull(); // an explicit zero is kept
  });
});

describe('group-items: claim edits', () => {
  const existing: ClaimRow[] = [
    { itemId: 'a', memberId: ANN, shareBp: 3000 },
    { itemId: 'b', memberId: ANN, shareBp: null },
    { itemId: 'c', memberId: ANN, shareBp: null },
    { itemId: 'a', memberId: BO, shareBp: null },
  ];

  it('own claims: inside the scope exactly the checked lines, outside the scope nothing moves, bp kept', () => {
    // The form rendered a and b only; c was not shown. Ann unticks b and keeps a.
    const next = applyOwnClaims(existing, ANN, ['a', 'b'], ['a']);
    expect(next).toEqual([
      { itemId: 'a', memberId: ANN, shareBp: 3000 }, // explicit share untouched
      { itemId: 'c', memberId: ANN, shareBp: null }, // not shown -> not unclaimed
      { itemId: 'a', memberId: BO, shareBp: null },
    ]);
  });

  it('own claims: a newly ticked line divides equally; a checked id outside the scope is ignored', () => {
    const next = applyOwnClaims(existing, BO, ['a', 'b'], ['a', 'b', 'zzz']);
    expect(next.filter((c) => c.memberId === BO)).toEqual([
      { itemId: 'a', memberId: BO, shareBp: null },
      { itemId: 'b', memberId: BO, shareBp: null },
    ]);
  });

  it('managed claims replace the listed members only; omitted shareBp keeps stored shares', () => {
    const next = applyManagedClaims(existing, [{ memberId: ANN, itemIds: ['a'] }]);
    expect(next).toEqual([
      { itemId: 'a', memberId: BO, shareBp: null },
      { itemId: 'a', memberId: ANN, shareBp: 3000 },
    ]);
    const withBp = applyManagedClaims(existing, [{ memberId: BO, itemIds: ['a', 'b'], shareBp: { a: 7000 } }]);
    expect(withBp.filter((c) => c.memberId === BO)).toEqual([
      { itemId: 'a', memberId: BO, shareBp: 7000 },
      { itemId: 'b', memberId: BO, shareBp: null },
    ]);
    expect(() => applyManagedClaims(existing, [{ memberId: BO, itemIds: ['a'], shareBp: { b: 100 } }])).toThrow('bad_share_target');
  });
});

describe('group-items: your part of each line', () => {
  it('allocates the member’s claims-only total across their lines and adds up to it (allocateItemShares)', () => {
    const lines: ItemRow[] = [
      { id: 'a', totalPrice: 10 },
      { id: 'b', totalPrice: 20 },
    ];
    const claims: ClaimRow[] = [
      { itemId: 'a', memberId: ANN, shareBp: null },
      { itemId: 'a', memberId: BO, shareBp: null },
      { itemId: 'a', memberId: 'm-cy', shareBp: null },
      { itemId: 'b', memberId: ANN, shareBp: null },
    ];
    const { parts, total } = myLineParts(lines, claims, ANN, 30, 6); // 20% basket discount
    expect(total).toBe(18.66);
    expect(cents(parts.get('a')! + parts.get('b')!)).toBe(cents(total));
    const ref = allocateItemShares(
      [
        { id: 'a', totalPrice: 10, claimantCount: 3 },
        { id: 'b', totalPrice: 20, claimantCount: 1 },
      ],
      total,
    );
    expect(parts.get('a')).toBe(ref[0].amount);
    expect(myLineParts(lines, claims, PAYER, 30).total).toBe(0); // the payer's remainder is not "their lines"
  });
});
