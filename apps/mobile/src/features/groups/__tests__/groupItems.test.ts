import {
  assignmentsFromView,
  buildDiscountValue,
  buildItemInputs,
  buildManagedClaims,
  claimWindow,
  draftsFromView,
  expenseRowTarget,
  isClaimShareInvalid,
  isClaimsBusy,
  isClaimsClosed,
  isItemsInvalid,
  itemNet,
  lineNet,
  linesFromScan,
  linesTotal,
  myClaimedIds,
  previewMyParts,
  sameIdSet,
  toggleId,
  validateItemDrafts,
  validateItemizedForm,
  type ItemLineDraft,
} from '../groupItems';
import type { GroupExpenseItemView } from '@budget/shared-types';

/** ABA-656: the app's mirror of the server's line rules, the scan mapping and the claim previews. */

const line = (name: string, priceText: string, discountText = '', id?: string): ItemLineDraft => ({
  key: `${name}-${priceText}`,
  ...(id ? { id } : {}),
  name,
  priceText,
  discountText,
});

const item = (
  id: string,
  totalPrice: number,
  claims: { memberId: string; shareBp: number | null }[] = [],
  lineDiscount: number | null = null,
  position = 0,
): GroupExpenseItemView => ({ id, name: id, totalPrice, lineDiscount, position, claims, myPart: 0 });

describe('lineNet / linesTotal', () => {
  it('subtracts the line discount and the receipt discount', () => {
    expect(lineNet(line('a', '10', '2.5'))).toBe(7.5);
    expect(linesTotal([line('a', '10', '2.5'), line('b', '4,50')], '2')).toBe(10);
  });

  it('reads unparseable text as zero', () => {
    expect(lineNet(line('a', 'x'))).toBe(0);
    expect(linesTotal([], '')).toBe(0);
  });
});

describe('validateItemDrafts (mirror of the server validateItemLines)', () => {
  it('accepts lines that fit inside what was paid, a deposit staying with the payer', () => {
    expect(validateItemDrafts([line('a', '10'), line('b', '5', '1')], '', 20)).toBeNull();
    expect(validateItemDrafts([line('a', '10'), line('b', '5', '1')], '', 14)).toBeNull();
  });

  it('refuses no lines and more than 100', () => {
    expect(validateItemDrafts([], '', 10)).toBe('itemsEmpty');
    const many = Array.from({ length: 101 }, (_, i) => line(`l${i}`, '0.01'));
    expect(validateItemDrafts(many, '', 100)).toBe('itemsTooMany');
  });

  it('needs a name and a price on every line', () => {
    expect(validateItemDrafts([line('  ', '1')], '', 10)).toBe('itemName');
    expect(validateItemDrafts([line('x'.repeat(121), '1')], '', 10)).toBe('itemName');
    expect(validateItemDrafts([line('a', '')], '', 10)).toBe('itemPrice');
    expect(validateItemDrafts([line('a', '-1')], '', 10)).toBe('itemPrice');
    expect(validateItemDrafts([line('a', '1.234')], '', 10)).toBe('itemPrice');
  });

  it('caps a line discount at its line', () => {
    expect(validateItemDrafts([line('a', '5', '5')], '', 10)).toBeNull();
    expect(validateItemDrafts([line('a', '5', '5.01')], '', 10)).toBe('itemLineDiscount');
  });

  it('keeps a receipt discount strictly below the lines net', () => {
    expect(validateItemDrafts([line('a', '10')], '9.99', 10)).toBeNull();
    expect(validateItemDrafts([line('a', '10')], '10', 10)).toBe('itemDiscount');
    expect(validateItemDrafts([line('a', '10')], 'abc', 10)).toBe('itemDiscount');
  });

  it('refuses lines that add up to more than the amount', () => {
    expect(validateItemDrafts([line('a', '10'), line('b', '5')], '', 14.99)).toBe('itemsExceedAmount');
    // The receipt discount brings them back inside.
    expect(validateItemDrafts([line('a', '10'), line('b', '5')], '0.01', 14.99)).toBeNull();
  });
});

describe('validateItemizedForm', () => {
  const base = { description: 'Lidl', amount: 20, paidByMemberId: 'm1', lines: [line('a', '10')], discountText: '' };
  it('checks description, amount and payer before the lines', () => {
    expect(validateItemizedForm({ ...base, description: ' ' }).issue).toBe('description');
    expect(validateItemizedForm({ ...base, amount: 0 }).issue).toBe('amount');
    expect(validateItemizedForm({ ...base, paidByMemberId: null }).issue).toBe('payer');
    expect(validateItemizedForm({ ...base, lines: [] }).issue).toBe('itemsEmpty');
    expect(validateItemizedForm(base)).toEqual({ ok: true, issue: null });
  });
});

describe('buildItemInputs / buildDiscountValue', () => {
  it('sends trimmed names, numbers, an id only for a kept line, and no zero line discount', () => {
    expect(buildItemInputs([line(' Milk ', '3,49', '0.5', 'id-1'), line('Bread', '2', '')])).toEqual([
      { id: 'id-1', name: 'Milk', totalPrice: 3.49, lineDiscount: 0.5 },
      { name: 'Bread', totalPrice: 2 },
    ]);
  });

  it('omits an empty discount on create and clears it with null on an edit', () => {
    expect(buildDiscountValue('', false)).toBeUndefined();
    expect(buildDiscountValue('', true)).toBeNull();
    expect(buildDiscountValue('1,5', true)).toBe(1.5);
  });
});

describe('draftsFromView', () => {
  it('restores the stored lines in position order with their ids', () => {
    const drafts = draftsFromView([item('b', 2, [], null, 1), item('a', 5, [], 1, 0)]);
    expect(drafts.map((d) => [d.id, d.priceText, d.discountText])).toEqual([
      ['a', '5', '1'],
      ['b', '2', ''],
    ]);
  });
});

describe('linesFromScan', () => {
  const key = (i: number) => `k${i}`;
  it('maps lines, trims names and keeps the receipt discount', () => {
    const r = linesFromScan([{ description: ' Milk ', totalPrice: 3.49 }, { description: 'Bread', totalPrice: 2 }], 1, key);
    expect(r.lines.map((l) => [l.key, l.name, l.priceText, l.discountText])).toEqual([
      ['k0', 'Milk', '3.49', ''],
      ['k1', 'Bread', '2', ''],
    ]);
    expect(r.discountText).toBe('1');
  });

  it('folds a negative line into the line above, the overflow into the receipt discount', () => {
    const r = linesFromScan(
      [
        { description: 'Beer', totalPrice: 5 },
        { description: 'OPUST', totalPrice: -1.5 },
        { description: 'Chips', totalPrice: 2 },
        { description: 'OPUST', totalPrice: -3 },
      ],
      null,
      key,
    );
    expect(r.lines.map((l) => [l.name, l.discountText])).toEqual([
      ['Beer', '1.5'],
      ['Chips', '2'],
    ]);
    expect(r.discountText).toBe('1');
  });

  it('sends a leading negative line to the receipt discount and drops zero lines', () => {
    const r = linesFromScan([{ description: 'Coupon', totalPrice: -2 }, { description: 'Zero', totalPrice: 0 }, { description: 'Tea', totalPrice: 4 }], 0, key);
    expect(r.lines).toHaveLength(1);
    expect(r.discountText).toBe('2');
  });

  it('keeps at most 100 lines and 120-character names', () => {
    const r = linesFromScan(Array.from({ length: 120 }, () => ({ description: 'x'.repeat(200), totalPrice: 1 })), null, key);
    expect(r.lines).toHaveLength(100);
    expect(r.lines[0].name).toHaveLength(120);
  });
});

describe('claimWindow / expenseRowTarget', () => {
  const now = new Date('2026-10-09T12:00:00Z');
  it('is open with whole days left, rounded up', () => {
    const w = claimWindow({ itemized: true, claimsOpenUntil: '2026-10-16T11:00:00Z' }, now);
    expect(w.open).toBe(true);
    expect(w.daysLeft).toBe(7);
    expect(claimWindow({ itemized: true, claimsOpenUntil: '2026-10-09T13:00:00Z' }, now).daysLeft).toBe(1);
  });

  it('is closed after the end and for a plain expense', () => {
    expect(claimWindow({ itemized: true, claimsOpenUntil: '2026-10-09T12:00:00Z' }, now)).toMatchObject({ open: false, daysLeft: 0 });
    expect(claimWindow({ itemized: false, claimsOpenUntil: null }, now)).toEqual({ itemized: false, open: false, until: null, daysLeft: 0 });
  });

  it('opens the claims of an itemised row for anyone, the editor only for a modifier', () => {
    expect(expenseRowTarget({ itemized: true, deletedAt: null }, false, false)).toBe('claims');
    expect(expenseRowTarget({ itemized: false, deletedAt: null }, true, true)).toBe('edit');
    expect(expenseRowTarget({ itemized: false, deletedAt: null }, false, true)).toBeNull();
    expect(expenseRowTarget({ itemized: true, deletedAt: '2026-10-01' }, true, true)).toBeNull();
  });
});

describe('my lines', () => {
  const view = {
    discountAmount: null,
    items: [
      item('bread', 4, [{ memberId: 'me', shareBp: null }]),
      item('wine', 30, [
        { memberId: 'ann', shareBp: 6000 },
        { memberId: 'me', shareBp: 4000 },
      ]),
      item('cheese', 9, [{ memberId: 'ann', shareBp: null }, { memberId: 'bob', shareBp: null }]),
      item('gum', 2),
    ],
  };

  it('reads my claimed lines, toggles one, compares sets', () => {
    expect(myClaimedIds(view, 'me')).toEqual(['bread', 'wine']);
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b']);
    expect(sameIdSet(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameIdSet(['a'], ['a', 'b'])).toBe(false);
  });

  it('previews my part: equal slices with the newcomer counted, my explicit share on a hand-split line', () => {
    const p = previewMyParts(view, 'me', ['bread', 'wine', 'cheese']);
    expect(p.parts).toEqual({ bread: 4, wine: 12, cheese: 3 });
    expect(p.total).toBe(19);
  });

  it('gives nothing on a hand-split line I have no share of, and scales by the receipt discount', () => {
    expect(previewMyParts(view, 'bob', ['wine']).total).toBe(0);
    // Lines net 45, discount 4.5 -> factor 0.9.
    const p = previewMyParts({ ...view, discountAmount: 4.5 }, 'me', ['bread']);
    expect(p.parts.bread).toBe(3.6);
    expect(p.total).toBe(3.6);
  });

  it('respects a line discount', () => {
    expect(previewMyParts({ discountAmount: null, items: [item('x', 10, [], 2)] }, 'me', ['x']).total).toBe(8);
    expect(itemNet({ totalPrice: 10, lineDiscount: 2 })).toBe(8);
  });
});

describe('managed claims', () => {
  const view = {
    items: [
      item('bread', 4, [{ memberId: 'me', shareBp: null }]),
      item('wine', 30, [
        { memberId: 'ann', shareBp: 6000 },
        { memberId: 'me', shareBp: 4000 },
      ]),
      item('gum', 2),
    ],
  };

  it('seeds assignments and only the hand-split shares', () => {
    const { assignments, shares } = assignmentsFromView(view);
    expect(assignments).toEqual({ bread: ['me'], wine: ['ann', 'me'] });
    expect(shares).toEqual({ wine: { ann: 6000, me: 4000 } });
  });

  it('builds one entry per member with the full line set and full share map', () => {
    const { assignments, shares } = assignmentsFromView(view);
    expect(buildManagedClaims(['me', 'ann', 'bob'], assignments, shares)).toEqual([
      { memberId: 'me', itemIds: ['bread', 'wine'], shareBp: { wine: 4000 } },
      { memberId: 'ann', itemIds: ['wine'], shareBp: { wine: 6000 } },
      { memberId: 'bob', itemIds: [], shareBp: {} },
    ]);
  });

  it('sends 0 for a claimant added to a hand-split line without a share', () => {
    const out = buildManagedClaims(['bob'], { wine: ['ann', 'bob'] }, { wine: { ann: 6000 } });
    expect(out[0].shareBp).toEqual({ wine: 0 });
  });
});

describe('error predicates', () => {
  it('recognise the claim and item codes', () => {
    expect(isItemsInvalid({ status: 400, code: 'ITEMS_INVALID' })).toBe(true);
    expect(isClaimsClosed({ status: 409, code: 'CLAIMS_CLOSED' })).toBe(true);
    expect(isClaimShareInvalid({ status: 400, code: 'CLAIM_SHARE_INVALID' })).toBe(true);
    expect(isClaimsClosed({ status: 400, code: 'CLAIMS_CLOSED' })).toBe(false);
    expect(isClaimsBusy({ status: 429, code: 'CLAIMS_BUSY' })).toBe(true);
    expect(isClaimsBusy({ status: 429 })).toBe(false);
    expect(isItemsInvalid(null)).toBe(false);
  });
});
