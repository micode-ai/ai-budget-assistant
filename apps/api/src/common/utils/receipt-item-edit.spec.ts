import {
  parseItemEditCommand,
  applyItemEditCommand,
  recomputeSplits,
  seedItemGroups,
  type EditableItem,
} from './receipt-item-edit';

function items(): EditableItem[] {
  return [
    { description: 'Bread', quantity: 1, unitPrice: 5.99, totalPrice: 5.99, canonicalName: 'Bread' },
    { description: 'Milk', quantity: 2, unitPrice: 3.99, totalPrice: 7.98, canonicalName: 'Milk 1L' },
    { description: 'Beer', quantity: 1, unitPrice: 4.69, totalPrice: 4.69, categoryId: 'cat-beer' },
  ];
}

describe('parseItemEditCommand', () => {
  it('reads a price correction with a comma decimal', () => {
    expect(parseItemEditCommand('3 = 14,69')).toEqual({ kind: 'setPrice', index: 3, amount: 14.69 });
  });

  it('reads a price correction with a dot decimal', () => {
    expect(parseItemEditCommand('3 = 14.69')).toEqual({ kind: 'setPrice', index: 3, amount: 14.69 });
  });

  it('reads a rename', () => {
    expect(parseItemEditCommand('2: Rye bread')).toEqual({
      kind: 'rename',
      index: 2,
      description: 'Rye bread',
    });
  });

  it('reads a removal, with or without a space before the dash', () => {
    expect(parseItemEditCommand('4 -')).toEqual({ kind: 'remove', index: 4 });
    expect(parseItemEditCommand('4-')).toEqual({ kind: 'remove', index: 4 });
  });

  it('reads an added line', () => {
    expect(parseItemEditCommand('+ Bread 5,99')).toEqual({
      kind: 'add',
      description: 'Bread',
      amount: 5.99,
    });
  });

  it('keeps digits that belong to the product name out of the added price', () => {
    // A real receipt line: only the trailing number is the price.
    expect(parseItemEditCommand('+ Milk 3,2% 1L 5,99')).toEqual({
      kind: 'add',
      description: 'Milk 3,2% 1L',
      amount: 5.99,
    });
  });

  it('reads a receipt-total correction from the bare equals form', () => {
    expect(parseItemEditCommand('= 233,98')).toEqual({ kind: 'setTotal', amount: 233.98 });
  });

  it('reads a receipt-total correction from the total keyword', () => {
    expect(parseItemEditCommand('total = 233,98')).toEqual({ kind: 'setTotal', amount: 233.98 });
  });

  it('returns null for text that is not a command', () => {
    expect(parseItemEditCommand('what is this')).toBeNull();
    expect(parseItemEditCommand('')).toBeNull();
  });

  it('returns null for a negative price rather than reading it as a removal', () => {
    expect(parseItemEditCommand('3 = -5')).toBeNull();
  });

  it('accepts zero as syntax and leaves rejecting it to the applier', () => {
    // Syntax and semantics are split so the applier owns every money rule.
    expect(parseItemEditCommand('3 = 0')).toEqual({ kind: 'setPrice', index: 3, amount: 0 });
  });
});

describe('applyItemEditCommand', () => {
  it('sets the line total and recomputes the unit price from the quantity', () => {
    // A stale unitPrice is what feeds the Personal Inflation Index, so it must
    // never survive a price correction.
    const out = applyItemEditCommand(items(), 18.66, { kind: 'setPrice', index: 2, amount: 14.69 });

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.items[1].totalPrice).toBe(14.69);
    expect(out.items[1].unitPrice).toBe(7.35);
    expect(out.total).toBe(18.66);
  });

  it('rejects a line number that is not on the receipt', () => {
    expect(applyItemEditCommand(items(), 18.66, { kind: 'setPrice', index: 9, amount: 1 })).toEqual({
      ok: false,
      error: 'no_such_line',
    });
    expect(applyItemEditCommand(items(), 18.66, { kind: 'setPrice', index: 0, amount: 1 })).toEqual({
      ok: false,
      error: 'no_such_line',
    });
  });

  it('rejects a non-positive price', () => {
    expect(applyItemEditCommand(items(), 18.66, { kind: 'setPrice', index: 1, amount: 0 })).toEqual({
      ok: false,
      error: 'invalid_amount',
    });
  });

  it('renames a line, trims it, and drops the now-wrong canonical name', () => {
    // canonicalName is what price history matches on; keeping the old one after a
    // rename would file the corrected line under the wrong product.
    const out = applyItemEditCommand(items(), 18.66, {
      kind: 'rename',
      index: 2,
      description: '  Rye bread  ',
    });

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.items[1].description).toBe('Rye bread');
    expect(out.items[1].canonicalName).toBeUndefined();
  });

  it('rejects a rename to an empty description', () => {
    expect(
      applyItemEditCommand(items(), 18.66, { kind: 'rename', index: 1, description: '   ' }),
    ).toEqual({ ok: false, error: 'empty_description' });
  });

  it('removes a line and keeps the remaining ones in order', () => {
    const out = applyItemEditCommand(items(), 18.66, { kind: 'remove', index: 2 });

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.items.map((i) => i.description)).toEqual(['Bread', 'Beer']);
  });

  it('allows removing the last remaining line', () => {
    // An expense with no line items is legal — every manually-typed one has none.
    const out = applyItemEditCommand([items()[0]], 5.99, { kind: 'remove', index: 1 });

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.items).toEqual([]);
  });

  it('appends an added line with quantity 1 and no canonical name', () => {
    const out = applyItemEditCommand(items(), 18.66, {
      kind: 'add',
      description: 'Eggs',
      amount: 12.5,
    });

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.items).toHaveLength(4);
    expect(out.items[3]).toEqual({
      description: 'Eggs',
      quantity: 1,
      unitPrice: 12.5,
      totalPrice: 12.5,
    });
  });

  it('rejects an added line with a non-positive price', () => {
    expect(
      applyItemEditCommand(items(), 18.66, { kind: 'add', description: 'Eggs', amount: 0 }),
    ).toEqual({ ok: false, error: 'invalid_amount' });
  });

  it('changes the receipt total without touching the lines', () => {
    const before = items();
    const out = applyItemEditCommand(before, 18.66, { kind: 'setTotal', amount: 233.98 });

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.total).toBe(233.98);
    expect(out.items).toEqual(before);
  });

  it('never mutates the array it was given', () => {
    const before = items();
    applyItemEditCommand(before, 18.66, { kind: 'setPrice', index: 1, amount: 99 });

    expect(before[0].totalPrice).toBe(5.99);
  });
});

describe('recomputeSplits', () => {
  const existing = [
    { categoryId: 'cat-food', categoryName: 'Food', amount: 5.99, percentage: 50, itemIndexes: [0] },
    { categoryId: 'cat-beer', categoryName: 'Beer', amount: 6.0, percentage: 50, itemIndexes: [1] },
  ];
  const edited: EditableItem[] = [
    { description: 'Bread', totalPrice: 5.99, categoryId: 'cat-food' },
    { description: 'Beer', totalPrice: 14.69, categoryId: 'cat-beer' },
  ];

  it('rebuilds the amounts from the corrected line prices', () => {
    const splits = recomputeSplits({ items: edited, total: 20.68, existing });

    expect(splits.find((s) => s.categoryId === 'cat-beer')?.amount).toBe(14.69);
    expect(splits.find((s) => s.categoryId === 'cat-food')?.amount).toBe(5.99);
  });

  it('keeps the deposit as its own group instead of dissolving it into the lines', () => {
    // The deposit is an exact printed figure with no line behind it (ABA-440), so
    // it is recognised by having no item indexes and re-appended untouched.
    const withDeposit = [
      ...existing,
      { categoryId: 'cat-deposit', categoryName: 'Kaucja', amount: 4.5, percentage: 0, itemIndexes: [] },
    ];

    const splits = recomputeSplits({
      items: edited,
      total: 25.18,
      deposit: 4.5,
      existing: withDeposit,
    });

    expect(splits.find((s) => s.categoryId === 'cat-deposit')?.amount).toBe(4.5);
  });

  it('returns no splits once every line has been deleted', () => {
    expect(recomputeSplits({ items: [], total: 20.68, existing })).toEqual([]);
  });
});

describe('seedItemGroups', () => {
  // The scan's item→category mapping for a PROPOSED category lives only in the
  // split's itemIndexes (its categoryId is null until the user confirms). Indexes
  // shift the moment a line is deleted, so the mapping is landed on the items once,
  // on entering edit mode, and every later edit stays index-shift-safe.
  const items: EditableItem[] = [
    { description: 'Bread', totalPrice: 5.99 },
    { description: 'Bottle deposit', totalPrice: 4.5 },
  ];

  it('copies a real category id and name onto the line it covers', () => {
    const seeded = seedItemGroups(items, [
      { categoryId: 'cat-food', categoryName: 'Food', amount: 5.99, percentage: 100, itemIndexes: [0] },
    ]);

    expect(seeded[0].categoryId).toBe('cat-food');
    expect(seeded[0].categoryName).toBe('Food');
  });

  it('keeps a proposed category as a name with no id', () => {
    const seeded = seedItemGroups(items, [
      { categoryId: null, categoryName: 'Kaucja', amount: 4.5, percentage: 100, itemIndexes: [1] },
    ]);

    expect(seeded[1].categoryId).toBeNull();
    expect(seeded[1].categoryName).toBe('Kaucja');
  });

  it('leaves a line the scan never grouped untouched', () => {
    const seeded = seedItemGroups(items, []);

    expect(seeded[0].categoryName).toBeUndefined();
  });
});

describe('recomputeSplits with a proposed category', () => {
  it('re-emits a proposed group with no id, so confirming still creates it by name', () => {
    // Losing the null would make resolveProposedSplits treat the sentinel as a real
    // category id — the ABA-451 failure mode.
    const seeded: EditableItem[] = [
      { description: 'Bread', totalPrice: 5.99, categoryId: 'cat-food', categoryName: 'Food' },
      { description: 'Beer', totalPrice: 14.69, categoryId: null, categoryName: 'Alcohol' },
    ];

    const splits = recomputeSplits({
      items: seeded,
      total: 20.68,
      existing: [
        { categoryId: 'cat-food', categoryName: 'Food', amount: 5.99, percentage: 50, itemIndexes: [0] },
        { categoryId: null, categoryName: 'Alcohol', amount: 6, percentage: 50, itemIndexes: [1] },
      ],
    });

    const alcohol = splits.find((s) => s.categoryName === 'Alcohol');
    expect(alcohol?.categoryId).toBeNull();
    expect(alcohol?.amount).toBe(14.69);
  });
});
