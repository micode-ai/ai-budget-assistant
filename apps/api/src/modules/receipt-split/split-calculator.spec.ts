import { resolveItemSplit, resolveEqualSplit, allocateItemShares } from './split-calculator';

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

describe('allocateItemShares', () => {
  const line = (id: string, totalPrice: number, claimantCount = 1) => ({ id, totalPrice, claimantCount });

  const totalOf = (shares: { amount: number }[]) =>
    Math.round(shares.reduce((sum, s) => sum + s.amount, 0) * 100);

  /** What `resolveItemSplit` would have stored on the participant row for a
   *  guest claiming exactly these lines — the number the guest page prints as
   *  their total, and the number the rendered lines have to add up to. */
  const storedTotal = (lines: { id: string; totalPrice: number; claimantCount: number }[]) => {
    const out = resolveItemSplit(
      lines.map((l) => ({ id: l.id, totalPrice: l.totalPrice })),
      [
        { participantId: 'p1', itemIds: lines.map((l) => l.id) },
        // The other claimants of each shared line, so resolveItemSplit divides
        // by exactly the counts under test.
        ...lines.flatMap((l) =>
          Array.from({ length: Math.max(0, l.claimantCount - 1) }, (_, i) => ({
            participantId: `other-${l.id}-${i}`,
            itemIds: [l.id],
          })),
        ),
      ],
      1_000_000,
    );
    return out.shares.find((s) => s.participantId === 'p1')?.amount ?? 0;
  };

  it('gives an unshared line its whole price', () => {
    expect(allocateItemShares([line('i1', 30)], 30)).toEqual([{ id: 'i1', amount: 30, sharedWith: 1 }]);
  });

  it('halves a line shared with one other person', () => {
    expect(allocateItemShares([line('wine', 60, 2)], 30)).toEqual([
      { id: 'wine', amount: 30, sharedWith: 2 },
    ]);
  });

  it('never renders lines that contradict the stored total', () => {
    // 0.05 split two ways, twice. Rounding each line on its own renders
    // 0.03 + 0.03 = 0.06 against a stored total of 0.05 — the mismatch that
    // made the guest page look wrong.
    const lines = [line('a', 0.05, 2), line('b', 0.05, 2)];
    const total = storedTotal(lines);
    expect(total).toBe(0.05);
    expect(totalOf(allocateItemShares(lines, total))).toBe(5);
  });

  it('keeps lines summing to the stored total across a spread of thirds', () => {
    const lines = [line('a', 10, 3), line('b', 20, 3), line('c', 0.01, 3), line('d', 7.77, 3)];
    const total = storedTotal(lines);
    expect(totalOf(allocateItemShares(lines, total))).toBe(Math.round(total * 100));
  });

  it('hands each leftover cent to the line with the largest remainder', () => {
    // 1.00/3 = 33.33c (remainder .33), 2.00/3 = 66.67c (remainder .67).
    // Floors are 33 + 66 = 99 against a 100c total, so the one leftover cent
    // goes to 'b'.
    expect(allocateItemShares([line('a', 1, 3), line('b', 2, 3)], 1)).toEqual([
      { id: 'a', amount: 0.33, sharedWith: 3 },
      { id: 'b', amount: 0.67, sharedWith: 3 },
    ]);
  });

  it('breaks a remainder tie by line order, so the output is deterministic', () => {
    const shares = allocateItemShares([line('a', 1, 3), line('b', 1, 3), line('c', 1, 3)], 1);
    expect(shares.map((s: { amount: number }) => s.amount)).toEqual([0.34, 0.33, 0.33]);
    expect(totalOf(shares)).toBe(100);
  });

  it('leaves the lines alone when the shortfall is too big to be rounding', () => {
    // A line the participant was charged for has since been soft-deleted, so
    // the guest page cannot show it. Flooring two lines can lose at most one
    // cent, so a 30.00 gap is missing data, not rounding — padding the two
    // survivors up would misstate what each of them cost.
    const shares = allocateItemShares([line('a', 10), line('b', 10)], 50);
    expect(shares.map((s: { amount: number }) => s.amount)).toEqual([10, 10]);
  });

  it('returns nothing for no lines', () => {
    expect(allocateItemShares([], 12.34)).toEqual([]);
  });

  it('treats a non-positive claimant count as a single claimant', () => {
    // Defensive: the count comes from a DB read, and a line this participant
    // claims always has at least one claimant — them.
    expect(allocateItemShares([line('i1', 10, 0)], 10)).toEqual([{ id: 'i1', amount: 10, sharedWith: 1 }]);
  });
});
