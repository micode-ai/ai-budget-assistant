// Storage is keyed by `id` and shared across `new MMKV(...)` instantiations,
// same as real MMKV persisting to disk per id. The brief's original mock gave
// every instantiation its own private Map, which is indistinguishable from
// the real thing for every test in this file EXCEPT the `useShoppingModeStore`
// describe below, which needs to seed storage before a fresh module import
// runs its own `new MMKV(...)` — i.e. it needs two separate instantiations of
// the same id to see each other's writes, exactly as production does.
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

  // `undefined` short-circuits at `if (!raw)` and never reaches `JSON.parse` at
  // all -- a completely different path from a bare JSON scalar, which DOES
  // reach `JSON.parse` (successfully) and must still be rejected by the shape
  // checks rather than by the catch block. A future edit that narrows the try
  // to wrap only `JSON.parse` (reasoning that optional chaining already makes
  // the shape checks safe) reintroduces exactly the kind of throw this
  // function exists to prevent -- inside a headless task, with no UI and no
  // user to see it.
  it('returns null for a bare JSON primitive instead of a real stored shape', () => {
    expect(parseStoredSession('null')).toBeNull();
    expect(parseStoredSession('42')).toBeNull();
    expect(parseStoredSession('"x"')).toBeNull();
    expect(parseStoredSession('true')).toBeNull();
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
    const written = { startedAt: 123, insideMerchant: 'Biedronka', snapshot };
    writeSession(written);

    // The whole object, not just `insideMerchant` -- a `writeSession` that
    // dropped `startedAt` or replaced the snapshot with e.g. `{ centres: [] }`
    // would still pass a merchant-only assertion, since the shape guard in
    // `parseStoredSession` only requires `centres` to BE an array, never to be
    // the RIGHT one.
    expect(readSession()).toEqual(written);
  });

  it('reads null once cleared', () => {
    writeSession({ startedAt: 123, insideMerchant: null, snapshot });
    clearSession();

    expect(readSession()).toBeNull();
  });
});

describe('useShoppingModeStore', () => {
  // The store's initial `active`/`merchant` are derived once, at module import
  // time, from whatever is already on MMKV -- there is no effect that re-reads
  // later. Exercising that requires a genuinely fresh module evaluation: the
  // module already imported at the top of this file ran its `create(...)` call
  // long before any test got to write anything into storage, so its initial
  // state is permanently frozen at "nothing on disk", no matter what a test
  // does afterward. `jest.resetModules()` + `require(...)` (the pattern this
  // repo already uses in `twelve-data.service.spec.ts` for the same "module
  // caches state at load time" problem) forces the store's module-scope code
  // to run again; seeding storage beforehand only reaches that fresh run
  // because the mock above shares storage by id, exactly as real MMKV does.
  function freshStoreModule(seedRaw?: string): typeof import('../shoppingModeStore') {
    jest.resetModules();
    const { MMKV } = require('react-native-mmkv');
    // Guards against a previous call in this same test file having left
    // something in the shared-by-id mock storage.
    const seed = new MMKV({ id: 'shopping-mode' });
    seed.delete('session');
    if (seedRaw !== undefined) {
      seed.set('session', seedRaw);
    }
    return require('../shoppingModeStore');
  }

  it('is inactive with no merchant when nothing is on disk at import time', () => {
    const mod = freshStoreModule();
    const state = mod.useShoppingModeStore.getState();

    expect(state.active).toBe(false);
    expect(state.merchant).toBeNull();
  });

  it('is active with the stored merchant when a session is already on disk at import time', () => {
    const seeded = { startedAt: 100, insideMerchant: 'Biedronka', snapshot };
    const mod = freshStoreModule(JSON.stringify(seeded));
    const state = mod.useShoppingModeStore.getState();

    expect(state.active).toBe(true);
    expect(state.merchant).toBe('Biedronka');
  });

  it('refreshFromDisk picks up a session written after the store was created', () => {
    const mod = freshStoreModule();
    expect(mod.useShoppingModeStore.getState().active).toBe(false);

    mod.writeSession({ startedAt: 1, insideMerchant: 'Lidl', snapshot });
    mod.useShoppingModeStore.getState().refreshFromDisk();

    const state = mod.useShoppingModeStore.getState();
    expect(state.active).toBe(true);
    expect(state.merchant).toBe('Lidl');
  });

  it('refreshFromDisk reflects a session cleared after the store was created', () => {
    const seeded = { startedAt: 1, insideMerchant: 'Lidl', snapshot };
    const mod = freshStoreModule(JSON.stringify(seeded));
    expect(mod.useShoppingModeStore.getState().active).toBe(true);

    mod.clearSession();
    mod.useShoppingModeStore.getState().refreshFromDisk();

    const state = mod.useShoppingModeStore.getState();
    expect(state.active).toBe(false);
    expect(state.merchant).toBeNull();
  });
});
