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

// `id` deliberately differs from `rawLabel` — a real ShoppingListItem's id is a
// server/client identifier, not its display text. If they were equal here, a
// mutant reading `i.id` instead of `i.rawLabel` would be indistinguishable
// from a correct implementation in every test below.
const item = (rawLabel: string, isChecked: boolean): ShoppingListItem =>
  ({ id: `id-${rawLabel}`, rawLabel, isChecked }) as unknown as ShoppingListItem;

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

  // A single trusted visit is one short of SHOPPING_MODE_DEFAULTS.minVisits
  // (2). Every other test in this file happens to supply exactly two matching
  // visits, so a snapshot that quietly used a smaller threshold (0 or 1) would
  // pass them all and still let the location task arm itself for a shop the
  // home card's own matcher would never have surfaced.
  it('requires the same minimum visit count as the home card matcher', () => {
    const s = build({ expenses: [expense('Zabka', 52.0, 21.0)] });

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
    // The exact leading slice, not just its length — a wrong slice start
    // (e.g. dropping the first item and taking one extra off the end) would
    // still produce a length-3 array and slip past a length-only assertion.
    expect(s.uncheckedLabels).toEqual(['a', 'b', 'c']);
  });

  // The cap's own value is only ever read back through the constant it
  // exercises above, so nothing pins the literal 3 a lock-screen notification
  // was designed around; this does.
  it('pins the label cap at three', () => {
    expect(MAX_SNAPSHOT_LABELS).toBe(3);
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

  // Zero is a real, legitimate answer here — the formula behind
  // SafeToSpendResponse clamps to zero rather than going negative. A `||`
  // fallback instead of `??` would fold that real zero into "missing" and
  // report null on a day the user has spent right up to the edge, which is
  // exactly when this feature has the most to say.
  it('treats a zero safe-to-spend figure as real, not missing', () => {
    const s = build({ safeToSpend: { baseCurrency: 'PLN', safeToSpendToday: 0 } as SafeToSpendResponse });

    expect(s.safeToSpendToday).toBe(0);
    expect(s.currencyCode).toBe('PLN');
  });
});
