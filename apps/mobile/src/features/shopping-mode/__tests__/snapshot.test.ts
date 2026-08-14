import type { Expense, ShoppingListItem, SafeToSpendResponse } from '@budget/shared-types';
import { buildSessionSnapshot, MAX_SNAPSHOT_LABELS } from '../snapshot';

const expense = (merchant: string, lat: number, lng: number, source = 'ocr'): Expense =>
  ({
    id: `e-${merchant}-${lat}`,
    accountId: 'a1',
    amount: 10,
    currencyCode: 'PLN',
    date: '2026-08-14',
    source,
    merchant,
    location: { lat, lng },
  }) as unknown as Expense;

const item = (rawLabel: string, isChecked: boolean): ShoppingListItem =>
  ({ id: rawLabel, rawLabel, isChecked }) as unknown as ShoppingListItem;

const build = (over: Partial<Parameters<typeof buildSessionSnapshot>[0]> = {}) =>
  buildSessionSnapshot({
    accountId: 'a1',
    language: 'pl',
    expenses: [expense('Biedronka', 52.0, 21.0), expense('Biedronka', 52.0, 21.0)],
    items: [item('Mleko', false), item('Chleb', false)],
    safeToSpend: { baseCurrency: 'PLN', safeToSpendToday: 42.5 } as SafeToSpendResponse,
    ...over,
  });

describe('buildSessionSnapshot', () => {
  it('carries the account and language it was built for', () => {
    const s = build();

    expect(s.accountId).toBe('a1');
    expect(s.language).toBe('pl');
  });

  it('holds shop centres, not the expenses they came from', () => {
    const s = build();

    expect(s.centres).toEqual([{ merchant: 'Biedronka', lat: 52.0, lng: 21.0 }]);
  });

  // The snapshot must not be able to watch a shop the home card would never
  // match, or the two features would disagree about what a shop is.
  it('excludes untrusted sources exactly as the matcher does', () => {
    const s = build({
      expenses: [expense('Netflix', 52.0, 21.0, 'manual'), expense('Netflix', 52.0, 21.0, 'voice')],
    });

    expect(s.centres).toEqual([]);
  });

  it('counts only unchecked items', () => {
    const s = build({ items: [item('Mleko', false), item('Chleb', true)] });

    expect(s.uncheckedCount).toBe(1);
    expect(s.uncheckedLabels).toEqual(['Mleko']);
  });

  it('caps the labels it carries but not the count', () => {
    const s = build({
      items: ['a', 'b', 'c', 'd', 'e'].map((l) => item(l, false)),
    });

    expect(s.uncheckedCount).toBe(5);
    expect(s.uncheckedLabels).toHaveLength(MAX_SNAPSHOT_LABELS);
  });

  it('snapshots the safe-to-spend figure and its currency', () => {
    const s = build();

    expect(s.safeToSpendToday).toBe(42.5);
    expect(s.currencyCode).toBe('PLN');
  });

  it('tolerates a missing safe-to-spend figure', () => {
    const s = build({ safeToSpend: null });

    expect(s.safeToSpendToday).toBeNull();
    expect(s.currencyCode).toBeNull();
  });
});
