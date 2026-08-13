# Store Arrival Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a home-screen card when the user is at a shop they have bought from before, carrying the unchecked shopping list and today's safe-to-spend figure.

**Architecture:** A pure function decides "am I at a known shop" from the user's own geo-tagged expenses; a hook feeds it the current position via the existing opt-in-respecting capture helper; a widget renders the result through the home screen's existing widget system. No server change and no new permission.

**Tech Stack:** Expo Router, React Native, Zustand, `expo-location` (already a dependency), i18next (9 locales).

**Spec:** `docs/superpowers/specs/2026-08-13-store-arrival-card-design.md`

## Global Constraints

- **Foreground only.** No geofencing, no background task, no `ACCESS_BACKGROUND_LOCATION`, no iOS "Always", no push, no cron. If a task needs a new permission, the design was misread.
- **The existing location opt-in governs it.** Call `captureCurrentLocation()` **without** `force`, so the Settings → Data toggle (default OFF) decides. A user who declined location must never be silently located.
- **Store coordinates come from the user's own geo-tagged expenses.** The community store-geo read path is kill-switched off in production; it is not a source.
- **No server change**: no schema, no migration, no endpoint, no DTO.
- **Median, not mean**, for a merchant's coordinates — one stray geotag must not move the centre.
- **`(0, 0)` is null island**, not a location: the codebase's convention for an undecryptable tier-2 row's zeroed plaintext.
- **9 locales**, always all of them: `en, de, es, fr, pl, ru, ua, be, nl`. Real translations; Polish matters most.

---

### Task 1: The pure "am I at a known shop" function

All of this feature's correctness lives here, and it is the only part CI can verify.

**Files:**
- Create: `apps/mobile/src/features/stores/findNearbyStore.ts`
- Create: `apps/mobile/src/features/stores/__tests__/findNearbyStore.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface StoreVisit { merchant: string; lat: number; lng: number }`
  - `interface NearbyStore { merchant: string; distanceM: number }`
  - `interface NearbyStoreConfig { radiusM: number; minVisits: number }`
  - `const NEARBY_STORE_DEFAULTS: NearbyStoreConfig`
  - `function findNearbyStore(params: { coords: { lat: number; lng: number }; visits: StoreVisit[]; config?: NearbyStoreConfig }): NearbyStore | null`

Note the input shape: `visits` is already flattened by the caller. Expenses carry their position two ways in this codebase — a nested `location` object and flat `locationLat`/`locationLng` columns — and keeping that duality out of the pure function is deliberate.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/features/stores/__tests__/findNearbyStore.test.ts`:

```ts
import { findNearbyStore, NEARBY_STORE_DEFAULTS, type StoreVisit } from '../findNearbyStore';

// Warsaw city centre. ~0.0001 degrees of latitude is ~11 m, which is the unit
// these fixtures use to place points at known distances.
const HERE = { lat: 52.2297, lng: 21.0122 };
const visit = (merchant: string, dLat = 0, dLng = 0): StoreVisit => ({
  merchant,
  lat: HERE.lat + dLat,
  lng: HERE.lng + dLng,
});

describe('findNearbyStore', () => {
  it('matches a shop the user has visited twice, right where they are standing', () => {
    const result = findNearbyStore({
      coords: HERE,
      visits: [visit('Biedronka'), visit('Biedronka', 0.0001)],
    });

    expect(result?.merchant).toBe('Biedronka');
    expect(result!.distanceM).toBeLessThan(20);
  });

  it('ignores a merchant seen only once, however close', () => {
    // One stray geotag — a receipt scanned at home, say — must not be able to
    // invent a shop out of nothing.
    expect(findNearbyStore({ coords: HERE, visits: [visit('Biedronka')] })).toBeNull();
  });

  it('ignores a shop beyond the radius', () => {
    // ~0.01 degrees latitude is ~1.1 km, well outside the 150 m default.
    const far = [visit('Lidl', 0.01), visit('Lidl', 0.0101)];
    expect(findNearbyStore({ coords: HERE, visits: far })).toBeNull();
  });

  it('takes the median of a merchant coordinates, so one stray geotag cannot drag the centre', () => {
    // Three visits at the shop, one bogus geotag ~1.1 km away. A mean would sit
    // ~275 m off and miss; the median ignores the outlier entirely.
    const visits = [
      visit('Biedronka'),
      visit('Biedronka', 0.00005),
      visit('Biedronka', 0.0001),
      visit('Biedronka', 0.01),
    ];

    const result = findNearbyStore({ coords: HERE, visits });

    expect(result?.merchant).toBe('Biedronka');
    expect(result!.distanceM).toBeLessThan(20);
  });

  it('returns the nearer of two shops in range', () => {
    const visits = [
      visit('Lidl', 0.001), visit('Lidl', 0.001),
      visit('Biedronka', 0.0001), visit('Biedronka', 0.0001),
    ];

    expect(findNearbyStore({ coords: HERE, visits })?.merchant).toBe('Biedronka');
  });

  it('breaks an exact tie by merchant name, so the answer is deterministic', () => {
    const visits = [
      visit('Zabka', 0.0001), visit('Zabka', 0.0001),
      visit('Aldi', 0.0001), visit('Aldi', 0.0001),
    ];

    const first = findNearbyStore({ coords: HERE, visits });
    const second = findNearbyStore({ coords: HERE, visits: [...visits].reverse() });

    expect(first?.merchant).toBe('Aldi');
    expect(second?.merchant).toBe(first?.merchant);
  });

  it('skips null island rather than treating it as a real position', () => {
    // (0,0) is what an undecryptable tier-2 row's zeroed plaintext looks like.
    const visits: StoreVisit[] = [
      { merchant: 'Ghost', lat: 0, lng: 0 },
      { merchant: 'Ghost', lat: 0, lng: 0 },
    ];

    expect(findNearbyStore({ coords: { lat: 0, lng: 0 }, visits })).toBeNull();
  });

  it('returns null for an empty visit list', () => {
    expect(findNearbyStore({ coords: HERE, visits: [] })).toBeNull();
  });

  it('ignores a visit whose coordinates are not finite', () => {
    const visits: StoreVisit[] = [
      { merchant: 'Broken', lat: Number.NaN, lng: 21.0122 },
      { merchant: 'Broken', lat: 52.2297, lng: Number.NaN },
    ];

    expect(findNearbyStore({ coords: HERE, visits })).toBeNull();
  });

  it('matches merchants case-insensitively, so BIEDRONKA and Biedronka are one shop', () => {
    const visits = [visit('BIEDRONKA'), visit('biedronka', 0.0001)];

    expect(findNearbyStore({ coords: HERE, visits })?.merchant).toBe('BIEDRONKA');
  });

  it('defaults to a 150 m radius and a 2-visit floor', () => {
    expect(NEARBY_STORE_DEFAULTS).toEqual({ radiusM: 150, minVisits: 2 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/mobile && npx jest src/features/stores/`
Expected: FAIL — `Cannot find module '../findNearbyStore'`.

- [ ] **Step 3: Write the implementation**

Create `apps/mobile/src/features/stores/findNearbyStore.ts`:

```ts
export interface StoreVisit {
  merchant: string;
  lat: number;
  lng: number;
}

export interface NearbyStore {
  merchant: string;
  distanceM: number;
}

export interface NearbyStoreConfig {
  /** How close counts as "at" the shop. */
  radiusM: number;
  /** Coordinate-bearing visits before a merchant counts as a shop at all. */
  minVisits: number;
}

export const NEARBY_STORE_DEFAULTS: NearbyStoreConfig = { radiusM: 150, minVisits: 2 };

const EARTH_RADIUS_M = 6_371_000;
const toRad = (d: number): number => (d * Math.PI) / 180;

/**
 * Great-circle distance in metres.
 *
 * This is a SECOND copy: the existing one is a private, unexported function
 * inside `apps/api/src/modules/price-history/basket-calculator.ts`, and mobile
 * cannot import from the API at all. Extracting it to shared-utils was
 * considered and rejected — the API cannot import runtime values from there
 * (no build step for workspace packages, and a pre-deploy script fails the
 * build over it), so "sharing" would mean the same hand-maintained duplicated
 * pair as `financial-month.ts` for a five-line formula.
 */
function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Null island: the zeroed plaintext of an undecryptable tier-2 row, not a place. */
const isRealPoint = (p: { lat: number; lng: number }): boolean =>
  Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0);

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * The shop the user is standing in, if it is one they have bought from before.
 *
 * Pure: no I/O, no clock, no store reads — so the decision can be tested
 * without a device. The caller flattens expenses into `visits`, keeping this
 * function free of the two shapes an expense's position takes in this codebase
 * (a nested `location` object and flat `locationLat`/`locationLng` columns).
 */
export function findNearbyStore(params: {
  coords: { lat: number; lng: number };
  visits: StoreVisit[];
  config?: NearbyStoreConfig;
}): NearbyStore | null {
  const { coords, visits } = params;
  const config = params.config ?? NEARBY_STORE_DEFAULTS;

  if (!isRealPoint(coords)) return null;

  // Group case-insensitively, but keep the first spelling seen for display —
  // "BIEDRONKA" off a bank import and "Biedronka" off a receipt are one shop.
  const groups = new Map<string, { display: string; lats: number[]; lngs: number[] }>();
  for (const v of visits) {
    const name = v.merchant?.trim();
    if (!name || !isRealPoint(v)) continue;
    const key = name.toLowerCase();
    const group = groups.get(key) ?? { display: name, lats: [], lngs: [] };
    group.lats.push(v.lat);
    group.lngs.push(v.lng);
    groups.set(key, group);
  }

  let best: NearbyStore | null = null;
  // Sorted so an exact distance tie resolves by name rather than by insertion
  // order — the same determinism convention as buildCategorySplits.
  for (const key of Array.from(groups.keys()).sort()) {
    const group = groups.get(key)!;
    if (group.lats.length < config.minVisits) continue;

    const centre = { lat: median(group.lats), lng: median(group.lngs) };
    const distanceM = haversineM(coords, centre);
    if (distanceM > config.radiusM) continue;
    if (!best || distanceM < best.distanceM) {
      best = { merchant: group.display, distanceM: Math.round(distanceM) };
    }
  }

  return best;
}
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/mobile && npx jest src/features/stores/ && npx tsc --noEmit`
Expected: PASS, 11 tests; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/stores
git commit -m "feat(stores): pure nearby-store matching from the user's own geotags"
```

---

### Task 2: The hook that supplies the position

**Files:**
- Create: `apps/mobile/src/hooks/useNearbyStore.ts`

**Interfaces:**
- Consumes: `findNearbyStore`, `StoreVisit` (Task 1); `captureCurrentLocation` from `@/services/locationCapture`; `useExpenseStore`.
- Produces: `useNearbyStore(): NearbyStore | null`

- [ ] **Step 1: Write the hook**

Create `apps/mobile/src/hooks/useNearbyStore.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useExpenseStore } from '@/stores/expenseStore';
import { captureCurrentLocation } from '@/services/locationCapture';
import { findNearbyStore, type NearbyStore, type StoreVisit } from '@/features/stores/findNearbyStore';

/** GPS is not free; a return to the home tab should not re-acquire it. */
const POSITION_TTL_MS = 5 * 60 * 1000;

/**
 * The shop the user is standing in, or null.
 *
 * Deliberately calls `captureCurrentLocation()` WITHOUT `force`, so the
 * Settings → Data opt-in (default OFF) governs it: a user who declined
 * location is never silently located for this. That helper already returns
 * null on denial, on a 4-second timeout, and on any thrown error, so every
 * failure path here simply yields no card.
 */
export function useNearbyStore(): NearbyStore | null {
  const expenses = useExpenseStore((s) => s.expenses);
  const [nearby, setNearby] = useState<NearbyStore | null>(null);
  const cached = useRef<{ at: number; coords: { lat: number; lng: number } } | null>(null);

  const check = useCallback(async () => {
    let coords = cached.current && Date.now() - cached.current.at < POSITION_TTL_MS
      ? cached.current.coords
      : null;

    if (!coords) {
      const captured = await captureCurrentLocation();
      if (!captured) { setNearby(null); return; }
      coords = { lat: captured.lat, lng: captured.lng };
      cached.current = { at: Date.now(), coords };
    }

    // Flatten here, not in the pure function: an expense carries its position
    // either as a nested `location` object (rebuilt by the pull merge) or as
    // flat `locationLat`/`locationLng` columns straight from the API.
    const visits: StoreVisit[] = [];
    for (const e of expenses) {
      const merchant = e.merchant?.trim();
      if (!merchant) continue;
      const lat = e.location?.lat ?? e.locationLat;
      const lng = e.location?.lng ?? e.locationLng;
      if (typeof lat !== 'number' || typeof lng !== 'number') continue;
      visits.push({ merchant, lat, lng });
    }

    setNearby(findNearbyStore({ coords, visits }));
  }, [expenses]);

  useFocusEffect(useCallback(() => { void check(); }, [check]));

  // Re-evaluate when the expense list changes while the screen is already
  // focused — a just-saved expense can make this shop known.
  useEffect(() => { void check(); }, [check]);

  return nearby;
}
```

- [ ] **Step 2: Verify**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/hooks/useNearbyStore.ts
git commit -m "feat(stores): supply the current position to nearby-store matching"
```

---

### Task 3: The widget

**Files:**
- Create: `apps/mobile/src/components/widgets/StoreArrivalWidget.tsx`
- Modify: `apps/mobile/src/stores/widgetVisibilityStore.ts` (add the key)
- Modify: `apps/mobile/src/components/home/HomeWidgetSwitch.tsx` (add the case)
- Modify: `apps/mobile/app/settings/widgets.tsx` (add the label — the `Record<WidgetKey, string>` map is exhaustive, so a missing entry is a typecheck failure)
- Modify: all 9 files in `apps/mobile/src/i18n/locales/`

**Interfaces:**
- Consumes: `useNearbyStore` (Task 2); `useShoppingListStore` for the unchecked items; `useSafeToSpend` for today's figure.
- Produces: the `'storeArrival'` `WidgetKey`.

- [ ] **Step 1: Add the widget key**

In `apps/mobile/src/stores/widgetVisibilityStore.ts`, add `'storeArrival'` to `WIDGET_KEYS`. Put it **first** — when it renders at all it is the most time-critical thing on the screen, and the rest of the time it renders nothing.

No migration is needed, and the position genuinely matters: `loadOrder` does not append a key it has not seen before, it *splices it in at its `WIDGET_KEYS` index* — the code comments say this exists precisely so a new high-priority widget reaches the top for existing users rather than the bottom. `loadVisibility` defaults an unseen key to `true`. So adding it at index 0 puts it first for everyone, including users with a saved custom order.

- [ ] **Step 2: Build the widget**

Create `apps/mobile/src/components/widgets/StoreArrivalWidget.tsx`, following the conventions of the widgets already in that folder (a `createStyles(theme)` factory, a `Card`-shaped container, `useTranslation`).

Behaviour:

```tsx
const nearby = useNearbyStore();
if (!nearby) return null;   // not at a known shop — nothing at all, no empty card
```

Content when it renders:
- Heading: `t('storeArrival.title', { merchant: nearby.merchant })` — "You're at Biedronka".
- The unchecked items of the active shopping list, capped at 5 with a "+N more" line. If the list is empty, this block is omitted entirely rather than showing an empty state.
- Today's safe-to-spend figure, formatted with the app's existing money formatter.
- The whole card is a `TouchableOpacity` that pushes `/shopping-list`.

- [ ] **Step 3: Register the case**

In `apps/mobile/src/components/home/HomeWidgetSwitch.tsx`, add beside the others:

```tsx
    case 'storeArrival':
      return widgetVisibility.storeArrival ? <StoreArrivalWidget key="storeArrival" /> : null;
```

- [ ] **Step 4: Add the settings label**

In `apps/mobile/app/settings/widgets.tsx`, add `storeArrival: t('storeArrival.title')` to the `widgetLabels` map — but note that key takes a `merchant` interpolation, so use a separate plain label key (`storeArrival.widgetLabel`, e.g. "At the shop") rather than the interpolated title.

- [ ] **Step 5: Add the i18n keys to all 9 locales**

Under a new `storeArrival` object: `title` ("You're at {{merchant}}"), `widgetLabel` ("At the shop"), `listHeading` ("Still on your list"), `moreItems` ("+{{count}} more"), `safeToSpend` ("Safe to spend today"). Real translations in all nine.

- [ ] **Step 6: Verify**

Run: `cd apps/mobile && npx tsc --noEmit && npx jest src/features/ src/stores/`
Expected: clean; suites green. The exhaustive `Record<WidgetKey, string>` means a forgotten label fails the typecheck rather than shipping.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/components/widgets/StoreArrivalWidget.tsx apps/mobile/src/components/home/HomeWidgetSwitch.tsx apps/mobile/src/stores/widgetVisibilityStore.ts apps/mobile/app/settings/widgets.tsx apps/mobile/src/i18n/locales
git commit -m "feat(stores): show the store arrival card on the home screen"
```

---

### Task 4: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `user_docs/<lang>/` — the shopping-list or dashboard section, all 9 languages
- Run: `npm run generate:help`

- [ ] **Step 1: Document in CLAUDE.md**

A bullet covering: foreground-only and why the geofenced version is deferred; that the opt-in toggle governs it via a `force`-less `captureCurrentLocation()` call; that store coordinates come from the user's own geotags because the community read is kill-switched off; median-not-mean and the visit floor; and that the haversine is a deliberate second copy, with the reason.

- [ ] **Step 2: Update the user docs**

Describe the card in all 9 languages — what it shows, and that it requires the location toggle. Then run `npm run generate:help` from the project root. Never hand-edit `apps/mobile/src/help/content.ts`.

- [ ] **Step 3: Full check**

Run: `npm run typecheck && npm run test`
Expected: PASS. `npm run lint` fails on a pre-existing unrelated issue in `apps/admin/src/app/users/page.tsx` — ignore that one, report anything else.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md user_docs apps/mobile/src/help/content.ts
git commit -m "docs: store arrival card"
```

The controller creates the `ABA-{N}` issue — not the task implementer.

---

## Self-Review

**Spec coverage.** Foreground-only and no new permission → Global Constraints, implemented nowhere. Opt-in governs it → Task 2's `force`-less call. Own geotags as the source → Task 2's flattening. Median-not-mean, visit floor, radius, null island, tie determinism → Task 1 and its tests. Card content (list + safe-to-spend, no "you usually spend X") → Task 3 Step 2. Home widget rather than modal → Task 3. Second haversine with its justification → Task 1 Step 3's comment and Task 4's bullet. Non-goals (geofencing, push, server change, community prices, per-branch clustering) appear as constraints and are implemented nowhere.

**Known softness.** Task 3 describes the widget's layout in prose rather than giving its JSX, because it must match the conventions of the widgets already in that folder — better copied at the keyboard than transcribed here. Its *behaviour* (render nothing when there is no match; omit the list block when empty) is stated literally. Task 4's copy is described rather than written, as nine languages of prose do not belong in a plan.

**Type consistency.** `StoreVisit`'s three fields and `NearbyStore`'s two are named identically in Task 1's implementation, its tests, and Task 2's call site. `findNearbyStore` takes `{ coords, visits, config? }` at both its definition and its only call. `NEARBY_STORE_DEFAULTS` is asserted in Task 1's last test with the same values the implementation declares. The widget key `'storeArrival'` is spelled identically in Tasks 3's four registration points.
