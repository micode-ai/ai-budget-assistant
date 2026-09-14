import { resolveItemSplit, resolveEqualSplit, allocateItemShares, reassignSplitItem } from './split-calculator';

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

describe('resolveItemSplit — receipt-wide discount (ABA-549)', () => {
  // The real production split that exposed this: Lidl, 5 lines summing to
  // 74.88 gross, a 19.96 Lidl Plus discount, 54.92 actually paid. One
  // participant claimed the two chicken lines (13.25 + 15.99 = 29.24 gross).
  const lidl = [
    item('beer-heineken', 28.74),
    item('beer-gosciniec', 13.98),
    item('chicken-legs', 13.25),
    item('chicken-halves', 15.99),
    item('bags', 2.92),
  ];

  it('charges a proportional share of what was PAID, not the gross line prices', () => {
    const out = resolveItemSplit(
      lidl,
      [{ participantId: 'edik', itemIds: ['chicken-legs', 'chicken-halves'] }],
      54.92,
      19.96,
    );
    // 29.24 gross / 74.88 lines = 39.05% of the basket; 39.05% of 54.92 paid
    // is 21.4458, floored to 21.44 — shares round DOWN in this module so they
    // can never exceed the bill, and the spare cent lands on the payer.
    expect(out.shares).toEqual([{ participantId: 'edik', amount: 21.44 }]);
    // The payer keeps the rest of what they actually paid, no longer absorbing
    // the entire discount on their own (it was 25.68 before this fix).
    expect(out.ownShare).toBe(33.48);
  });

  it('leaves the shares untouched when there is no discount', () => {
    const undiscounted = resolveItemSplit(
      lidl,
      [{ participantId: 'edik', itemIds: ['chicken-legs', 'chicken-halves'] }],
      74.88,
    );
    expect(undiscounted.shares).toEqual([{ participantId: 'edik', amount: 29.24 }]);
  });

  it('still divides a shared line equally after discounting it', () => {
    const out = resolveItemSplit(
      [item('wine', 60), item('bread', 40)],
      [
        { participantId: 'p1', itemIds: ['wine'] },
        { participantId: 'p2', itemIds: ['wine'] },
      ],
      80,
      20,
    );
    // wine is 60 gross -> 30 each; the basket was discounted 20%, so 24 each.
    expect(out.shares).toEqual([
      { participantId: 'p1', amount: 24 },
      { participantId: 'p2', amount: 24 },
    ]);
  });

  it('never lets the shares exceed what was paid', () => {
    const out = resolveItemSplit(
      lidl,
      [{ participantId: 'p1', itemIds: lidl.map((i) => i.id) }],
      54.92,
      19.96,
    );
    const sum = out.shares.reduce((acc, sh) => acc + sh.amount, 0);
    expect(sum).toBeLessThanOrEqual(54.92);
    expect(out.ownShare).toBeGreaterThanOrEqual(0);
  });

  it('ignores nonsense discount data rather than zeroing everyone out', () => {
    // A discount at or above the line sum cannot be real; scaling by it would
    // drive every share to zero and trip the caller's "positive share" guard,
    // so the amounts are deliberately left exactly as they were.
    const swallowed = resolveItemSplit(
      [item('i1', 30)],
      [{ participantId: 'p1', itemIds: ['i1'] }],
      30,
      30,
    );
    expect(swallowed.shares).toEqual([{ participantId: 'p1', amount: 30 }]);

    const negative = resolveItemSplit(
      [item('i1', 30)],
      [{ participantId: 'p1', itemIds: ['i1'] }],
      30,
      -5,
    );
    expect(negative.shares).toEqual([{ participantId: 'p1', amount: 30 }]);
  });

  it('carries the discount through an in-place reassignment (ABA-546 path)', () => {
    const { result } = reassignSplitItem(
      lidl,
      [{ participantId: 'edik', itemIds: ['chicken-legs'] }],
      'chicken-halves',
      ['edik'],
      54.92,
      19.96,
    );
    expect(result.shares).toEqual([{ participantId: 'edik', amount: 21.44 }]);
  });
});

describe('resolveItemSplit — explicit per-line shares (ABA-550)', () => {
  it('honours a hand-set share and leaves the rest of the line to the payer', () => {
    // The payer's own picture: "Половинки куриные 15.99 — Эдик 60%, я 40%".
    // The payer is never a participant row; their 40% simply is not claimed.
    const out = resolveItemSplit(
      [item('chicken', 15.99)],
      [{ participantId: 'edik', itemIds: ['chicken'], itemShareBp: { chicken: 6000 } }],
      15.99,
    );
    expect(out.shares).toEqual([{ participantId: 'edik', amount: 9.59 }]);
    expect(out.ownShare).toBe(6.4);
  });

  it('accepts a share entered as money by converting it to basis points upstream', () => {
    // 6.40 of 15.99 is 4002.5bp; the service rounds, so 4003 here. The point of
    // the assertion is that the money comes back out again.
    const out = resolveItemSplit(
      [item('chicken', 15.99)],
      [{ participantId: 'edik', itemIds: ['chicken'], itemShareBp: { chicken: 4003 } }],
      15.99,
    );
    expect(out.shares).toEqual([{ participantId: 'edik', amount: 6.4 }]);
  });

  it('splits three ways by hand, leaving the remainder to the payer', () => {
    const out = resolveItemSplit(
      [item('wine', 100)],
      [
        { participantId: 'edik', itemIds: ['wine'], itemShareBp: { wine: 4000 } },
        { participantId: 'olya', itemIds: ['wine'], itemShareBp: { wine: 3000 } },
      ],
      100,
    );
    expect(out.shares).toEqual([
      { participantId: 'edik', amount: 40 },
      { participantId: 'olya', amount: 30 },
    ]);
    expect(out.ownShare).toBe(30);
  });

  it('mixes a hand-split line and an equally-divided one on the same receipt', () => {
    const out = resolveItemSplit(
      [item('wine', 100), item('bread', 20)],
      [
        { participantId: 'p1', itemIds: ['wine', 'bread'], itemShareBp: { wine: 6000 } },
        { participantId: 'p2', itemIds: ['wine', 'bread'] },
      ],
      120,
    );
    // wine: hand-split, p1 60 / p2 nothing (40 stays with the payer)
    // bread: no explicit share anywhere on that line -> still equal, 10 each
    expect(out.shares).toEqual([
      { participantId: 'p1', amount: 70 },
      { participantId: 'p2', amount: 10 },
    ]);
    expect(out.ownShare).toBe(40);
  });

  it('leaves every pre-existing split untouched when no share is set', () => {
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

  it('composes with the receipt-wide discount', () => {
    // 60% of a 100 line is 60 gross; the basket was discounted 20%, so 48.
    const out = resolveItemSplit(
      [item('wine', 100)],
      [{ participantId: 'p1', itemIds: ['wine'], itemShareBp: { wine: 6000 } }],
      80,
      20,
    );
    expect(out.shares).toEqual([{ participantId: 'p1', amount: 48 }]);
  });

  it('cannot invent money from a nonsense share', () => {
    const over = resolveItemSplit(
      [item('i1', 10)],
      [{ participantId: 'p1', itemIds: ['i1'], itemShareBp: { i1: 99999 } }],
      10,
    );
    expect(over.shares).toEqual([{ participantId: 'p1', amount: 10 }]);
    expect(over.ownShare).toBe(0);

    const negative = resolveItemSplit(
      [item('i1', 10)],
      [{ participantId: 'p1', itemIds: ['i1'], itemShareBp: { i1: -500 } }],
      10,
    );
    expect(negative.shares).toEqual([{ participantId: 'p1', amount: 0 }]);
  });

  it('gives nothing to a claimant left without a share on a hand-split line', () => {
    const out = resolveItemSplit(
      [item('wine', 100)],
      [
        { participantId: 'p1', itemIds: ['wine'], itemShareBp: { wine: 7000 } },
        { participantId: 'p2', itemIds: ['wine'] },
      ],
      100,
    );
    expect(out.shares).toEqual([
      { participantId: 'p1', amount: 70 },
      { participantId: 'p2', amount: 0 },
    ]);
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

describe('reassignSplitItem', () => {
  it('replaces one item’s claimants and leaves every other item untouched', () => {
    const items = [item('bread', 10), item('wine', 60)];
    const current = [
      { participantId: 'p1', itemIds: ['bread'] },
      { participantId: 'p2', itemIds: ['wine'] },
    ];
    // p1 joins the wine, p2 keeps it too — bread stays exactly with p1.
    const { assignments, result } = reassignSplitItem(items, current, 'wine', ['p1', 'p2'], 70);

    expect(assignments).toEqual([
      { participantId: 'p1', itemIds: ['bread', 'wine'] },
      { participantId: 'p2', itemIds: ['wine'] },
    ]);
    expect(result.shares).toEqual([
      { participantId: 'p1', amount: 40 }, // 10 (bread) + 30 (half of wine)
      { participantId: 'p2', amount: 30 },
    ]);
    expect(result.ownShare).toBe(0);
  });

  it('reverts an item fully to the payer when the new claimant list is empty', () => {
    const items = [item('wine', 60)];
    const current = [{ participantId: 'p1', itemIds: ['wine'] }];
    const { assignments, result } = reassignSplitItem(items, current, 'wine', [], 60);

    expect(assignments).toEqual([{ participantId: 'p1', itemIds: [] }]);
    expect(result.shares).toEqual([{ participantId: 'p1', amount: 0 }]);
    expect(result.ownShare).toBe(60);
  });

  it('drops the target item from a participant not in the new claimant list, keeping their other claims', () => {
    const items = [item('bread', 10), item('wine', 60)];
    const current = [
      { participantId: 'p1', itemIds: ['bread', 'wine'] },
      { participantId: 'p2', itemIds: [] },
    ];
    // p1 is removed from the wine; p2 takes it over. p1's bread claim survives.
    const { assignments } = reassignSplitItem(items, current, 'wine', ['p2'], 70);

    expect(assignments).toEqual([
      { participantId: 'p1', itemIds: ['bread'] },
      { participantId: 'p2', itemIds: ['wine'] },
    ]);
  });

  it('is idempotent: reassigning to the same claimant list changes nothing', () => {
    const items = [item('wine', 60)];
    const current = [
      { participantId: 'p1', itemIds: ['wine'] },
      { participantId: 'p2', itemIds: ['wine'] },
    ];
    const { assignments } = reassignSplitItem(items, current, 'wine', ['p1', 'p2'], 60);
    expect(assignments).toEqual(current);
  });
});
