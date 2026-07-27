import { deriveSplitMode } from '../deriveSplitMode';
import type { ExpenseItem } from '@budget/shared-types';

function item(over: Partial<ExpenseItem> = {}): ExpenseItem {
  return {
    id: 'i1',
    localId: 'i1',
    expenseId: 'e1',
    description: 'Beer',
    quantity: 1,
    unitPrice: 10,
    totalPrice: 10,
    sortOrder: 0,
    isDeleted: false,
    syncStatus: 'synced',
    syncVersion: 0,
    createdAt: new Date('2026-07-01'),
    updatedAt: new Date('2026-07-01'),
    ...over,
  };
}

describe('deriveSplitMode', () => {
  it('falls back to equal split when the receipt genuinely has no line items', () => {
    expect(deriveSplitMode([])).toEqual({ mode: 'equal', hasUnsyncedItems: false });
  });

  it('enables item-level assignment once every item is server-synced', () => {
    const result = deriveSplitMode([item(), item({ id: 'i2' })]);
    expect(result).toEqual({ mode: 'items', hasUnsyncedItems: false });
  });

  it('degrades to a whole-bill equal split — not a failed request — when items exist but have not synced', () => {
    // A just-scanned receipt: the item is cached locally under a client-generated
    // id the server never learned. Submitting that id as an itemId would 400.
    const result = deriveSplitMode([item({ syncStatus: 'pending' })]);
    expect(result).toEqual({ mode: 'equal', hasUnsyncedItems: true });
  });

  it('degrades to equal when only SOME items are synced — never a partial, half-trustworthy mix', () => {
    const result = deriveSplitMode([
      item({ id: 'i1', syncStatus: 'synced' }),
      item({ id: 'i2', syncStatus: 'pending' }),
    ]);
    expect(result).toEqual({ mode: 'equal', hasUnsyncedItems: true });
  });
});
