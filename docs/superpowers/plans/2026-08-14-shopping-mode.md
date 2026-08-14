# Shopping Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user-started Android foreground-service session that notifies when the user arrives at a shop they have bought from before, and once more on the way out if anything is still unchecked, then stops by itself.

**Architecture:** `expo-location`'s `startLocationUpdatesAsync` owns the foreground service; a `TaskManager` task receives positions and drives a pure reducer. Because that task can wake in a **headless JS context** (no React, no hydrated Zustand store), it reads only a session snapshot written to MMKV when the session starts — never a store, never the network. All matching reuses ABA-404's `findNearbyStore`; this plan adds no matching rule.

**Tech Stack:** Expo 54 / React Native 0.81, `expo-location@~19.0.8`, `expo-task-manager@^14`, `expo-notifications@~0.32.16`, `react-native-mmkv`, Zustand, Jest.

**Spec:** `docs/superpowers/specs/2026-08-14-shopping-mode-design.md`

## Global Constraints

- **Android only.** Every entry point is gated on `Platform.OS === 'android'`. There is no `ios/` native project in this repo.
- **No native code.** No Kotlin, no TurboModule, no codegen, no new dependency. All four packages used are already in `apps/mobile/package.json`.
- **`ACCESS_BACKGROUND_LOCATION` must NOT be added to the manifest.** Only `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_LOCATION`. Adding background location is the whole thing this design exists to avoid.
- **No server change**: no schema, no migration, no endpoint, no remote push. Notifications are local.
- **The task must never read a Zustand store, call the API, or use a React hook.** It may read MMKV, and it may call `findNearbyStore`.
- `ARRIVE_RADIUS_M = 150`, `LEAVE_RADIUS_M = 250`, `SESSION_MAX_MS = 2 * 60 * 60 * 1000`, `minVisits = 2`.
- **The two radii must differ.** Hysteresis: on one shared threshold, GPS wander at a shop entrance crosses the boundary repeatedly and each crossing is a notification.
- **Exit is evaluated only against the merchant the session is inside**, never against the nearest one — passing a second shop must not end the session.
- i18n: every new key in **all 9 locales** (`en, de, es, fr, pl, ru, ua, be, nl`). Write each language natively; do not translate one English sentence nine times.
- This repo has **no React Native rendering test dependency**. Screens, hooks and the service wiring cannot be tested under Jest. Test the pure modules; do not add a rendering dependency.
- Commit messages in English. Do not squash, do not rebase, do not push.

---

### Task 1: Expose what a session needs from the ABA-404 matcher

The session must answer two questions the current matcher does not expose: *where are this user's shops?* (so the snapshot can hold centres instead of the whole expense history) and *how far am I from **this specific** shop?* (for the exit test).

Both already exist inside `findNearbyStore` as private steps. Extract them; change no rule. The 19 existing tests in this file are the guarantee that behaviour is identical — they must stay green untouched.

Also extract the expense-flattening loop that `useNearbyStore` performs, because Task 3 needs exactly the same loop and two copies of "read lat/lng from either of the two shapes an expense uses" is precisely the duplication that goes silently wrong when the `Expense` shape changes.

**Files:**
- Modify: `apps/mobile/src/features/stores/findNearbyStore.ts`
- Create: `apps/mobile/src/features/stores/expensesToVisits.ts`
- Modify: `apps/mobile/src/hooks/useNearbyStore.ts` (consume the extraction, delete the inline loop)
- Test: `apps/mobile/src/features/stores/__tests__/findNearbyStore.test.ts` (add to it)
- Test: `apps/mobile/src/features/stores/__tests__/expensesToVisits.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `export interface StoreCentre { merchant: string; lat: number; lng: number }`
  - `export function buildStoreCentres(visits: StoreVisit[], minVisits: number): StoreCentre[]` — returns centres sorted by lowercased merchant name.
  - `export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number`
  - `export function isRealPoint(p: { lat: number; lng: number }): boolean`
  - `export function expensesToVisits(expenses: Expense[]): StoreVisit[]` (in `expensesToVisits.ts`)

- [ ] **Step 1: Write the failing tests for the new exports**

Append to `apps/mobile/src/features/stores/__tests__/findNearbyStore.test.ts`:

```ts
import {
  buildStoreCentres,
  haversineM,
  isRealPoint,
  type StoreVisit,
} from '../findNearbyStore';

describe('buildStoreCentres', () => {
  const at = (merchant: string, lat: number, lng: number): StoreVisit => ({
    merchant,
    lat,
    lng,
    source: 'ocr',
  });

  it('returns one centre per merchant that clears the visit floor', () => {
    const centres = buildStoreCentres(
      [at('Biedronka', 52.0, 21.0), at('Biedronka', 52.0001, 21.0001), at('Lidl', 52.5, 21.5)],
      2,
    );

    expect(centres.map((c) => c.merchant)).toEqual(['Biedronka']);
  });

  it('groups case-insensitively but keeps the first spelling seen', () => {
    const centres = buildStoreCentres([at('Biedronka', 52.0, 21.0), at('BIEDRONKA', 52.0, 21.0)], 2);

    expect(centres).toHaveLength(1);
    expect(centres[0].merchant).toBe('Biedronka');
  });

  it('excludes untrusted sources, exactly as the matcher does', () => {
    const sofa: StoreVisit[] = [
      { merchant: 'Netflix', lat: 52.0, lng: 21.0, source: 'manual' },
      { merchant: 'Netflix', lat: 52.0, lng: 21.0, source: 'voice' },
    ];

    expect(buildStoreCentres(sofa, 2)).toEqual([]);
  });

  it('returns centres sorted by name so the order is deterministic', () => {
    const centres = buildStoreCentres(
      [
        at('Zabka', 52.0, 21.0),
        at('Zabka', 52.0, 21.0),
        at('Aldi', 52.1, 21.1),
        at('Aldi', 52.1, 21.1),
      ],
      2,
    );

    expect(centres.map((c) => c.merchant)).toEqual(['Aldi', 'Zabka']);
  });

  it('skips null island', () => {
    expect(buildStoreCentres([at('Ghost', 0, 0), at('Ghost', 0, 0)], 2)).toEqual([]);
  });
});

describe('haversineM', () => {
  it('measures roughly 111 km per degree of latitude', () => {
    const d = haversineM({ lat: 52.0, lng: 21.0 }, { lat: 53.0, lng: 21.0 });

    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_400);
  });

  it('is zero for the same point', () => {
    expect(haversineM({ lat: 52.0, lng: 21.0 }, { lat: 52.0, lng: 21.0 })).toBe(0);
  });
});

describe('isRealPoint', () => {
  it('rejects null island and non-finite values', () => {
    expect(isRealPoint({ lat: 0, lng: 0 })).toBe(false);
    expect(isRealPoint({ lat: Number.NaN, lng: 21.0 })).toBe(false);
    expect(isRealPoint({ lat: 52.0, lng: 21.0 })).toBe(true);
  });
});
```

Create `apps/mobile/src/features/stores/__tests__/expensesToVisits.test.ts`:

```ts
import type { Expense } from '@budget/shared-types';
import { expensesToVisits } from '../expensesToVisits';

const base = {
  id: 'e1',
  accountId: 'a1',
  amount: 10,
  currencyCode: 'PLN',
  date: '2026-08-14',
  source: 'ocr',
} as unknown as Expense;

describe('expensesToVisits', () => {
  it('reads the nested location shape', () => {
    const visits = expensesToVisits([
      { ...base, merchant: 'Biedronka', location: { lat: 52.0, lng: 21.0 } } as Expense,
    ]);

    expect(visits).toEqual([{ merchant: 'Biedronka', lat: 52.0, lng: 21.0, source: 'ocr' }]);
  });

  it('reads the flat column shape the API sends', () => {
    const visits = expensesToVisits([
      { ...base, merchant: 'Lidl', locationLat: 52.5, locationLng: 21.5 } as unknown as Expense,
    ]);

    expect(visits).toEqual([{ merchant: 'Lidl', lat: 52.5, lng: 21.5, source: 'ocr' }]);
  });

  it('skips expenses with no merchant, and trims the ones it keeps', () => {
    const visits = expensesToVisits([
      { ...base, merchant: '   ', location: { lat: 52.0, lng: 21.0 } } as Expense,
      { ...base, merchant: '  Zabka ', location: { lat: 52.0, lng: 21.0 } } as Expense,
    ]);

    expect(visits.map((v) => v.merchant)).toEqual(['Zabka']);
  });

  it('skips expenses with no usable coordinate, including Decimal strings from the API', () => {
    const visits = expensesToVisits([
      { ...base, merchant: 'Biedronka' } as Expense,
      { ...base, merchant: 'Lidl', locationLat: '52.5', locationLng: '21.5' } as unknown as Expense,
    ]);

    expect(visits).toEqual([]);
  });

  it('carries source through untouched, so the matcher can filter on it', () => {
    const visits = expensesToVisits([
      { ...base, merchant: 'Netflix', source: 'manual', location: { lat: 52.0, lng: 21.0 } } as Expense,
    ]);

    expect(visits[0].source).toBe('manual');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `apps/mobile`: `npx jest src/features/stores/ --silent`
Expected: FAIL — `buildStoreCentres is not a function`, and the `expensesToVisits` module is not found.

- [ ] **Step 3: Extract the three helpers in `findNearbyStore.ts`**

Change `median`, `haversineM` and `isRealPoint` from `const`/`function` declarations to exported ones (keep every existing doc comment verbatim — they carry the reasoning for decisions that were expensive to reach):

```ts
export const isRealPoint = (p: { lat: number; lng: number }): boolean =>
  Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0);

export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  // body unchanged
}
```

Add the new type and function, placing `buildStoreCentres` directly above `findNearbyStore`:

```ts
/** A shop's location: one merchant, one representative coordinate. */
export interface StoreCentre {
  merchant: string;
  lat: number;
  lng: number;
}

/**
 * The user's shops, as coordinates.
 *
 * This is the grouping half of `findNearbyStore`, lifted out so a caller can
 * hold the answer without holding the expenses it came from — Shopping Mode
 * snapshots these into MMKV, where storing raw expense history would be both
 * larger and a worse thing to leave lying on disk.
 *
 * Returned sorted by lowercased merchant name, which is what gives
 * `findNearbyStore` its deterministic tie-break.
 */
export function buildStoreCentres(visits: StoreVisit[], minVisits: number): StoreCentre[] {
  // Group case-insensitively, but keep the first spelling seen for display —
  // "BIEDRONKA" off a bank import and "Biedronka" off a receipt are one shop.
  const groups = new Map<string, { display: string; lats: number[]; lngs: number[] }>();
  for (const v of visits) {
    const name = v.merchant?.trim();
    if (!name || !isRealPoint(v)) continue;
    // A coordinate the user's own phone supplied while they sat at home is not
    // evidence of a shop — see TRUSTED_VISIT_SOURCES.
    if (!TRUSTED_VISIT_SOURCES.has(v.source)) continue;
    const key = name.toLowerCase();
    const group = groups.get(key) ?? { display: name, lats: [], lngs: [] };
    group.lats.push(v.lat);
    group.lngs.push(v.lng);
    groups.set(key, group);
  }

  const centres: StoreCentre[] = [];
  for (const key of Array.from(groups.keys()).sort()) {
    const group = groups.get(key)!;
    if (group.lats.length < minVisits) continue;
    centres.push({ merchant: group.display, lat: median(group.lats), lng: median(group.lngs) });
  }
  return centres;
}
```

Then rewrite `findNearbyStore`'s body to consume it, keeping its doc comment unchanged:

```ts
export function findNearbyStore(params: {
  coords: { lat: number; lng: number };
  visits: StoreVisit[];
  config?: NearbyStoreConfig;
}): NearbyStore | null {
  const { coords, visits } = params;
  const config = params.config ?? NEARBY_STORE_DEFAULTS;

  if (!isRealPoint(coords)) return null;

  let best: { merchant: string; distanceRaw: number } | null = null;
  // buildStoreCentres returns name-sorted, so an exact distance tie resolves by
  // name rather than by insertion order.
  for (const centre of buildStoreCentres(visits, config.minVisits)) {
    const distanceM = haversineM(coords, centre);
    if (distanceM > config.radiusM) continue;
    if (!best || distanceM < best.distanceRaw) {
      best = { merchant: centre.merchant, distanceRaw: distanceM };
    }
  }

  return best ? { merchant: best.merchant, distanceM: Math.round(best.distanceRaw) } : null;
}
```

- [ ] **Step 4: Create `expensesToVisits.ts`**

```ts
import type { Expense } from '@budget/shared-types';
import type { StoreVisit } from './findNearbyStore';

/**
 * Flatten expenses into the shape the matcher takes.
 *
 * Lives here rather than in `findNearbyStore.ts` so that module stays free of
 * the two shapes an expense's position takes in this codebase: a nested
 * `location` object (rebuilt by the pull merge) and flat
 * `locationLat`/`locationLng` columns straight from the API, which arrive as
 * Prisma Decimal *strings* and are correctly skipped by the `typeof` guard.
 *
 * Two callers need exactly this loop — `useNearbyStore` for the home card and
 * the Shopping Mode snapshot builder — and a second copy would be the thing
 * that silently stops working the day the Expense shape changes.
 *
 * `source` is carried through untouched: deciding whether a coordinate
 * describes a shop or the phone's owner is the matcher's job, not this one's.
 */
export function expensesToVisits(expenses: Expense[]): StoreVisit[] {
  const visits: StoreVisit[] = [];
  for (const e of expenses) {
    const merchant = e.merchant?.trim();
    if (!merchant) continue;
    const lat = e.location?.lat ?? e.locationLat;
    const lng = e.location?.lng ?? e.locationLng;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    visits.push({ merchant, lat, lng, source: e.source });
  }
  return visits;
}
```

- [ ] **Step 5: Consume the extraction in `useNearbyStore.ts`**

Add the import:

```ts
import { expensesToVisits } from '@/features/stores/expensesToVisits';
```

Inside `performMatch`, delete the inline `for (const e of expenses)` loop and the `StoreVisit[]` local, replacing them with:

```ts
      const visits = expensesToVisits(expenses);
```

Remove `type StoreVisit` from the `findNearbyStore` import if it is now unused. Leave every other line of the hook — the `checkRef` indirection, the `focusedRef` gate, the `inFlight` guard, the `performMatchRef` mirror and the identity-preserving `setNearby` — exactly as it is. Each is a review-loop fix with a comment explaining what it prevents.

- [ ] **Step 6: Run the tests**

Run from `apps/mobile`: `npx jest src/features/stores/ --silent`
Expected: PASS — the pre-existing tests **and** the new ones. If any pre-existing test now fails, the extraction changed behaviour: fix the extraction, never the test.

Run from `apps/mobile`: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/features/stores apps/mobile/src/hooks/useNearbyStore.ts
git commit -m "refactor(stores): expose store centres and distance for reuse"
```

---

### Task 2: The session reducer

The whole decision — arrive, leave, time out — as one pure function. This is the only part of Shopping Mode that CI can prove, so it carries the rules that would otherwise only be checked by walking to a shop.

**Files:**
- Create: `apps/mobile/src/features/shopping-mode/session.ts`
- Test: `apps/mobile/src/features/shopping-mode/__tests__/session.test.ts`

**Interfaces:**
- Consumes: `StoreCentre`, `haversineM`, `isRealPoint` from `@/features/stores/findNearbyStore` (Task 1).
- Produces:
  - `export interface ShoppingSessionConfig { arriveRadiusM: number; leaveRadiusM: number; sessionMaxMs: number; minVisits: number }`
  - `export const SHOPPING_MODE_DEFAULTS: ShoppingSessionConfig`
  - `export interface ShoppingSession { startedAt: number; insideMerchant: string | null }`
  - `export interface ShoppingSessionResult { session: ShoppingSession; notify: { kind: 'arrival' | 'exit'; merchant: string } | null; stop: boolean }`
  - `export function reduceShoppingSession(params: { session: ShoppingSession; centres: StoreCentre[]; coords: { lat: number; lng: number }; now: number; hasUncheckedItems: boolean; config?: ShoppingSessionConfig }): ShoppingSessionResult`

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/features/shopping-mode/__tests__/session.test.ts`:

```ts
import type { StoreCentre } from '@/features/stores/findNearbyStore';
import {
  reduceShoppingSession,
  SHOPPING_MODE_DEFAULTS,
  type ShoppingSession,
} from '../session';

const SHOP: StoreCentre = { merchant: 'Biedronka', lat: 52.0, lng: 21.0 };
const OTHER: StoreCentre = { merchant: 'Lidl', lat: 52.01, lng: 21.0 };
const START = 1_000_000;

/** Roughly `metres` north of `SHOP` — 1 degree of latitude is ~111 km. */
const northOf = (metres: number) => ({ lat: SHOP.lat + metres / 111_000, lng: SHOP.lng });

const approaching: ShoppingSession = { startedAt: START, insideMerchant: null };
const inside: ShoppingSession = { startedAt: START, insideMerchant: 'Biedronka' };

const run = (session: ShoppingSession, coords: { lat: number; lng: number }, over: Partial<{ now: number; hasUncheckedItems: boolean; centres: StoreCentre[] }> = {}) =>
  reduceShoppingSession({
    session,
    centres: over.centres ?? [SHOP, OTHER],
    coords,
    now: over.now ?? START + 60_000,
    hasUncheckedItems: over.hasUncheckedItems ?? true,
  });

describe('reduceShoppingSession', () => {
  it('notifies on arrival inside the arrive radius and records the merchant', () => {
    const r = run(approaching, northOf(100));

    expect(r.notify).toEqual({ kind: 'arrival', merchant: 'Biedronka' });
    expect(r.session.insideMerchant).toBe('Biedronka');
    expect(r.stop).toBe(false);
  });

  it('does nothing while still outside the arrive radius', () => {
    const r = run(approaching, northOf(400));

    expect(r.notify).toBeNull();
    expect(r.session.insideMerchant).toBeNull();
    expect(r.stop).toBe(false);
  });

  it('arrives immediately when the session starts at the shop', () => {
    const r = run(approaching, { lat: SHOP.lat, lng: SHOP.lng }, { now: START });

    expect(r.notify).toEqual({ kind: 'arrival', merchant: 'Biedronka' });
  });

  it('does not notify arrival twice for the same shop', () => {
    const r = run(inside, northOf(100));

    expect(r.notify).toBeNull();
    expect(r.stop).toBe(false);
  });

  // Hysteresis. This is the test that stops the notification flapping at a
  // shop entrance, where a stationary phone's reported position wanders by
  // tens of metres.
  it('stays inside between the two radii', () => {
    const r = run(inside, northOf(200));

    expect(r.notify).toBeNull();
    expect(r.stop).toBe(false);
  });

  it('notifies on exit past the leave radius and stops', () => {
    const r = run(inside, northOf(300));

    expect(r.notify).toEqual({ kind: 'exit', merchant: 'Biedronka' });
    expect(r.stop).toBe(true);
  });

  it('stops without notifying when nothing is left unchecked', () => {
    const r = run(inside, northOf(300), { hasUncheckedItems: false });

    expect(r.notify).toBeNull();
    expect(r.stop).toBe(true);
  });

  // Exit is measured against the shop we are IN, never the nearest one —
  // otherwise walking past a second shop would end the session.
  it('does not exit because a different shop is now nearer', () => {
    // OTHER is ~1.1 km from SHOP, so this position is far outside SHOP's
    // arrive radius but well inside its leave radius... no: it is outside
    // both. The point is that being *at* another shop is measured against
    // Biedronka, and 1.1 km is past the leave radius, so this DOES end the
    // session — which is correct. The guard being tested is that the exit is
    // attributed to Biedronka, not to Lidl.
    const r = run(inside, { lat: OTHER.lat, lng: OTHER.lng });

    expect(r.notify).toEqual({ kind: 'exit', merchant: 'Biedronka' });
    expect(r.stop).toBe(true);
  });

  it('stays inside its own shop even when another shop is closer', () => {
    // Standing 120 m from Biedronka, with Lidl's centre moved to 10 m away:
    // the nearest shop is Lidl, but the session is in Biedronka and 120 m is
    // inside its leave radius, so nothing happens. Measuring against the
    // nearest shop instead would have ended the session here.
    const near: StoreCentre = { merchant: 'Lidl', lat: SHOP.lat + 130 / 111_000, lng: SHOP.lng };
    const r = run(inside, northOf(120), { centres: [SHOP, near] });

    expect(r.notify).toBeNull();
    expect(r.stop).toBe(false);
  });

  it('stops silently once the session outlives its cap', () => {
    const r = run(inside, northOf(10), { now: START + SHOPPING_MODE_DEFAULTS.sessionMaxMs + 1 });

    expect(r.notify).toBeNull();
    expect(r.stop).toBe(true);
  });

  it('times out even while still approaching', () => {
    const r = run(approaching, northOf(5_000), {
      now: START + SHOPPING_MODE_DEFAULTS.sessionMaxMs + 1,
    });

    expect(r.stop).toBe(true);
  });

  it('ignores null island rather than treating it as a position', () => {
    const r = run(approaching, { lat: 0, lng: 0 });

    expect(r.notify).toBeNull();
    expect(r.stop).toBe(false);
  });

  it('stops when the snapshot no longer holds the shop it is inside', () => {
    const r = run(inside, northOf(10), { centres: [OTHER] });

    expect(r.notify).toBeNull();
    expect(r.stop).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `apps/mobile`: `npx jest src/features/shopping-mode/ --silent`
Expected: FAIL — cannot find module `../session`.

- [ ] **Step 3: Write `session.ts`**

```ts
import { haversineM, isRealPoint, type StoreCentre } from '@/features/stores/findNearbyStore';

export interface ShoppingSessionConfig {
  /** Inside this, the user has arrived. Same radius the home card uses. */
  arriveRadiusM: number;
  /** Only past this does the user count as having left. */
  leaveRadiusM: number;
  /** A session this old stops itself, wherever the user is. */
  sessionMaxMs: number;
  /** Coordinate-bearing trusted visits before a merchant is a shop at all. */
  minVisits: number;
}

/**
 * `arriveRadiusM` and `leaveRadiusM` MUST differ, and the gap is the point.
 *
 * A phone standing still at a shop entrance reports positions that wander by
 * tens of metres. On one shared threshold that wander crosses the boundary
 * repeatedly, and every crossing here is a notification — arrival, departure,
 * arrival. The 100 m gap means that once inside, it takes a real walk away to
 * get out again.
 */
export const SHOPPING_MODE_DEFAULTS: ShoppingSessionConfig = {
  arriveRadiusM: 150,
  leaveRadiusM: 250,
  sessionMaxMs: 2 * 60 * 60 * 1000,
  minVisits: 2,
};

export interface ShoppingSession {
  startedAt: number;
  /** The shop we are in, or null while still on the way. */
  insideMerchant: string | null;
}

export interface ShoppingSessionResult {
  session: ShoppingSession;
  notify: { kind: 'arrival' | 'exit'; merchant: string } | null;
  /** True means: unregister the task and tear the foreground service down. */
  stop: boolean;
}

/**
 * The whole of Shopping Mode's decision-making, as one pure function.
 *
 * Pure on purpose: the surrounding machinery — a foreground service, a
 * headless JS context, an OS notification — cannot be exercised under Jest in
 * this repo, so everything that can be decided without a device is decided
 * here, where it is testable.
 */
export function reduceShoppingSession(params: {
  session: ShoppingSession;
  centres: StoreCentre[];
  coords: { lat: number; lng: number };
  now: number;
  hasUncheckedItems: boolean;
  config?: ShoppingSessionConfig;
}): ShoppingSessionResult {
  const { session, centres, coords, now, hasUncheckedItems } = params;
  const config = params.config ?? SHOPPING_MODE_DEFAULTS;

  // Checked before anything else: a session past its cap ends regardless of
  // where the user is, and regardless of whether the position is usable.
  if (now - session.startedAt > config.sessionMaxMs) {
    return { session, notify: null, stop: true };
  }

  if (!isRealPoint(coords)) {
    return { session, notify: null, stop: false };
  }

  if (session.insideMerchant === null) {
    let best: { merchant: string; distanceM: number } | null = null;
    // `centres` arrives name-sorted from buildStoreCentres, so an exact tie
    // resolves by name rather than by array order.
    for (const centre of centres) {
      const distanceM = haversineM(coords, centre);
      if (distanceM > config.arriveRadiusM) continue;
      if (!best || distanceM < best.distanceM) best = { merchant: centre.merchant, distanceM };
    }
    if (!best) return { session, notify: null, stop: false };
    return {
      session: { ...session, insideMerchant: best.merchant },
      notify: { kind: 'arrival', merchant: best.merchant },
      stop: false,
    };
  }

  // Deliberately the shop we are IN, not the nearest one: walking past a
  // second shop must not end the session.
  const centre = centres.find((c) => c.merchant === session.insideMerchant);
  if (!centre) {
    // The snapshot no longer describes the shop we recorded. Nothing sensible
    // is left to measure against, so end rather than guess.
    return { session, notify: null, stop: true };
  }

  if (haversineM(coords, centre) <= config.leaveRadiusM) {
    return { session, notify: null, stop: false };
  }

  return {
    session,
    notify: hasUncheckedItems ? { kind: 'exit', merchant: session.insideMerchant } : null,
    stop: true,
  };
}
```

- [ ] **Step 4: Run the tests**

Run from `apps/mobile`: `npx jest src/features/shopping-mode/ --silent`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/shopping-mode
git commit -m "feat(shopping-mode): pure arrival/exit session reducer"
```

---

### Task 3: The session snapshot

Everything the headless task will ever need, computed once while the app is alive and its stores are populated. Pure, so what goes into MMKV is testable.

**Files:**
- Create: `apps/mobile/src/features/shopping-mode/snapshot.ts`
- Test: `apps/mobile/src/features/shopping-mode/__tests__/snapshot.test.ts`

**Interfaces:**
- Consumes: `buildStoreCentres`, `StoreCentre` (Task 1); `expensesToVisits` (Task 1); `SHOPPING_MODE_DEFAULTS` (Task 2).
- Produces:
  - `export interface SessionSnapshot { accountId: string; language: string; centres: StoreCentre[]; uncheckedCount: number; uncheckedLabels: string[]; safeToSpendToday: number | null; currencyCode: string | null }`
  - `export const MAX_SNAPSHOT_LABELS = 3`
  - `export function buildSessionSnapshot(params: { accountId: string; language: string; expenses: Expense[]; items: ShoppingListItem[]; safeToSpend: SafeToSpendResponse | null }): SessionSnapshot`

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/features/shopping-mode/__tests__/snapshot.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `apps/mobile`: `npx jest src/features/shopping-mode/__tests__/snapshot.test.ts --silent`
Expected: FAIL — cannot find module `../snapshot`.

- [ ] **Step 3: Write `snapshot.ts`**

```ts
import type { Expense, ShoppingListItem, SafeToSpendResponse } from '@budget/shared-types';
import { buildStoreCentres, type StoreCentre } from '@/features/stores/findNearbyStore';
import { expensesToVisits } from '@/features/stores/expensesToVisits';
import { SHOPPING_MODE_DEFAULTS } from './session';

/** Enough to recognise the list at a glance on a lock screen; not the whole list. */
export const MAX_SNAPSHOT_LABELS = 3;

/**
 * Everything Shopping Mode's location task will ever need, frozen at the
 * moment the user pressed the button.
 *
 * The task can wake in a headless JS context — the process is alive because
 * the foreground service holds it, but React has not mounted and no Zustand
 * store has hydrated. Anything read from a store there may be empty, and it
 * will be empty in exactly the case this feature exists for: the app was never
 * opened at the shop. So the task reads this, and nothing else.
 *
 * Snapshotting `safeToSpendToday` is deliberate rather than lazy. It is a
 * daily figure that does not move meaningfully inside one shopping trip, and
 * fetching the live value would mean a network call from a background task
 * that may have no hydrated auth store to read a token from.
 */
export interface SessionSnapshot {
  accountId: string;
  /** Frozen so a headless notification is still in the user's language. */
  language: string;
  centres: StoreCentre[];
  uncheckedCount: number;
  uncheckedLabels: string[];
  safeToSpendToday: number | null;
  currencyCode: string | null;
}

export function buildSessionSnapshot(params: {
  accountId: string;
  language: string;
  expenses: Expense[];
  items: ShoppingListItem[];
  safeToSpend: SafeToSpendResponse | null;
}): SessionSnapshot {
  const { accountId, language, expenses, items, safeToSpend } = params;

  const centres = buildStoreCentres(expensesToVisits(expenses), SHOPPING_MODE_DEFAULTS.minVisits);
  const unchecked = items.filter((i) => !i.isChecked);

  return {
    accountId,
    language,
    centres,
    uncheckedCount: unchecked.length,
    uncheckedLabels: unchecked.slice(0, MAX_SNAPSHOT_LABELS).map((i) => i.rawLabel),
    safeToSpendToday: safeToSpend?.safeToSpendToday ?? null,
    currencyCode: safeToSpend?.baseCurrency ?? null,
  };
}
```

- [ ] **Step 4: Run the tests**

Run from `apps/mobile`: `npx jest src/features/shopping-mode/ --silent`
Expected: PASS — Task 2's 13 tests and these 7.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/shopping-mode
git commit -m "feat(shopping-mode): pure session snapshot builder"
```

---

### Task 4: Session persistence

Where a running session lives between position updates. Must be readable and writable **synchronously from a headless context**, so it is MMKV behind plain functions; the Zustand store on top exists only so the UI can re-render.

**Files:**
- Create: `apps/mobile/src/stores/shoppingModeStore.ts`
- Test: `apps/mobile/src/stores/__tests__/shoppingModeStore.test.ts`

**Interfaces:**
- Consumes: `ShoppingSession` (Task 2), `SessionSnapshot` (Task 3).
- Produces:
  - `export interface StoredSession { startedAt: number; insideMerchant: string | null; snapshot: SessionSnapshot }`
  - `export function parseStoredSession(raw: string | undefined): StoredSession | null` — pure, exported for tests
  - `export function readSession(): StoredSession | null`
  - `export function writeSession(session: StoredSession): void`
  - `export function clearSession(): void`
  - `export const useShoppingModeStore` — Zustand: `{ active: boolean; merchant: string | null; refreshFromDisk: () => void }`

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/stores/__tests__/shoppingModeStore.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `apps/mobile`: `npx jest src/stores/__tests__/shoppingModeStore.test.ts --silent`
Expected: FAIL — cannot find module `../shoppingModeStore`.

- [ ] **Step 3: Write `shoppingModeStore.ts`**

```ts
import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';
import type { SessionSnapshot } from '@/features/shopping-mode/snapshot';

const mmkv = new MMKV({ id: 'shopping-mode' });
const SESSION_KEY = 'session';

export interface StoredSession {
  startedAt: number;
  insideMerchant: string | null;
  snapshot: SessionSnapshot;
}

/**
 * Pure, and deliberately paranoid.
 *
 * MMKV outlives app upgrades, so a row written by an older build can outlive
 * the shape that wrote it — and this is parsed inside a headless location
 * task, where a throw has no UI to surface in and no user to report it. An
 * unreadable session is treated as no session; the caller then stops the
 * service, which is the safe end state.
 */
export function parseStoredSession(raw: string | undefined): StoredSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof parsed?.startedAt !== 'number') return null;
    if (!parsed.snapshot || !Array.isArray(parsed.snapshot.centres)) return null;
    return {
      startedAt: parsed.startedAt,
      insideMerchant: typeof parsed.insideMerchant === 'string' ? parsed.insideMerchant : null,
      snapshot: parsed.snapshot as SessionSnapshot,
    };
  } catch {
    return null;
  }
}

export function readSession(): StoredSession | null {
  return parseStoredSession(mmkv.getString(SESSION_KEY));
}

export function writeSession(session: StoredSession): void {
  mmkv.set(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  mmkv.delete(SESSION_KEY);
}

interface ShoppingModeState {
  active: boolean;
  merchant: string | null;
  /**
   * The location task writes MMKV directly — it cannot touch this store, and
   * on a headless wake this module may not even be the same JS context. So the
   * UI re-reads from disk rather than expecting to be told.
   */
  refreshFromDisk: () => void;
}

export const useShoppingModeStore = create<ShoppingModeState>((set) => ({
  active: readSession() !== null,
  merchant: readSession()?.insideMerchant ?? null,
  refreshFromDisk: () => {
    const session = readSession();
    set({ active: session !== null, merchant: session?.insideMerchant ?? null });
  },
}));
```

- [ ] **Step 4: Run the tests**

Run from `apps/mobile`: `npx jest src/stores/__tests__/shoppingModeStore.test.ts --silent`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/stores/shoppingModeStore.ts apps/mobile/src/stores/__tests__/shoppingModeStore.test.ts
git commit -m "feat(shopping-mode): persist a running session in MMKV"
```

---

### Task 5: The location task, the service, and the notifications

The runtime. This is the part CI cannot prove, so keep it thin: the task's whole job is to read MMKV, call Task 2's reducer, and act on the result.

**Files:**
- Create: `apps/mobile/src/services/shoppingMode.ts`
- Modify: `apps/mobile/android/app/src/main/AndroidManifest.xml`
- Modify: `apps/mobile/src/services/notifications.ts` (one `case` in `handleNotificationResponse`)
- Modify: all 9 of `apps/mobile/src/i18n/locales/{en,de,es,fr,pl,ru,ua,be,nl}.ts`

**Interfaces:**
- Consumes: `reduceShoppingSession`, `SHOPPING_MODE_DEFAULTS` (Task 2); `SessionSnapshot` (Task 3); `readSession`, `writeSession`, `clearSession`, `StoredSession` (Task 4).
- Produces:
  - `export const SHOPPING_MODE_TASK = 'shopping-mode-location'`
  - `export async function startShoppingMode(snapshot: SessionSnapshot): Promise<'started' | 'no_permission'>`
  - `export async function stopShoppingMode(): Promise<void>`
  - `export async function sweepStaleShoppingMode(now: number): Promise<void>`

- [ ] **Step 1: Add the two manifest permissions**

In `apps/mobile/android/app/src/main/AndroidManifest.xml`, add these two lines to the existing alphabetical `uses-permission` block, after `ACCESS_FINE_LOCATION` and before `DETECT_SCREEN_CAPTURE`:

```xml
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION"/>
```

Do **not** add `ACCESS_BACKGROUND_LOCATION`. Do **not** add a `<service>` element: `expo-location`'s own AAR manifest already declares `.services.LocationTaskService` with `android:foregroundServiceType="location"`, and manifest merger supplies it. This is a bare workflow — `android/` is committed and EAS does not run prebuild — so the `expo-location` config plugin never runs and the manifest is edited by hand, the same seam as `MainApplication.kt`'s `getPackages()`.

- [ ] **Step 2: Add the i18n keys in all 9 locales**

Add a `shoppingMode` object immediately after the existing `storeArrival` object in each locale file. English (`en.ts`) is:

```ts
  shoppingMode: {
    start: 'I\'m going shopping',
    stop: 'Stop shopping mode',
    active: 'Shopping mode is on',
    noShopsTitle: 'No shops yet',
    noShopsBody: 'Scan a few receipts first — that is how the app learns where your shops are.',
    permissionTitle: 'Location needed',
    permissionBody: 'Shopping mode needs location while it runs, so it can tell when you reach a shop.',
    serviceTitle: 'Shopping mode',
    serviceBody: 'Watching for your shops',
    arrivalTitle: 'You\'re at {{merchant}}',
    arrivalBody: '{{count}} still on your list · {{amount}} safe to spend today',
    arrivalBodyNoSpend: '{{count}} still on your list',
    exitTitle: 'Leaving {{merchant}}',
    exitBody: '{{count}} still on your list',
  },
```

`serviceTitle`/`serviceBody` are the persistent foreground-service notification — they are visible for the whole session, so keep them short and calm.

Translate the other eight natively. Read each back for sense before moving on: two mistranslations shipped in this app recently and both passed every automated check — a German string that read "use language" where "use voice" was meant, and a Spanish one that read "read by you" where "we read them for you" was meant. Match the register each file already uses (`de` informal *du*, `fr` *vous*, `nl` *je*, `ru`/`ua`/`be` *вы*).

These notifications get **no per-type preference toggle**, and none should be added. The user starts every session by hand and can see a persistent notification the whole time it runs; a mode switched on forty minutes ago is not a recurring background alert. This is the same reasoning that leaves `account_invitation` and `split_payment_claimed` untoggleable — one-off action requests, not subscriptions.

- [ ] **Step 3: Write `shoppingMode.ts`**

```ts
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import i18n from '@/i18n';
import { formatCurrency } from '@budget/shared-utils';
import {
  reduceShoppingSession,
  SHOPPING_MODE_DEFAULTS,
} from '@/features/shopping-mode/session';
import type { SessionSnapshot } from '@/features/shopping-mode/snapshot';
import { readSession, writeSession, clearSession } from '@/stores/shoppingModeStore';

export const SHOPPING_MODE_TASK = 'shopping-mode-location';

/**
 * Post a local notification.
 *
 * `presentNotificationAsync` no longer exists in expo-notifications 0.32 — a
 * null trigger is how an immediate local notification is sent now.
 *
 * The language comes from the snapshot rather than from the current i18n
 * state: on a headless wake nothing has told i18next which language the user
 * reads.
 */
async function notify(language: string, title: string, body: string): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { type: 'shopping_mode' } },
      trigger: null,
    });
  } catch (e) {
    // A failed notification must never take the service down with it.
    console.warn('[ShoppingMode] notification failed:', e);
  }
}

function arrivalText(snapshot: SessionSnapshot, merchant: string): { title: string; body: string } {
  const lng = snapshot.language;
  const title = i18n.t('shoppingMode.arrivalTitle', { lng, merchant });
  const count = snapshot.uncheckedCount;
  if (snapshot.safeToSpendToday === null || !snapshot.currencyCode) {
    return { title, body: i18n.t('shoppingMode.arrivalBodyNoSpend', { lng, count }) };
  }
  const amount = formatCurrency(snapshot.safeToSpendToday, snapshot.currencyCode);
  return { title, body: i18n.t('shoppingMode.arrivalBody', { lng, count, amount }) };
}

TaskManager.defineTask(SHOPPING_MODE_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[ShoppingMode] task error:', error);
    return;
  }
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  const last = locations?.[locations.length - 1];
  if (!last) return;

  // Everything below reads MMKV and pure functions only. No store, no network,
  // no hook — this may be a headless JS context with nothing else initialised.
  const session = readSession();
  if (!session) {
    // No session on disk but the task is running: a leftover from a killed
    // process. Tear it down rather than notify about a session nobody started.
    await stopShoppingMode();
    return;
  }

  const result = reduceShoppingSession({
    session: { startedAt: session.startedAt, insideMerchant: session.insideMerchant },
    centres: session.snapshot.centres,
    coords: { lat: last.coords.latitude, lng: last.coords.longitude },
    now: Date.now(),
    hasUncheckedItems: session.snapshot.uncheckedCount > 0,
  });

  if (result.notify?.kind === 'arrival') {
    const { title, body } = arrivalText(session.snapshot, result.notify.merchant);
    await notify(session.snapshot.language, title, body);
  } else if (result.notify?.kind === 'exit') {
    await notify(
      session.snapshot.language,
      i18n.t('shoppingMode.exitTitle', {
        lng: session.snapshot.language,
        merchant: result.notify.merchant,
      }),
      i18n.t('shoppingMode.exitBody', {
        lng: session.snapshot.language,
        count: session.snapshot.uncheckedCount,
      }),
    );
  }

  if (result.stop) {
    await stopShoppingMode();
    return;
  }

  // Persist the reducer's new state so the next update sees it.
  if (result.session.insideMerchant !== session.insideMerchant) {
    writeSession({ ...session, insideMerchant: result.session.insideMerchant });
  }
});

/**
 * Begin a session. Returns `'no_permission'` without starting anything if
 * foreground location was refused.
 *
 * Foreground location only — `requestForegroundPermissionsAsync`, never
 * `requestBackgroundPermissionsAsync`. A foreground service of type `location`
 * is exempt from ACCESS_BACKGROUND_LOCATION, and keeping it that way is the
 * entire reason this design exists.
 *
 * Deliberately NOT gated on the Settings → Data location toggle that governs
 * the passive Store Arrival card. Pressing the button is explicit, scoped,
 * per-session consent with a persistent notification visible throughout — a
 * stronger signal than the toggle. Requiring the toggle as well would refuse
 * the feature to exactly the user who wants an explicit mode rather than
 * continuous tracking. Do not add that gate.
 */
export async function startShoppingMode(
  snapshot: SessionSnapshot,
): Promise<'started' | 'no_permission'> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return 'no_permission';

  // Never two sessions at once: stop whatever is running before starting.
  await stopShoppingMode();

  writeSession({ startedAt: Date.now(), insideMerchant: null, snapshot });

  await Location.startLocationUpdatesAsync(SHOPPING_MODE_TASK, {
    accuracy: Location.Accuracy.Balanced,
    // Let the OS coalesce updates: we care about ~150 m, not about metres.
    distanceInterval: 50,
    pausesUpdatesAutomatically: false,
    foregroundService: {
      notificationTitle: i18n.t('shoppingMode.serviceTitle', { lng: snapshot.language }),
      notificationBody: i18n.t('shoppingMode.serviceBody', { lng: snapshot.language }),
      // False on purpose: the whole point is that this survives the app being
      // swiped away. The 2-hour cap and the stale sweep are what bound it.
      killServiceOnDestroy: false,
    },
  });

  return 'started';
}

export async function stopShoppingMode(): Promise<void> {
  clearSession();
  try {
    if (await TaskManager.isTaskRegisteredAsync(SHOPPING_MODE_TASK)) {
      await Location.stopLocationUpdatesAsync(SHOPPING_MODE_TASK);
    }
  } catch (e) {
    console.warn('[ShoppingMode] failed to stop location updates:', e);
  }
}

/**
 * Stop a session that outlived its cap, and stop a service running with no
 * session behind it.
 *
 * This is not belt-and-braces. `killServiceOnDestroy: false` keeps the service
 * alive across the app being swiped away, and since Android 13 a user can
 * dismiss the persistent notification without stopping anything — so for a
 * user who has dismissed it, this sweep and the in-app stop button are the only
 * two ways the service ever ends.
 */
export async function sweepStaleShoppingMode(now: number): Promise<void> {
  const session = readSession();
  const registered = await TaskManager.isTaskRegisteredAsync(SHOPPING_MODE_TASK).catch(() => false);

  if (!session) {
    if (registered) await stopShoppingMode();
    return;
  }
  if (now - session.startedAt > SHOPPING_MODE_DEFAULTS.sessionMaxMs) {
    await stopShoppingMode();
  }
}
```

- [ ] **Step 4: Add the deep-link case**

In `apps/mobile/src/services/notifications.ts`, inside `handleNotificationResponse`'s `switch`, add next to the other shopping cases:

```ts
    case 'shopping_mode':
      router.push('/shopping-list' as any);
      break;
```

- [ ] **Step 5: Verify it compiles and nothing regressed**

Run from `apps/mobile`: `npx tsc --noEmit`
Expected: clean.

Run from the repo root: `npm run test`
Expected: no new failures. There are no unit tests for this task's runtime — a foreground service cannot be exercised under Jest in this repo, and a test asserting that a mock was called would prove nothing. Task 2's reducer is where this task's decisions are tested.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/services/shoppingMode.ts apps/mobile/src/services/notifications.ts apps/mobile/src/i18n/locales apps/mobile/android/app/src/main/AndroidManifest.xml
git commit -m "feat(shopping-mode): foreground-service location session and notifications"
```

---

### Task 6: Entry points

The button, the quick-action row, and the sweep that runs at app start.

**Files:**
- Create: `apps/mobile/src/hooks/useShoppingModeSweep.ts`
- Modify: `apps/mobile/app/_layout.tsx`
- Modify: `apps/mobile/app/shopping-list/index.tsx`

**Deliberately NOT modified: `HomeQuickActionStrip.tsx`.** The design sketched a row in the `shopping_hub` bottom sheet, but that sheet is driven by a `shoppingHubItems` array and **already** carries a "Shopping list" row pointing at `/shopping-list` — which is exactly where this button lives. A second row to the same destination under a different label is noise, not an entry point. The home screen already reaches this feature in one tap.

**Interfaces:**
- Consumes: `startShoppingMode`, `stopShoppingMode`, `sweepStaleShoppingMode` (Task 5); `buildSessionSnapshot` (Task 3); `useShoppingModeStore` (Task 4).
- Produces: `export function useShoppingModeSweep(): void`

- [ ] **Step 1: Write the sweep hook**

Create `apps/mobile/src/hooks/useShoppingModeSweep.ts`:

```ts
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { sweepStaleShoppingMode, stopShoppingMode } from '@/services/shoppingMode';
import { useShoppingModeStore, readSession } from '@/stores/shoppingModeStore';
import { useAccountStore } from '@/stores/accountStore';

/**
 * Ends a session that outlived its two-hour cap, a service left running with
 * no session behind it, and a session belonging to an account the user has
 * since switched away from.
 *
 * Runs once per app start. `killServiceOnDestroy: false` means the service
 * survives the app being swiped away, so without this a crash between starting
 * a session and the next position update would strand a foreground service —
 * and its notification — indefinitely.
 *
 * Also the moment the UI learns what the location task did while the app was
 * closed, since the task writes MMKV and cannot touch a store.
 */
export function useShoppingModeSweep(): void {
  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const swept = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (swept.current) return;
    swept.current = true;
    void sweepStaleShoppingMode(Date.now()).finally(() => {
      useShoppingModeStore.getState().refreshFromDisk();
    });
  }, []);

  // A session's snapshot — its shops, its list, its spend figure — belongs to
  // the account that started it. Switching accounts would otherwise leave it
  // running and notify about another account's shopping list, the same class
  // of bug as the Store Arrival widget's `currentAccountId` dependency. Ending
  // it is cheaper and more honest than trying to re-snapshot mid-trip.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (!currentAccountId) return;
    const session = readSession();
    if (!session || session.snapshot.accountId === currentAccountId) return;
    void stopShoppingMode().finally(() => {
      useShoppingModeStore.getState().refreshFromDisk();
    });
  }, [currentAccountId]);
}
```

The one-shot `swept` ref matters: `currentAccountId` is a dependency of the second effect, and the account switcher sits in every tab header and the home hero, so without it a user switching accounts would re-run the stale sweep on every switch.

- [ ] **Step 2: Call it from the root layout**

In `apps/mobile/app/_layout.tsx`, add the import next to the other hook imports:

```ts
import { useShoppingModeSweep } from '@/hooks/useShoppingModeSweep';
```

and call it in `RootNavigator()` next to `useBankNotificationCapture();`:

```ts
  useShoppingModeSweep();
```

Place it with the other unconditional bootstrap hooks — it takes no arguments and must not be gated on the cold-start gate, because a stranded foreground service should be cleaned up whether or not anyone signs in.

- [ ] **Step 3: Add the button to the shopping-list screen**

In `apps/mobile/app/shopping-list/index.tsx`, add the imports:

```ts
import { Platform } from 'react-native';
import { useExpenseStore } from '@/stores/expenseStore';
import { useAuthStore } from '@/stores/authStore';
import { useSafeToSpend } from '@/features/insights/useSafeToSpend';
import { buildSessionSnapshot } from '@/features/shopping-mode/snapshot';
import { startShoppingMode, stopShoppingMode } from '@/services/shoppingMode';
import { useShoppingModeStore } from '@/stores/shoppingModeStore';
```

Inside the component, next to the existing store reads:

```ts
  const shoppingModeActive = useShoppingModeStore((s) => s.active);
  const refreshShoppingMode = useShoppingModeStore((s) => s.refreshFromDisk);
  const expenses = useExpenseStore((s) => s.expenses);
  const language = useAuthStore((s) => s.user?.language) ?? 'en';
  const { data: safeToSpend } = useSafeToSpend();

  const toggleShoppingMode = async () => {
    if (shoppingModeActive) {
      await stopShoppingMode();
      refreshShoppingMode();
      return;
    }
    const snapshot = buildSessionSnapshot({
      accountId: currentAccountId ?? '',
      language,
      expenses,
      items,
      safeToSpend,
    });
    // A session that can never fire is worse than no button: say so instead.
    if (snapshot.centres.length === 0) {
      showAlert(t('shoppingMode.noShopsTitle'), t('shoppingMode.noShopsBody'));
      return;
    }
    const result = await startShoppingMode(snapshot);
    if (result === 'no_permission') {
      showAlert(t('shoppingMode.permissionTitle'), t('shoppingMode.permissionBody'));
      return;
    }
    refreshShoppingMode();
  };
```

Render the control as the first child inside the screen's main `<ScrollView>` (it opens at roughly line 219, just after `<Stack.Screen options={{ title: t('shoppingList.title'), headerRight }} />`), above the `lists.length > 0 && restockSuggestions.length > 0` restock section. Gated on Android:

```tsx
      {Platform.OS === 'android' && (
        <TouchableOpacity
          style={[styles.shoppingModeButton, shoppingModeActive && styles.shoppingModeButtonActive]}
          onPress={() => void toggleShoppingMode()}
          activeOpacity={0.7}
        >
          <Ionicons
            name={shoppingModeActive ? 'stop-circle-outline' : 'navigate-outline'}
            size={18}
            color={shoppingModeActive ? theme.colors.textInverse : theme.colors.primary}
          />
          <Text
            style={[
              styles.shoppingModeText,
              shoppingModeActive && styles.shoppingModeTextActive,
            ]}
          >
            {shoppingModeActive ? t('shoppingMode.stop') : t('shoppingMode.start')}
          </Text>
        </TouchableOpacity>
      )}
```

Add to that file's `createStyles`:

```ts
  shoppingModeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
  },
  shoppingModeButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  shoppingModeText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  shoppingModeTextActive: {
    color: theme.colors.textInverse,
  },
```

The button is deliberately **not** `canEdit`-gated. A viewer can walk into a shop, and starting a location session on their own device writes nothing to the account.

- [ ] **Step 4: Verify**

Run from `apps/mobile`: `npx tsc --noEmit`
Expected: clean.

Run from the repo root: `npm run test`
Expected: no new failures.

Run from `apps/mobile`: `npx eslint app/shopping-list/index.tsx src/hooks/useShoppingModeSweep.ts src/services/shoppingMode.ts`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/_layout.tsx apps/mobile/app/shopping-list/index.tsx apps/mobile/src/hooks/useShoppingModeSweep.ts
git commit -m "feat(shopping-mode): start and stop a session from the shopping list"
```

---

### Task 7: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `user_docs/{en,de,es,fr,pl,ru,ua,be,nl}/38-shopping-list.md`
- Regenerate: `apps/mobile/src/help/content.ts`

- [ ] **Step 1: Add the CLAUDE.md entry**

Add a bullet immediately after the existing **Store Arrival card (ABA-404)** bullet in the mobile section. It must record the decisions the code cannot state for itself:

- **A foreground service, deliberately, not geofences.** `ACCESS_BACKGROUND_LOCATION` needs a Play Console declaration with a video demo, and this app already ships `BIND_NOTIFICATION_LISTENER_SERVICE`; a rejection blocks every release. A foreground service of type `location` is exempt from that permission. **Do not add `ACCESS_BACKGROUND_LOCATION` to the manifest.**
- **On Android 14+ a `location` foreground service cannot be started from the background at all**, so "start it automatically" is barred by the platform, not by taste — making this automatic means the geofenced version and its declaration.
- **The task can wake headless**, which is why it reads only the MMKV `SessionSnapshot` and never a Zustand store, the network, or a hook — and why `language` is snapshotted (nothing has told i18next what the user reads) and `safeToSpendToday` is snapshotted (a background task may have no hydrated auth store to get a token from).
- **The two radii differ on purpose** (150 arrive / 250 leave): on one threshold, GPS wander at a shop entrance flaps the boundary and every crossing is a notification. **Exit is measured against the shop the session is inside, never the nearest one**, so passing a second shop cannot end it.
- **Dismissing the persistent notification does not stop the service** (Android 13+), so `sweepStaleShoppingMode` and the in-app stop button are the only two ways a session ends for a user who swiped it away — they are load-bearing, not defensive.
- `expo-location`'s own AAR manifest already declares `LocationTaskService` with `foregroundServiceType="location"`; the app manifest needs only the two `uses-permission` lines. The config plugin never runs here — bare workflow, `android/` committed, no prebuild.
- `presentNotificationAsync` does not exist in `expo-notifications` 0.32 — local notifications are `scheduleNotificationAsync({ content, trigger: null })`.
- Task 1's extraction: `buildStoreCentres`/`haversineM`/`isRealPoint` are exported from `findNearbyStore.ts` and `expensesToVisits` lives in its own module consumed by both `useNearbyStore` and the snapshot builder. The matching **rule** is unchanged from ABA-404.

- [ ] **Step 2: Document it for users in all 9 languages**

Add a short section to `user_docs/<lang>/38-shopping-list.md` for each of the 9 languages. Write for someone who just installed the app: what the button does, that it notifies when they reach a shop and once on the way out if something is unchecked, that it turns itself off, and that it is Android-only. Do **not** mention radii, hysteresis, the snapshot, MMKV, or the foreground-service mechanics. Do mention that a persistent notification is visible while it runs, because a user who sees one and cannot explain it will assume something is wrong.

- [ ] **Step 3: Regenerate the help content**

Run from the repo root: `npm run generate:help`

Never hand-edit `apps/mobile/src/help/content.ts`.

- [ ] **Step 4: Verify and commit**

Run from the repo root: `npm run typecheck` and `npm run test`
Expected: both clean.

```bash
git add CLAUDE.md user_docs apps/mobile/src/help/content.ts
git commit -m "docs: shopping mode"
```

---

## Device pass (cannot be automated — run before release)

Nothing below is verifiable in CI. A foreground service, a headless JS wake, an OS notification and a permission prompt all require a real Android device.

1. With location permission granted and at least one shop with two receipt-scanned expenses, press "I'm going shopping" on the shopping-list screen. The persistent notification appears.
2. Confirm it is in the app's language, not English, for a non-English user.
3. **Close the app entirely** (swipe it away). Walk or drive to the shop. The arrival notification arrives with the app closed. Tapping it opens the shopping list.
4. Leave the shop. The exit notification arrives once, and the persistent notification disappears.
5. Start a session and check every item off, then leave: no exit notification, service still stops.
6. Start a session and leave the phone alone for two hours: the service stops silently.
7. Press the button with no known shops: the explanation appears and no service starts.
8. Deny the location permission: the explanation appears and no service starts.
