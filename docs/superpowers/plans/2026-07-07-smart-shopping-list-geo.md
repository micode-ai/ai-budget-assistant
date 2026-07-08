# Smart Shopping List — Geo "Cheaper Nearby" (M4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add store distance to the basket comparison (derived from where you've shopped) and a map of candidate stores with basket totals, so a user can pick the cheapest store that's actually near them.

**Architecture:** Store coordinates are derived server-side from the most-recent geo-tagged expense per merchant. `computeBasket` gains optional `storeCoords`/`origin` params and fills the already-reserved `distanceKm`/`nearby` (+ new `lat`/`lng`) on each store via haversine. The mobile map screen reuses the generic `ExpenseMapView` (plots any `{id,lat,lng,title,amountLabel}` points) fed by a `buildStoreMapPoints` helper; live GPS via the existing `captureCurrentLocation({force:true})`.

**Tech Stack:** NestJS + Prisma + Jest (API); Expo/RN WebView-Leaflet map + expo-location (mobile).

## Global Constraints

- The basket endpoint stays Pro-gated (`@RequireTier('pro')`). The mobile Pro-gate lives in the store's `compareBasket` (unchanged) — the map screen calls the same action.
- `computeBasket`'s new params are APPENDED positionally (`now` stays the 3rd arg) so the existing 11 tests + `getBasketComparison(rows, items)` call keep working unchanged.
- `merchant` is a plain indexed column (not encrypted) — server-side grouping by merchant is safe. Store coords come from the user's OWN expenses (their data) — safe to return to their own client.
- `(0,0)` = "null island" (zeroed E2EE plaintext) — treated as no-location everywhere (skip in coord derivation AND in `buildStoreMapPoints`), mirroring `buildExpenseMapPoints`.
- Live GPS is an explicit user action → `requestLocationPermission()` then `captureCurrentLocation({ force: true })` (bypasses the silent-capture opt-in, still needs OS permission); web → null (no map GPS).
- `ExpenseMapView.tsx`/`.web.tsx` are NOT modified — they already accept arbitrary labeled points. Only a new `buildStoreMapPoints` helper + a new screen.
- New screens register a header in `_layout.tsx`. New i18n keys in all 9 locales.

---

### Task 1: Shared types — store lat/lng on BasketStoreResult

**Files:**
- Modify: `packages/shared-types/src/dto/price-history.ts`

- [ ] **Step 1: Add `lat`/`lng`**

In `BasketStoreResult` (which already has `distanceKm?`/`nearby?`), add:

```ts
  lat?: number;   // store coordinates (from your geo-tagged expenses); M4
  lng?: number;
```

- [ ] **Step 2: Typecheck + commit**

Run: `cd packages/shared-types && npx tsc --noEmit` → PASS.
```bash
git add packages/shared-types/src/dto/price-history.ts
git commit -m "feat(shared-types): store lat/lng on BasketStoreResult"
```

---

### Task 2: basket-calculator — haversine distance + coords

**Files:**
- Modify: `apps/api/src/modules/price-history/basket-calculator.ts`
- Modify: `apps/api/src/modules/price-history/basket-calculator.spec.ts`

**Interfaces:**
- Produces: `computeBasket(rows, basket, now?, storeCoords?, origin?, nearbyRadiusKm?)` — appended optional params; each `BasketStoreResult` gains `lat`/`lng` (when the store has coords) and `distanceKm`/`nearby` (when both coords and origin are present).

- [ ] **Step 1: Write the failing tests** (append to `basket-calculator.spec.ts`)

```ts
describe('computeBasket geo', () => {
  it('sets lat/lng, distanceKm and nearby when store coords + origin are given', () => {
    const rows = [row('Milk', 'Lidl', 2.5)];
    const coords = new Map([['Lidl', { lat: 52.23, lng: 21.01 }]]);
    const origin = { lat: 52.24, lng: 21.02 }; // ~1.3 km away
    const res = computeBasket(rows, [{ canonicalName: 'Milk', quantity: 1 }], NOW, coords, origin);
    const s = res.stores[0];
    expect(s.lat).toBe(52.23);
    expect(s.lng).toBe(21.01);
    expect(s.distanceKm).toBeGreaterThan(0);
    expect(s.distanceKm).toBeLessThan(5);
    expect(s.nearby).toBe(true);
  });

  it('marks a far store as not nearby', () => {
    const rows = [row('Milk', 'FarStore', 2.5)];
    const coords = new Map([['FarStore', { lat: 50.06, lng: 19.94 }]]); // Kraków
    const origin = { lat: 52.23, lng: 21.01 }; // Warsaw, ~250 km
    const res = computeBasket(rows, [{ canonicalName: 'Milk', quantity: 1 }], NOW, coords, origin);
    expect(res.stores[0].nearby).toBe(false);
    expect(res.stores[0].distanceKm).toBeGreaterThan(100);
  });

  it('sets lat/lng but leaves distance undefined when no origin', () => {
    const rows = [row('Milk', 'Lidl', 2.5)];
    const coords = new Map([['Lidl', { lat: 52.23, lng: 21.01 }]]);
    const res = computeBasket(rows, [{ canonicalName: 'Milk', quantity: 1 }], NOW, coords);
    expect(res.stores[0].lat).toBe(52.23);
    expect(res.stores[0].distanceKm).toBeUndefined();
    expect(res.stores[0].nearby).toBeUndefined();
  });

  it('leaves geo fields undefined when the store has no coords', () => {
    const rows = [row('Milk', 'Unknown', 2.5)];
    const origin = { lat: 52.23, lng: 21.01 };
    const res = computeBasket(rows, [{ canonicalName: 'Milk', quantity: 1 }], NOW, new Map(), origin);
    expect(res.stores[0].lat).toBeUndefined();
    expect(res.stores[0].distanceKm).toBeUndefined();
  });

  it('ignores a (0,0) null-island store coord', () => {
    const rows = [row('Milk', 'Lidl', 2.5)];
    const coords = new Map([['Lidl', { lat: 0, lng: 0 }]]);
    const origin = { lat: 52.23, lng: 21.01 };
    const res = computeBasket(rows, [{ canonicalName: 'Milk', quantity: 1 }], NOW, coords, origin);
    expect(res.stores[0].lat).toBeUndefined();
    expect(res.stores[0].distanceKm).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd apps/api && npx jest src/modules/price-history/basket-calculator.spec.ts -t "computeBasket geo"`
Expected: FAIL.

- [ ] **Step 3: Implement**

Change the signature and add the haversine helper + per-store geo. Update `computeBasket`'s signature to:

```ts
export function computeBasket(
  rows: BasketRow[],
  basket: BasketCompareItem[],
  now: Date = new Date(),
  storeCoords?: Map<string, { lat: number; lng: number }>,
  origin?: { lat: number; lng: number },
  nearbyRadiusKm = 5,
): BasketCompareResponse {
```

At the point where each store object is pushed, compute geo and include the 4 optional fields:

```ts
    const coords = storeCoords?.get(merchant);
    let lat: number | undefined;
    let lng: number | undefined;
    let distanceKm: number | undefined;
    let nearby: boolean | undefined;
    if (coords && !(coords.lat === 0 && coords.lng === 0)) {
      lat = coords.lat;
      lng = coords.lng;
      if (origin) {
        distanceKm = Math.round(haversineKm(origin, coords) * 10) / 10;
        nearby = distanceKm <= nearbyRadiusKm;
      }
    }
    stores.push({
      merchantName: merchant,
      estimatedTotal: Math.round(estimatedTotal * 100) / 100,
      coveredItems: covered,
      totalItems,
      missingItems,
      hasStale,
      isCheapest: false,
      lat,
      lng,
      distanceKm,
      nearby,
    });
```

Add at the bottom of the file (next to `majorityCurrency`):

```ts
function toRad(d: number): number {
  return (d * Math.PI) / 180;
}
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
```

- [ ] **Step 4: Run all basket-calculator tests**

Run: `cd apps/api && npx jest src/modules/price-history/basket-calculator.spec.ts`
Expected: PASS (existing 11 + 5 new = 16).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/price-history/basket-calculator.ts apps/api/src/modules/price-history/basket-calculator.spec.ts
git commit -m "feat(price-history): per-store distance/nearby via haversine in computeBasket"
```

---

### Task 3: Service + endpoint — derive store coords + accept origin

**Files:**
- Modify: `apps/api/src/modules/price-history/price-history.service.ts` (`fetchRows` select + `RawItemRow` + `getBasketComparison`)
- Modify: `apps/api/src/modules/price-history/dto/index.ts` (`BasketCompareRequestDto` += lat/lng)
- Modify: `apps/api/src/modules/price-history/price-history.controller.ts` (pass origin)
- Modify: `apps/api/src/modules/price-history/price-history.service.spec.ts` (add a case)

- [ ] **Step 1: Write the failing service test**

Add to `price-history.service.spec.ts` (mock two same-store rows, one with location, plus an origin):

```ts
it('getBasketComparison returns store coords + distance when an origin is given', async () => {
  (prisma.productAlias.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.expenseItem.findMany as jest.Mock).mockResolvedValue([
    { id: '1', canonicalName: 'Milk', unitPrice: 2.5, quantity: 1, totalPrice: 2.5,
      expense: { date: new Date('2026-07-01'), merchant: 'Lidl', currencyCode: 'PLN', locationLat: 52.23, locationLng: 21.01 } },
  ]);
  const res = await service.getBasketComparison('acc-1', [{ canonicalName: 'Milk', quantity: 1 }], { lat: 52.24, lng: 21.02 });
  expect(res.stores[0].lat).toBe(52.23);
  expect(res.stores[0].distanceKm).toBeGreaterThan(0);
  expect(res.stores[0].nearby).toBe(true);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd apps/api && npx jest src/modules/price-history/price-history.service.spec.ts -t "store coords"`
Expected: FAIL.

- [ ] **Step 3: Extend `fetchRows` + `RawItemRow`**

In `price-history.service.ts`, extend the `RawItemRow` interface with `locationLat?: number | null; locationLng?: number | null;`. In `fetchRows`, add `locationLat: true, locationLng: true` to the `expense` `select`, and in the map body set `locationLat: item.expense.locationLat != null ? Number(item.expense.locationLat) : null` (same for lng).

- [ ] **Step 4: Extend `getBasketComparison`**

```ts
  async getBasketComparison(
    accountId: string,
    items: BasketCompareItem[],
    origin?: { lat: number; lng: number },
  ): Promise<BasketCompareResponse> {
    const rows = await this.fetchRows(accountId);
    // Most-recent geo-tagged expense per merchant → store coords
    const storeCoords = new Map<string, { lat: number; lng: number; date: Date }>();
    for (const r of rows) {
      if (r.locationLat == null || r.locationLng == null) continue;
      const cur = storeCoords.get(r.merchant);
      if (!cur || r.date > cur.date) storeCoords.set(r.merchant, { lat: r.locationLat, lng: r.locationLng, date: r.date });
    }
    const coordMap = new Map([...storeCoords].map(([m, c]) => [m, { lat: c.lat, lng: c.lng }]));
    return computeBasket(rows as unknown as BasketRow[], items, new Date(), coordMap, origin);
  }
```

- [ ] **Step 5: DTO + controller**

In `dto/index.ts` `BasketCompareRequestDto` add `@IsOptional() @IsNumber() lat?: number;` and `@IsOptional() @IsNumber() lng?: number;` (import `IsOptional` if needed). In the controller:

```ts
  compareBasket(@Req() req: AuthenticatedRequest, @Body() dto: BasketCompareRequestDto) {
    const origin = dto.lat != null && dto.lng != null ? { lat: dto.lat, lng: dto.lng } : undefined;
    return this.priceHistoryService.getBasketComparison(req.accountId, dto.items, origin);
  }
```

- [ ] **Step 6: Run test + typecheck**

Run: `cd apps/api && npx jest src/modules/price-history/price-history.service.spec.ts -t "store coords"` → PASS.
Run: `cd apps/api && npx tsc --noEmit` → PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/price-history
git commit -m "feat(price-history): derive store coords + accept origin for basket distance"
```

---

### Task 4: Mobile — origin-aware compareBasket + api

**Files:**
- Modify: `apps/mobile/src/services/shoppingLists.api.ts` (`compareBasket(items, origin?)`)
- Modify: `apps/mobile/src/stores/shoppingListStore.ts` (`compareBasket(origin?)`)

- [ ] **Step 1: API client**

```ts
compareBasket(items: BasketCompareItem[], origin?: { lat: number; lng: number }) {
  return httpClient.request<BasketCompareResponse>('/price-history/basket', {
    method: 'POST',
    body: JSON.stringify({ items, ...(origin ? { lat: origin.lat, lng: origin.lng } : {}) }),
  });
},
```

- [ ] **Step 2: Store action**

Change `compareBasket` to accept an optional `origin?: { lat: number; lng: number }` and pass it to `api.compareBasket(items, origin)`. The Pro-gate + item-building logic is unchanged. (`compare.tsx` still calls `compareBasket()` = no origin = price sort; the map screen calls `compareBasket(origin)`.)

- [ ] **Step 3: Typecheck + commit**

Run: `cd apps/mobile && npx tsc --noEmit` → PASS.
```bash
git add apps/mobile/src/services/shoppingLists.api.ts apps/mobile/src/stores/shoppingListStore.ts
git commit -m "feat(mobile): origin-aware basket compare"
```

---

### Task 5: Mobile — map screen + buildStoreMapPoints + entry point

**Files:**
- Create: `apps/mobile/src/components/map/buildStoreMapPoints.ts`
- Test: `apps/mobile/src/components/map/__tests__/buildStoreMapPoints.test.ts`
- Create: `apps/mobile/app/shopping-list/map.tsx`
- Modify: `apps/mobile/app/_layout.tsx` (register the header)
- Modify: `apps/mobile/app/shopping-list/compare.tsx` (a "Map" entry point in the header)

- [ ] **Step 1: Write the failing helper test**

```ts
// apps/mobile/src/components/map/__tests__/buildStoreMapPoints.test.ts
import { buildStoreMapPoints } from '../buildStoreMapPoints';

describe('buildStoreMapPoints', () => {
  it('maps stores with coords to points and skips those without / null-island', () => {
    const { points } = buildStoreMapPoints([
      { merchantName: 'Lidl', estimatedTotal: 12.5, lat: 52.2, lng: 21.0, coveredItems: 3, totalItems: 3, missingItems: [], hasStale: false, isCheapest: true },
      { merchantName: 'NoGeo', estimatedTotal: 9, coveredItems: 2, totalItems: 3, missingItems: [], hasStale: false, isCheapest: false },
      { merchantName: 'Null', estimatedTotal: 5, lat: 0, lng: 0, coveredItems: 1, totalItems: 3, missingItems: [], hasStale: false, isCheapest: false },
    ] as any, 'PLN');
    expect(points.map((p) => p.id)).toEqual(['Lidl']);
    expect(points[0].title).toBe('Lidl');
    expect(points[0].amountLabel).toContain('12.5');
  });
});
```

- [ ] **Step 2: Run to verify fail** → `cd apps/mobile && npx jest src/components/map/__tests__/buildStoreMapPoints.test.ts` → FAIL.

- [ ] **Step 3: Implement `buildStoreMapPoints`** (mirror `buildExpenseMapPoints`)

```ts
// apps/mobile/src/components/map/buildStoreMapPoints.ts
import type { BasketStoreResult } from '@budget/shared-types';
import { formatCurrency } from '@budget/shared-utils';
import type { ExpenseMapPoint } from './buildMapPoints';

export function buildStoreMapPoints(
  stores: BasketStoreResult[],
  currency: string,
): { points: ExpenseMapPoint[]; missingCount: number } {
  const points: ExpenseMapPoint[] = [];
  let missingCount = 0;
  for (const s of stores) {
    if (s.lat == null || s.lng == null || (s.lat === 0 && s.lng === 0)) {
      missingCount++;
      continue;
    }
    const dist = s.distanceKm != null ? ` · ${s.distanceKm} km` : '';
    points.push({
      id: s.merchantName,
      lat: s.lat,
      lng: s.lng,
      title: s.merchantName,
      amountLabel: `${formatCurrency(s.estimatedTotal, currency)}${dist}`,
    });
  }
  return { points, missingCount };
}
```
(NOTE: confirm `formatCurrency` is importable in the mobile bundle from `@budget/shared-utils`; if the map components use a local formatter instead, use that — check `buildMapPoints.ts`'s import.)

- [ ] **Step 4: Run test** → PASS.

- [ ] **Step 5: Build the map screen** `app/shopping-list/map.tsx`

Mirror `app/(tabs)/expenses.tsx`'s map mode + `app/expense/location.tsx`'s GPS:
- Inline `<Stack.Screen options={{ title: t('shoppingList.mapTitle') }} />`.
- On mount: `requestLocationPermission()` → `const origin = await captureCurrentLocation({ force: true })` → `compareBasket(origin ?? undefined)` (store action). If `origin` is null (web/denied), still `compareBasket()` (no distance — stores plot without distance labels).
- Read `basketResult` + `isComparing` from the store. `const { points, missingCount } = buildStoreMapPoints(basketResult?.stores ?? [], basketResult?.currency ?? 'PLN')`.
- A "cheapest / nearby" toggle pill: sorts the underlying store list client-side by `estimatedTotal` vs `distanceKm` (nearby mode filters to `nearby === true` when any exist) before building points — OR just re-orders the info list below the map; the map itself shows all points.
- `<ExpenseMapView points={points} openLabel={t('map.open')} center={origin ? { lat: origin.lat, lng: origin.lng, zoom: 12 } : undefined} onPointPress={() => {}} style={styles.map} />`.
- Below the map: a compact ranked list of stores (name, total, distance, cheapest badge) — reuse the compare screen's store-card rendering style.
- `isComparing` → spinner; `points.length === 0` → `t('shoppingList.noStoreLocations')` empty state; a `missingCount` note when some stores lack coords.
- Pro-gate is enforced by the store (paywall appears over the screen for non-Pro).

- [ ] **Step 6: Register the header** in `_layout.tsx`:

```tsx
<Stack.Screen name="shopping-list/map" options={{ headerShown: true, title: t('shoppingList.mapTitle') }} />
```

- [ ] **Step 7: Entry point** — in `app/shopping-list/compare.tsx`, add a header-right "Map" button (`headerRight` on its inline `<Stack.Screen>`) → `router.push('/shopping-list/map')` (only meaningful once results exist; the map screen re-runs compare itself).

- [ ] **Step 8: Typecheck + lint + commit**

Run: `cd apps/mobile && npx tsc --noEmit` → PASS. Lint clean on new files.
```bash
git add apps/mobile/src/components/map/buildStoreMapPoints.ts apps/mobile/src/components/map/__tests__/buildStoreMapPoints.test.ts apps/mobile/app/shopping-list/map.tsx apps/mobile/app/_layout.tsx apps/mobile/app/shopping-list/compare.tsx
git commit -m "feat(mobile): shopping-list store map (cheaper nearby)"
```

---

### Task 6: Mobile i18n

**Files:**
- Modify: all 9 `apps/mobile/src/i18n/locales/*.ts`

- [ ] **Step 1: Add keys to `en.ts`** (under `shoppingList`): `mapTitle: 'Store map'`, `sortCheapest: 'Cheapest'`, `sortNearby: 'Nearby'`, `noStoreLocations: 'No store locations yet — your stores appear here once receipts have addresses'`, `findNearby: 'Find nearby'`, `distanceKm: '{{km}} km away'`.
- [ ] **Step 2: Propagate to the other 8 locales** (genuine translations, preserve `{{km}}`) via the `i18n-add-strings` skill. Verify all 9 files have the 6 keys.
- [ ] **Step 3: Typecheck + commit**

Run: `cd apps/mobile && npx tsc --noEmit` → PASS.
```bash
git add apps/mobile/src/i18n/locales
git commit -m "feat(mobile): store-map i18n across 9 locales"
```

---

### Task 7: Final verification

- [ ] **Step 1:** `cd apps/api && npx tsc --noEmit && npx jest src/modules/price-history` — basket-calculator (16) + service suites green (the 2 known `computeInflationIndex` baseline failures may remain).
- [ ] **Step 2:** `cd apps/mobile && npx tsc --noEmit` → 0 errors; `npx jest` → new `buildStoreMapPoints` suite passes; only the known baseline failures otherwise.
- [ ] **Step 3:** `cd apps/api && npm run build` → succeeds.
- [ ] **Step 4:** i18n parity: all 9 mobile locales have the 6 new `shoppingList.*` keys.

---

## Self-Review

**Spec coverage (M4):**
- Per-store distance/nearby via haversine → Task 2. ✓
- Store coords from `locationLat/Lng` (most-recent per merchant) + origin plumbing → Task 3. ✓
- `lat/lng` on `BasketStoreResult` → Task 1. ✓
- Map screen on `ExpenseMapView` + live GPS + cheapest/nearby toggle → Task 5. ✓
- Origin-aware `compareBasket` → Task 4. ✓
- i18n 9 locales → Task 6. ✓

**Placeholder scan:** haversine + calculator + service have full code; the map screen is specced against concrete mirrors (`expenses.tsx` map mode + `location.tsx` GPS) with the non-obvious parts (origin fetch, buildStoreMapPoints, Pro-gate-via-store) explicit.

**Type consistency:** `computeBasket(rows, basket, now?, storeCoords?, origin?, radius?)` used identically in Task 2/3; `origin: {lat,lng}` threaded through service → controller → api → store; `BasketStoreResult.lat/lng` (Task 1) consumed by `buildStoreMapPoints` (Task 5).

## Roadmap — remaining
Plan 5 (M5 Multi-list UI) · Plan 6 (M6 Deals).
