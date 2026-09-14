import { matchReceiptToShoppingList, buildProductAliasMap } from '../receiptReconciliation';
import type { ProductListItem } from '@budget/shared-types';

function item(id: string, rawLabel: string, canonicalName: string | null = null, isChecked = false) {
  return { id, rawLabel, canonicalName, isChecked };
}

describe('matchReceiptToShoppingList', () => {
  it('matches by exact canonical name after normalization', () => {
    const candidates = [item('1', 'Milk', 'Mleko Łaciate 3,2% 1L')];
    const receiptLines = [{ description: 'MLEKO 3,2% LACIATE 1L', canonicalName: 'Mleko Laciate 3,2% 1L' }];

    const matched = matchReceiptToShoppingList(candidates, receiptLines);

    expect(matched.map((m) => m.id)).toEqual(['1']);
  });

  it('falls back to rawLabel when the shopping-list item has no canonicalName', () => {
    const candidates = [item('1', 'Piwo Carlsberg 0,5l')];
    const receiptLines = [{ description: 'PIWO CARLSBERG 0,5L', canonicalName: null }];

    const matched = matchReceiptToShoppingList(candidates, receiptLines);

    expect(matched.map((m) => m.id)).toEqual(['1']);
  });

  it('falls back to the receipt line description when it has no canonicalName', () => {
    const candidates = [item('1', 'Bread', 'Chleb Zytni 500g')];
    const receiptLines = [{ description: 'Chleb Zytni 500g' }];

    const matched = matchReceiptToShoppingList(candidates, receiptLines);

    expect(matched.map((m) => m.id)).toEqual(['1']);
  });

  it('never matches an item that is already checked', () => {
    const candidates = [item('1', 'Milk', 'Mleko Laciate 1L', true)];
    const receiptLines = [{ description: 'Mleko Laciate 1L' }];

    expect(matchReceiptToShoppingList(candidates, receiptLines)).toEqual([]);
  });

  it('does not fuzzy-match a free-text label against an unrelated product name', () => {
    const candidates = [item('1', 'Milk')];
    const receiptLines = [{ description: 'Mleko Laciate 3,2% 1L', canonicalName: 'Mleko Laciate 3,2% 1L' }];

    // "Milk" normalizes to "milk", the receipt line to "mlekolaciate3213l" — no
    // overlap, so this is the documented limitation, not a bug.
    expect(matchReceiptToShoppingList(candidates, receiptLines)).toEqual([]);
  });

  it('matches several items from one receipt and ignores unmatched ones', () => {
    const candidates = [
      item('1', 'Milk', 'Mleko Laciate 1L'),
      item('2', 'Eggs', 'Jajka M 10szt'),
      item('3', 'Toothpaste', 'Pasta Colgate 75ml'),
    ];
    const receiptLines = [
      { description: 'MLEKO LACIATE 1L', canonicalName: 'Mleko Laciate 1L' },
      { description: 'JAJKA M 10SZT', canonicalName: 'Jajka M 10szt' },
      { description: 'CHLEB ZYTNI 500G', canonicalName: 'Chleb Zytni 500g' },
    ];

    const matched = matchReceiptToShoppingList(candidates, receiptLines);

    expect(matched.map((m) => m.id).sort()).toEqual(['1', '2']);
  });

  it('returns an empty array when the receipt has no usable line items', () => {
    const candidates = [item('1', 'Milk')];

    expect(matchReceiptToShoppingList(candidates, [])).toEqual([]);
    expect(matchReceiptToShoppingList(candidates, [{ description: '' }])).toEqual([]);
  });

  it('returns an empty array when nothing on the shopping list is unchecked', () => {
    const candidates = [item('1', 'Milk', 'Mleko Laciate 1L', true)];
    const receiptLines = [{ description: 'Mleko Laciate 1L' }];

    expect(matchReceiptToShoppingList(candidates, receiptLines)).toEqual([]);
  });

  // shopping-list-alias-aware-reconciliation
  it('resolves a receipt line through the alias map before matching', () => {
    const candidates = [item('1', 'Milk', 'Mleko Laciate')];
    // OCR still reads the OLD, pre-rename raw name on a fresh scan.
    const receiptLines = [{ description: 'MLEKO LACIATE 3,2% 1L', canonicalName: 'MLEKO LACIATE 3,2% 1L' }];
    const aliasMap = new Map([['MLEKO LACIATE 3,2% 1L', 'Mleko Laciate']]);

    expect(matchReceiptToShoppingList(candidates, receiptLines, aliasMap)).toHaveLength(1);
  });

  it('without an alias map, the same renamed product does NOT match (documents the limitation)', () => {
    const candidates = [item('1', 'Milk', 'Mleko Laciate')];
    const receiptLines = [{ description: 'MLEKO LACIATE 3,2% 1L', canonicalName: 'MLEKO LACIATE 3,2% 1L' }];

    expect(matchReceiptToShoppingList(candidates, receiptLines)).toEqual([]);
  });

  it('a raw canonical name with no entry in the alias map falls back unchanged', () => {
    const candidates = [item('1', 'Bread', 'Chleb Zytni 500g')];
    const receiptLines = [{ description: 'Chleb Zytni 500g', canonicalName: 'Chleb Zytni 500g' }];
    const aliasMap = new Map([['Some Other Product', 'Something Else']]);

    expect(matchReceiptToShoppingList(candidates, receiptLines, aliasMap)).toHaveLength(1);
  });
});

describe('buildProductAliasMap', () => {
  function product(overrides: Partial<ProductListItem> = {}): ProductListItem {
    return {
      rawName: 'raw',
      rawNames: ['raw'],
      canonicalName: 'raw',
      purchaseCount: 1,
      lastSeen: '2026-09-01',
      ...overrides,
    };
  }

  it('maps every rawName of every product to its resolved canonicalName', () => {
    const products = [
      product({ rawNames: ['MLEKO LACIATE 3,2% 1L', 'Mleko Laciate'], canonicalName: 'Mleko Laciate' }),
      product({ rawNames: ['Chleb Zytni 500g'], canonicalName: 'Chleb Zytni 500g' }),
    ];

    const map = buildProductAliasMap(products);

    expect(map.get('MLEKO LACIATE 3,2% 1L')).toBe('Mleko Laciate');
    expect(map.get('Mleko Laciate')).toBe('Mleko Laciate');
    expect(map.get('Chleb Zytni 500g')).toBe('Chleb Zytni 500g');
    expect(map.get('Something Unrelated')).toBeUndefined();
  });

  it('returns an empty map for an empty product list', () => {
    expect(buildProductAliasMap([]).size).toBe(0);
  });
});
