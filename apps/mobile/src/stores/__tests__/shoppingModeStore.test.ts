jest.mock('react-native-mmkv', () => ({
  MMKV: class {
    private store = new Map<string, string>();
    getString(k: string) { return this.store.get(k); }
    set(k: string, v: string) { this.store.set(k, v); }
    delete(k: string) { this.store.delete(k); }
  },
}));

import { parseStoredSession, readSession, writeSession, clearSession } from '../shoppingModeStore';
import type { SessionSnapshot } from '@/features/shopping-mode/snapshot';

const snapshot: SessionSnapshot = {
  accountId: 'a1',
  language: 'pl',
  centres: [{ merchant: 'Biedronka', lat: 52.0, lng: 21.0 }],
  uncheckedCount: 2,
  uncheckedLabels: ['Mleko', 'Chleb'],
  safeToSpendToday: 42.5,
  currencyCode: 'PLN',
};

describe('parseStoredSession', () => {
  it('returns null for nothing stored', () => {
    expect(parseStoredSession(undefined)).toBeNull();
  });

  // MMKV survives app upgrades, so a row written by an older build can outlive
  // the shape that wrote it. A throw here happens inside a headless task,
  // where nothing is watching.
  it('returns null for unparseable JSON instead of throwing', () => {
    expect(parseStoredSession('{not json')).toBeNull();
  });

  it('returns null when the stored shape is missing what the reducer needs', () => {
    expect(parseStoredSession(JSON.stringify({ startedAt: 1 }))).toBeNull();
    expect(parseStoredSession(JSON.stringify({ snapshot }))).toBeNull();
  });

  it('round-trips a well-formed session', () => {
    const stored = { startedAt: 123, insideMerchant: null, snapshot };

    expect(parseStoredSession(JSON.stringify(stored))).toEqual(stored);
  });

  // The brief's own reducer walks `snapshot.centres` (via `nearestWithin`), so a
  // snapshot object that is present but carries no usable centres array is just
  // as unreadable as no snapshot at all — a naive `!parsed.snapshot` check alone
  // would let this through.
  it('returns null when snapshot is present but has no centres array', () => {
    const { centres: _omit, ...snapshotWithoutCentres } = snapshot;
    expect(
      parseStoredSession(JSON.stringify({ startedAt: 1, snapshot: snapshotWithoutCentres }))
    ).toBeNull();
    expect(
      parseStoredSession(
        JSON.stringify({ startedAt: 1, snapshot: { ...snapshot, centres: 'not-an-array' } })
      )
    ).toBeNull();
  });

  // Every given fixture only ever exercises a string or a literal `null` for
  // `insideMerchant`. A row surviving an app upgrade could carry any old JSON
  // value there, and it must become `null`, not pass through unchanged.
  it('coerces a non-string insideMerchant to null instead of passing it through', () => {
    const result = parseStoredSession(
      JSON.stringify({ startedAt: 1, insideMerchant: 42, snapshot })
    );
    expect(result?.insideMerchant).toBeNull();
  });
});

describe('session persistence', () => {
  beforeEach(() => clearSession());

  it('reads back what it wrote', () => {
    writeSession({ startedAt: 123, insideMerchant: 'Biedronka', snapshot });

    expect(readSession()?.insideMerchant).toBe('Biedronka');
  });

  it('reads null once cleared', () => {
    writeSession({ startedAt: 123, insideMerchant: null, snapshot });
    clearSession();

    expect(readSession()).toBeNull();
  });
});
