// Same shared-by-id MMKV mock as `stores/__tests__/shoppingModeStore.test.ts`:
// the session row this module reads and writes must be the same row the store
// module sees, exactly as real MMKV behaves for one id.
jest.mock('react-native-mmkv', () => {
  const stores = new Map<string, Map<string, string>>();
  return {
    MMKV: class {
      private store: Map<string, string>;
      constructor({ id }: { id: string }) {
        if (!stores.has(id)) stores.set(id, new Map());
        this.store = stores.get(id)!;
      }
      getString(k: string) { return this.store.get(k); }
      set(k: string, v: string) { this.store.set(k, v); }
      delete(k: string) { this.store.delete(k); }
    },
  };
});

import type { ShoppingListItem } from '@budget/shared-types';
import { refreshSessionItems } from '../refreshSessionItems';
import type { SessionSnapshot } from '../snapshot';
import { readSession, writeSession, clearSession } from '@/stores/shoppingModeStore';

const item = (rawLabel: string, isChecked: boolean): ShoppingListItem =>
  ({ id: `id-${rawLabel}`, rawLabel, isChecked }) as unknown as ShoppingListItem;

const snapshot: SessionSnapshot = {
  accountId: 'a1',
  language: 'pl',
  centres: [{ merchant: 'Biedronka', lat: 52.0, lng: 21.0 }],
  uncheckedCount: 2,
  uncheckedLabels: ['Mleko', 'Chleb'],
  safeToSpendToday: 42.5,
  currencyCode: 'PLN',
};

const live = (over: Partial<SessionSnapshot> = {}) =>
  writeSession({ startedAt: 100, insideMerchant: 'Biedronka', snapshot: { ...snapshot, ...over } });

describe('refreshSessionItems', () => {
  beforeEach(() => clearSession());

  it('does nothing when no session is running', () => {
    refreshSessionItems([item('Mleko', false)]);

    expect(readSession()).toBeNull();
  });

  it('updates the count and the labels together as items are ticked off', () => {
    live();

    refreshSessionItems([item('Mleko', true), item('Chleb', false)]);

    expect(readSession()?.snapshot.uncheckedCount).toBe(1);
    expect(readSession()?.snapshot.uncheckedLabels).toEqual(['Chleb']);
  });

  it('reports an emptied list as empty rather than leaving the starting count', () => {
    live();

    refreshSessionItems([item('Mleko', true), item('Chleb', true)]);

    expect(readSession()?.snapshot.uncheckedCount).toBe(0);
    expect(readSession()?.snapshot.uncheckedLabels).toEqual([]);
  });

  it('picks up items added mid-trip, not only ones removed', () => {
    live();

    refreshSessionItems([item('Mleko', false), item('Chleb', false), item('Masło', false)]);

    expect(readSession()?.snapshot.uncheckedCount).toBe(3);
  });

  // The count alone cannot tell a changed list from an unchanged one: swapping
  // one item for another leaves the count identical while every label differs.
  //
  // Neither notification body names an item today — both carry a bare count —
  // so nothing user-facing depends on this yet. `uncheckedLabels` is kept
  // accurate because the snapshot is what a future body would read, and a
  // stale label is worse than no label.
  it('updates labels when the count is unchanged but the items are not', () => {
    live();

    refreshSessionItems([item('Mleko', false), item('Masło', false)]);

    expect(readSession()?.snapshot.uncheckedLabels).toEqual(['Mleko', 'Masło']);
  });

  it('leaves the rest of the snapshot exactly as the session was born with', () => {
    live();

    refreshSessionItems([item('Mleko', true), item('Chleb', true)]);

    const stored = readSession();
    // The centres above all: the reducer resolves `insideMerchant` by looking
    // it up in this array, so losing or rebuilding it mid-trip ends the session.
    expect(stored?.snapshot.centres).toEqual(snapshot.centres);
    expect(stored?.snapshot.accountId).toBe('a1');
    expect(stored?.snapshot.language).toBe('pl');
    expect(stored?.snapshot.safeToSpendToday).toBe(42.5);
    expect(stored?.snapshot.currencyCode).toBe('PLN');
    expect(stored?.startedAt).toBe(100);
    expect(stored?.insideMerchant).toBe('Biedronka');
  });

  // Every shopping-list mutation calls this, and most of them change nothing
  // this session cares about (a quantity edit, a rename, a re-derived array of
  // the same items). Rewriting the row anyway is a wasted MMKV write per
  // keystroke on a screen the user is actively typing into.
  it('does not rewrite the row when nothing it tracks changed', () => {
    live();
    const before = readSession();

    refreshSessionItems([item('Mleko', false), item('Chleb', false)]);

    expect(readSession()).toEqual(before);
  });

  // A row written before this field existed parses fine — `parseStoredSession`
  // only requires `startedAt` and `centres` — and must not make `sameLabels`
  // throw on `undefined.length`.
  it('survives a stored session with no labels field at all', () => {
    const { uncheckedLabels: _omit, ...withoutLabels } = snapshot;
    writeSession({
      startedAt: 100,
      insideMerchant: null,
      snapshot: withoutLabels as SessionSnapshot,
    });

    refreshSessionItems([item('Mleko', false)]);

    expect(readSession()?.snapshot.uncheckedLabels).toEqual(['Mleko']);
  });

  it('caps the labels it stores the same way the builder does', () => {
    live();

    refreshSessionItems(['a', 'b', 'c', 'd', 'e'].map((l) => item(l, false)));

    expect(readSession()?.snapshot.uncheckedCount).toBe(5);
    expect(readSession()?.snapshot.uncheckedLabels).toEqual(['a', 'b', 'c']);
  });
});
