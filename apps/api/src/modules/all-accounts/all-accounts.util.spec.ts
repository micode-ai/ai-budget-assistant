import { catalogName } from '../../common/utils/category-catalog';
import { normalizeCategoryName } from '../../common/utils/category-key.util';
import type { LedgerRow } from './all-accounts.types';
import { aggregateLedger, mergedCategory, monthsBetween, previousPeriod } from './all-accounts.util';

const base = { systemKey: null, nameCustomized: false, type: 'expense' as const, parent: null };
const opts = { language: 'pt', namesReadable: true };

describe('mergedCategory', () => {
  it('rolls up to the parent', () => {
    const r = mergedCategory(
      { ...base, name: 'Sub', parent: { name: 'Obras', systemKey: null, nameCustomized: true, type: 'expense' } },
      opts,
    );
    expect(r.key).toBe('expense:obras');
  });
  it('customized and keyless names share a key', () => {
    const a = mergedCategory({ ...base, name: 'Foo', systemKey: 'groceries', nameCustomized: true }, opts);
    const b = mergedCategory({ ...base, name: 'Obras ' }, opts);
    const c = mergedCategory({ ...base, name: 'obras', nameCustomized: true }, opts);
    expect(a.key).toBe('expense:foo');
    expect(b.key).toBe('expense:obras');
    expect(c.key).toBe('expense:obras');
  });
  it('uncustomized keyed uses the localized catalog name', () => {
    const name = catalogName('groceries', 'expense', 'pt') as string;
    const r = mergedCategory({ ...base, name: 'Groceries', systemKey: 'groceries' }, opts);
    expect(r).toEqual({ key: `expense:${normalizeCategoryName(name)}`, name, systemKey: 'groceries' });
  });
  it('unreadable names collapse to other, keyed ones still merge', () => {
    const o = { language: 'pt', namesReadable: false };
    expect(mergedCategory({ ...base, name: 'x', nameCustomized: true }, o)).toEqual({
      key: 'expense:__other',
      name: '',
      systemKey: null,
    });
    expect(mergedCategory({ ...base, name: 'x' }, o).key).toBe('expense:__other');
    expect(mergedCategory({ ...base, name: 'Groceries', systemKey: 'groceries' }, o).key).not.toBe('expense:__other');
  });
  it('null category is other', () => {
    expect(mergedCategory(null, opts).key).toBe('expense:__other');
  });
});

describe('periods', () => {
  it('monthsBetween', () => {
    expect(monthsBetween('2026-01-15', '2026-03-02')).toEqual(['2026-01', '2026-02', '2026-03']);
  });
  it('previousPeriod', () => {
    expect(previousPeriod('2026-11-01', '2026-11-30')).toEqual({ start: '2026-10-02', end: '2026-10-31' });
  });
});

describe('aggregateLedger', () => {
  const cat = (key: string) => ({ key, name: key, systemKey: null });
  const row = (o: Partial<LedgerRow>): LedgerRow => ({
    accountId: 'a',
    kind: 'expense',
    date: '2026-01-10',
    description: '',
    amount: 10,
    currencyCode: 'USD',
    amountBase: 10,
    category: cat('expense:x'),
    note: null,
    ...o,
  });
  it('sums, nets, sorts and zero-fills months', () => {
    const r = aggregateLedger(
      [
        row({ amountBase: 10 }),
        row({ accountId: 'b', amountBase: 30, category: cat('expense:y') }),
        row({ kind: 'income', amountBase: 100, category: cat('income:s') }),
      ],
      ['a', 'b'],
      '2026-01-01',
      '2026-03-31',
    );
    expect(r.totals).toEqual({ spent: 40, income: 100, net: 60 });
    expect(r.perAccount.a).toEqual({ spent: 10, income: 100, net: 90 });
    expect(r.expenseCategories.map((c) => c.key)).toEqual(['expense:y', 'expense:x']);
    expect(r.months.map((m) => m.month)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(r.months[1].perAccount).toEqual({ a: { spent: 0, income: 0 }, b: { spent: 0, income: 0 } });
  });
  it('ignores noted rows; null rate flags fx', () => {
    const r = aggregateLedger(
      [row({ note: 'planned' }), row({ note: 'internalTransfer' }), row({ amountBase: null })],
      ['a'],
      '2026-01-01',
      '2026-01-31',
    );
    expect(r.totals).toEqual({ spent: 0, income: 0, net: 0 });
    expect(r.fxApproximate).toBe(true);
    expect(
      aggregateLedger([row({ note: 'splitReceivable' })], ['a'], '2026-01-01', '2026-01-31').fxApproximate,
    ).toBe(false);
  });
});
