import { resolveItemSplit, resolveEqualSplit } from './split-calculator';

const item = (id: string, totalPrice: number) => ({ id, totalPrice });

describe('resolveItemSplit', () => {
  it('assigns a whole item to its single claimant', () => {
    const out = resolveItemSplit([item('i1', 30)], [{ participantId: 'p1', itemIds: ['i1'] }], 30);
    expect(out.shares).toEqual([{ participantId: 'p1', amount: 30 }]);
    expect(out.ownShare).toBe(0);
  });

  it('splits a shared item equally between its claimants', () => {
    const out = resolveItemSplit(
      [item('wine', 60)],
      [
        { participantId: 'p1', itemIds: ['wine'] },
        { participantId: 'p2', itemIds: ['wine'] },
      ],
      60,
    );
    expect(out.shares).toEqual([
      { participantId: 'p1', amount: 30 },
      { participantId: 'p2', amount: 30 },
    ]);
  });

  it('leaves unclaimed items with the payer', () => {
    const out = resolveItemSplit(
      [item('i1', 30), item('i2', 20)],
      [{ participantId: 'p1', itemIds: ['i1'] }],
      50,
    );
    expect(out.shares).toEqual([{ participantId: 'p1', amount: 30 }]);
    expect(out.ownShare).toBe(20);
  });

  it('gives the rounding remainder to the payer, not a participant', () => {
    // 10.00 split three ways is 3.333…; each participant is charged 3.33 and the
    // payer absorbs the extra cent.
    const out = resolveItemSplit(
      [item('i1', 10)],
      [
        { participantId: 'p1', itemIds: ['i1'] },
        { participantId: 'p2', itemIds: ['i1'] },
        { participantId: 'p3', itemIds: ['i1'] },
      ],
      10,
    );
    expect(out.shares.map((s) => s.amount)).toEqual([3.33, 3.33, 3.33]);
    expect(out.ownShare).toBe(0.01);
  });

  it('always closes against the bill total', () => {
    const out = resolveItemSplit(
      [item('i1', 33.33), item('i2', 33.33), item('i3', 33.34)],
      [
        { participantId: 'p1', itemIds: ['i1'] },
        { participantId: 'p2', itemIds: ['i2'] },
      ],
      100,
    );
    const sum = out.shares.reduce((a, s) => a + s.amount, 0) + out.ownShare;
    expect(Math.round(sum * 100) / 100).toBe(100);
  });

  it('ignores an assignment referring to an unknown item id', () => {
    const out = resolveItemSplit([item('i1', 30)], [{ participantId: 'p1', itemIds: ['ghost'] }], 30);
    expect(out.shares).toEqual([{ participantId: 'p1', amount: 0 }]);
    expect(out.ownShare).toBe(30);
  });

  it('floors the per-head amount rather than rounding it (7-way split)', () => {
    // 10.00 / 7 = 1.4285714… — each participant must be charged 1.42 (floor),
    // not 1.43 (round). A floor→round regression on the participant path
    // would produce 1.43 here and would fail this assertion.
    const out = resolveItemSplit(
      [item('i1', 10)],
      [
        { participantId: 'p1', itemIds: ['i1'] },
        { participantId: 'p2', itemIds: ['i1'] },
        { participantId: 'p3', itemIds: ['i1'] },
        { participantId: 'p4', itemIds: ['i1'] },
        { participantId: 'p5', itemIds: ['i1'] },
        { participantId: 'p6', itemIds: ['i1'] },
        { participantId: 'p7', itemIds: ['i1'] },
      ],
      10,
    );
    expect(out.shares.map((s) => s.amount)).toEqual([1.42, 1.42, 1.42, 1.42, 1.42, 1.42, 1.42]);
    expect(out.ownShare).toBe(0.06);
  });

  it('charges exactly 19.99 for a sole claimant of a 19.99 item (no floating-point drift)', () => {
    // 19.99 * 100 === 1998.9999999999998 in raw floating point — a floor of
    // that would wrongly charge 19.98. This must land on exactly 19.99.
    const out = resolveItemSplit([item('i1', 19.99)], [{ participantId: 'p1', itemIds: ['i1'] }], 19.99);
    expect(out.shares).toEqual([{ participantId: 'p1', amount: 19.99 }]);
    expect(out.ownShare).toBe(0);
  });

  it('charges exactly 0.29 for a sole claimant of a 0.29 item (drifts the other way)', () => {
    // 0.29 * 100 === 28.999999999999996 in raw floating point — same drift,
    // opposite direction from 19.99. Must still land on exactly 0.29.
    const out = resolveItemSplit([item('i1', 0.29)], [{ participantId: 'p1', itemIds: ['i1'] }], 0.29);
    expect(out.shares).toEqual([{ participantId: 'p1', amount: 0.29 }]);
    expect(out.ownShare).toBe(0);
  });

  it('produces one row per participant even when they appear in multiple assignment entries', () => {
    // A caller that builds assignments item-first (one entry per item, not
    // one entry per participant) can legally repeat a participantId. Before
    // the fix this produced a duplicate row (each carrying the full total,
    // so a consumer summing rows double-counted) and a wrong ownShare.
    const out = resolveItemSplit(
      [item('i1', 10), item('i2', 20)],
      [
        { participantId: 'p1', itemIds: ['i1'] },
        { participantId: 'p1', itemIds: ['i2'] },
      ],
      30,
    );
    expect(out.shares).toEqual([{ participantId: 'p1', amount: 30 }]);
    expect(out.ownShare).toBe(0);
  });
});

describe('resolveEqualSplit', () => {
  it('divides the bill among the participants and the payer', () => {
    const out = resolveEqualSplit(['p1', 'p2', 'p3'], 100);
    expect(out.shares.map((s) => s.amount)).toEqual([25, 25, 25]);
    expect(out.ownShare).toBe(25);
  });

  it('gives the rounding remainder to the payer', () => {
    // 10.00 across three participants + the payer is 2.50 each — but 10.00 across
    // two participants + the payer is 3.333…, so the payer absorbs the cent.
    const out = resolveEqualSplit(['p1', 'p2'], 10);
    expect(out.shares.map((s) => s.amount)).toEqual([3.33, 3.33]);
    expect(out.ownShare).toBe(3.34);
  });

  it('handles a single participant', () => {
    const out = resolveEqualSplit(['p1'], 7);
    expect(out.shares).toEqual([{ participantId: 'p1', amount: 3.5 }]);
    expect(out.ownShare).toBe(3.5);
  });

  it('floors the per-head amount rather than rounding it', () => {
    // 3.55 across 1 participant + the payer (2 heads) is 1.775 per head —
    // must floor to 1.77, not round to 1.78. A floor→round regression here
    // would produce 1.78 and would fail this assertion.
    const out = resolveEqualSplit(['p1'], 3.55);
    expect(out.shares).toEqual([{ participantId: 'p1', amount: 1.77 }]);
    expect(out.ownShare).toBe(1.78);
  });
});
