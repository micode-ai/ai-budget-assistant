# Expense Geo-Location & Map View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expenses get coordinates (from OCR receipt addresses via server-side geocoding, opt-in device GPS at creation, or a manual map pin) and can be viewed on a clustered, clickable map — on the Expenses tab, the expense detail screen, and from the trip account screen.

**Architecture:** Server: a new `GeocodingService` (Nominatim + `geocode_cache` table, fail-silent) attaches `location` to the scan-receipt response; `ExpensesService` learns to persist/clear `locationName` alongside the existing `locationLat/Lng` columns. Mobile: a `locationCapture` service (expo-location, opt-in) feeds GPS into all live create paths; the location object flows through the existing (mostly dormant) plumbing in `expenseStore`/`expenseSync`/`expenseRepository`; the map is a WebView hosting an inlined Leaflet bundle (`ExpenseMapView`) — **zero new native modules**.

**Tech Stack:** NestJS 10 + Prisma 5 (API), Expo 54 / RN 0.81 (mobile), `expo-location` (new dep), `react-native-webview` 13.15.0 (existing dep), Leaflet 1.9 + leaflet.markercluster (build-time devDeps, inlined into a generated HTML asset), OSM raster tiles.

**Spec:** `docs/superpowers/specs/2026-07-03-expense-geolocation-map-design.md`

## Global Constraints

- **Never import runtime values from `@budget/shared-types`/`@budget/shared-utils` in `apps/api`** — type-only imports there (broke prod in ABA-252/253). `ENCRYPTION_FIELDS` is consumed by mobile only.
- **No new native modules** except `expo-location` (an Expo SDK package). `react-native-maps` is explicitly forbidden (Windows MAX_PATH / codegen risk — same reason keyboard-controller was removed).
- **i18n: ALL 9 locale files** (`en`, `de`, `es`, `fr`, `pl`, `ru`, `ua`, `be`, `nl`) must be updated together for every new key. ru/ua/be use `_one/_few/_many` plural suffixes; the others `_one/_other`.
- **New Expo Router screens must have a nav header** (title + back) registered in `app/_layout.tsx`.
- **Expected offline/geolocation failures log `console.warn`, never `console.error`** (RN LogBox renders `console.error` as a blocking red overlay).
- Commits in **English**. Commit locally; **never `git push` without explicit user approval**.
- Working branch: `development` (repo convention — commits go directly there).
- All commands below: PowerShell-compatible; repo root is `D:\Work\micode\ai-budget-assistant`.
- Prisma migration commands need the local dev Postgres running (`DATABASE_URL` in `apps/api/.env`).

## File Structure (created/modified)

**PR 1 — API (Tasks 1–5)**
- Modify: `apps/api/prisma/schema.prisma` (Expense.locationName, new GeocodeCache model)
- Create: `apps/api/src/modules/ai/services/geocoding.service.ts` + `.spec.ts`
- Modify: `apps/api/src/modules/ai/ai.module.ts` (register GeocodingService)
- Modify: `apps/api/src/modules/ai/services/ocr.service.ts` (+ its `.spec.ts`) — location on `ReceiptExpense`
- Create: `apps/api/src/modules/expenses/expense-location.util.ts` + `.spec.ts` (pure column mapper)
- Modify: `apps/api/src/modules/expenses/expenses.service.ts`, `apps/api/src/modules/expenses/dto/index.ts`
- Modify: `packages/shared-types/src/dto/sync.ts`, `packages/shared-types/src/entities/expense.ts`, `packages/shared-utils/src/constants/index.ts`

**PR 2 — Mobile capture (Tasks 6–11)**
- Modify: `apps/mobile/package.json` (expo-location), `apps/mobile/android/app/src/main/AndroidManifest.xml`, `apps/mobile/app.json`
- Create: `apps/mobile/src/stores/locationSettingsStore.ts`
- Create: `apps/mobile/src/services/locationCapture.ts` + `apps/mobile/src/services/__tests__/locationCapture.test.ts`
- Create: `apps/mobile/src/utils/location.ts` + `apps/mobile/src/utils/__tests__/location.test.ts`
- Modify: `apps/mobile/app/settings/data.tsx` (toggle), `apps/mobile/src/stores/expenseStore.ts`, `apps/mobile/src/stores/expenseSync.ts`, `apps/mobile/src/services/ai.api.ts`, `apps/mobile/src/features/receipt/useReceiptScanner.ts`, `apps/mobile/app/expense/receipt.tsx`, `apps/mobile/app/expense/new.tsx`, `apps/mobile/app/expense/voice.tsx`, `apps/mobile/src/services/notificationCapture/captureService.ts`
- Modify: all 9 files in `apps/mobile/src/i18n/locales/`

**PR 3 — Map UI (Tasks 12–19)**
- Create: `apps/mobile/scripts/build-map-html.js`, `apps/mobile/src/components/map/mapHtml.generated.ts` (committed generated file)
- Create: `apps/mobile/src/components/map/buildMapPoints.ts` + `apps/mobile/src/components/map/__tests__/buildMapPoints.test.ts`
- Create: `apps/mobile/src/components/map/ExpenseMapView.tsx` + `ExpenseMapView.web.tsx`
- Create: `apps/mobile/app/expense/components/LocationSection.tsx`, `apps/mobile/app/expense/location.tsx`
- Modify: `apps/mobile/app/(tabs)/expenses.tsx`, `apps/mobile/app/expense/[id].tsx`, `apps/mobile/app/account/[id].tsx`, `apps/mobile/app/_layout.tsx`
- Modify: all 9 locale files; `CLAUDE.md`

---

# PR 1 — API

### Task 1: Prisma schema — `Expense.locationName` + `geocode_cache`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

**Interfaces:**
- Produces: `Expense.locationName String?` column (`location_name`); Prisma model `GeocodeCache` → table `geocode_cache` with unique `queryNormalized`. Later tasks rely on `prisma.geocodeCache.findUnique/upsert` and `expense.locationName`.

- [ ] **Step 1: Add `locationName` to the Expense model**

In `apps/api/prisma/schema.prisma`, the Expense model (~line 393) currently has:

```prisma
  locationLat  Decimal? @map("location_lat") @db.Decimal(10, 8)
  locationLng  Decimal? @map("location_lng") @db.Decimal(11, 8)
```

Add directly below `locationLng`:

```prisma
  locationName String?  @map("location_name")
```

- [ ] **Step 2: Add the GeocodeCache model**

Append at the end of `schema.prisma` (after the last model):

```prisma
// Server-side geocoding cache (ABA — expense geo-location). Global, NOT account-scoped:
// an address resolves identically for everyone and no user data is stored.
// Rows with lat/lng = NULL are NEGATIVE cache entries ("address not found") so
// unfindable addresses are never re-queried against Nominatim.
model GeocodeCache {
  id              String   @id @default(uuid())
  queryNormalized String   @unique @map("query_normalized")
  lat             Decimal? @db.Decimal(10, 8)
  lng             Decimal? @db.Decimal(11, 8)
  displayName     String?  @map("display_name")
  createdAt       DateTime @default(now()) @map("created_at")

  @@map("geocode_cache")
}
```

- [ ] **Step 3: Create the migration and regenerate the client**

Run from `apps/api/`:

```powershell
npx prisma migrate dev --name add_expense_location_name_and_geocode_cache
npx prisma generate
```

Expected: a new folder `apps/api/prisma/migrations/<timestamp>_add_expense_location_name_and_geocode_cache/` containing `ALTER TABLE "expenses" ADD COLUMN "location_name" TEXT;` and `CREATE TABLE "geocode_cache" ...`; `prisma generate` exits 0.

- [ ] **Step 4: Commit**

```powershell
git add apps/api/prisma
git commit -m "feat(api): add expense location_name column and geocode_cache table"
```

---

### Task 2: `GeocodingService` (TDD)

**Files:**
- Create: `apps/api/src/modules/ai/services/geocoding.service.ts`
- Create: `apps/api/src/modules/ai/services/geocoding.service.spec.ts`
- Modify: `apps/api/src/modules/ai/ai.module.ts`

**Interfaces:**
- Consumes: `prisma.geocodeCache` (Task 1).
- Produces: `GeocodingService.geocode(address: string): Promise<GeocodeResult | null>` where `GeocodeResult = { lat: number; lng: number; displayName: string | null }`; exported pure helper `normalizeGeocodeQuery(address: string | null | undefined): string | null`. Task 3 injects this service.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/modules/ai/services/geocoding.service.spec.ts`:

```ts
import { GeocodingService, normalizeGeocodeQuery } from './geocoding.service';

describe('normalizeGeocodeQuery', () => {
  it('trims, collapses whitespace, lowercases', () => {
    expect(normalizeGeocodeQuery('  ul.  Marszałkowska 10,\n Warszawa ')).toBe(
      'ul. marszałkowska 10, warszawa',
    );
  });

  it('returns null for empty / null / too-short input', () => {
    expect(normalizeGeocodeQuery(null)).toBeNull();
    expect(normalizeGeocodeQuery(undefined)).toBeNull();
    expect(normalizeGeocodeQuery('   ')).toBeNull();
    expect(normalizeGeocodeQuery('ab')).toBeNull();
  });
});

describe('GeocodingService.geocode', () => {
  let prisma: {
    geocodeCache: { findUnique: jest.Mock; upsert: jest.Mock };
  };
  let service: GeocodingService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    prisma = {
      geocodeCache: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    service = new GeocodingService(prisma as any);
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
  });

  it('returns null for empty address without touching cache or network', async () => {
    expect(await service.geocode('  ')).toBeNull();
    expect(prisma.geocodeCache.findUnique).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns cached coordinates without a network call', async () => {
    prisma.geocodeCache.findUnique.mockResolvedValue({
      lat: '52.2297', lng: '21.0122', displayName: 'Warszawa',
    });
    const result = await service.geocode('Marszałkowska 10, Warszawa');
    expect(result).toEqual({ lat: 52.2297, lng: 21.0122, displayName: 'Warszawa' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('negative cache hit (null lat) returns null without a network call', async () => {
    prisma.geocodeCache.findUnique.mockResolvedValue({ lat: null, lng: null, displayName: null });
    expect(await service.geocode('Nonexistent Street 999')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cache miss queries Nominatim with encoded query + User-Agent, caches and returns the hit', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '50.0614', lon: '19.9366', display_name: 'Kraków, Polska' }],
    });
    const result = await service.geocode('Rynek Główny 1, Kraków');
    expect(result).toEqual({ lat: 50.0614, lng: 19.9366, displayName: 'Kraków, Polska' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=');
    expect(url).toContain(encodeURIComponent('rynek główny 1, kraków'));
    expect(init.headers['User-Agent']).toContain('ai-budget-assistant');

    expect(prisma.geocodeCache.upsert).toHaveBeenCalledWith({
      where: { queryNormalized: 'rynek główny 1, kraków' },
      create: {
        queryNormalized: 'rynek główny 1, kraków',
        lat: 50.0614, lng: 19.9366, displayName: 'Kraków, Polska',
      },
      update: {},
    });
  });

  it('empty result array returns null AND writes a negative cache row', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    expect(await service.geocode('Zzzz Qqqq 123456')).toBeNull();
    expect(prisma.geocodeCache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ lat: null, lng: null }),
      }),
    );
  });

  it('network error returns null and caches NOTHING (transient failures are retryable)', async () => {
    fetchMock.mockRejectedValue(new Error('ETIMEDOUT'));
    expect(await service.geocode('Marszałkowska 10, Warszawa')).toBeNull();
    expect(prisma.geocodeCache.upsert).not.toHaveBeenCalled();
  });

  it('non-OK HTTP response returns null and caches nothing', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 });
    expect(await service.geocode('Marszałkowska 10, Warszawa')).toBeNull();
    expect(prisma.geocodeCache.upsert).not.toHaveBeenCalled();
  });

  it('cache read failure is swallowed (fail-silent) and returns null', async () => {
    prisma.geocodeCache.findUnique.mockRejectedValue(new Error('db down'));
    expect(await service.geocode('Marszałkowska 10, Warszawa')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
cd apps/api; npx jest src/modules/ai/services/geocoding.service.spec.ts
```

Expected: FAIL — `Cannot find module './geocoding.service'`.

- [ ] **Step 3: Implement the service**

Create `apps/api/src/modules/ai/services/geocoding.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string | null;
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
// Nominatim usage policy requires an identifying User-Agent.
const USER_AGENT = 'ai-budget-assistant/1.0 (https://ai-budget.pl)';
const REQUEST_TIMEOUT_MS = 5000;
// Usage policy: max 1 request/second. Single API container → in-process limiter suffices.
const MIN_REQUEST_GAP_MS = 1100;

/** Trim, collapse whitespace, lowercase. Null for unusably short input. */
export function normalizeGeocodeQuery(address: string | null | undefined): string | null {
  if (!address) return null;
  const q = address.replace(/\s+/g, ' ').trim().toLowerCase();
  return q.length >= 5 ? q : null;
}

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private lastRequestAt = 0;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Geocode a free-text address. Fail-silent by design: any failure returns
   * null — receipt scanning must never break because of geocoding.
   * Negative results ("no match") ARE cached; transient errors are NOT.
   */
  async geocode(address: string): Promise<GeocodeResult | null> {
    const query = normalizeGeocodeQuery(address);
    if (!query) return null;

    try {
      const cached = await this.prisma.geocodeCache.findUnique({
        where: { queryNormalized: query },
      });
      if (cached) {
        if (cached.lat == null || cached.lng == null) return null; // negative cache
        return { lat: Number(cached.lat), lng: Number(cached.lng), displayName: cached.displayName };
      }

      const fetched = await this.throttled(() => this.queryNominatim(query));
      if (fetched === 'error') return null; // transient — retryable next time, do not cache

      await this.prisma.geocodeCache.upsert({
        where: { queryNormalized: query },
        create: {
          queryNormalized: query,
          lat: fetched?.lat ?? null,
          lng: fetched?.lng ?? null,
          displayName: fetched?.displayName ?? null,
        },
        update: {},
      });
      return fetched;
    } catch (e) {
      this.logger.warn(`geocode failed for "${query}": ${e}`);
      return null;
    }
  }

  /** Serialize all Nominatim calls with a >=1.1s gap between them. */
  private throttled<T>(fn: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const wait = this.lastRequestAt + MIN_REQUEST_GAP_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastRequestAt = Date.now();
      return fn();
    };
    const p = this.chain.then(run, run);
    this.chain = p.then(
      () => undefined,
      () => undefined,
    );
    return p;
  }

  /** null = confirmed no results (cacheable); 'error' = transient failure (not cacheable). */
  private async queryNominatim(query: string): Promise<GeocodeResult | null | 'error'> {
    try {
      const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(`Nominatim returned ${res.status} for "${query}"`);
        return 'error';
      }
      const body = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
      if (!Array.isArray(body) || body.length === 0) return null;
      const lat = Number(body[0].lat);
      const lng = Number(body[0].lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'error';
      return { lat, lng, displayName: body[0].display_name ?? null };
    } catch (e) {
      this.logger.warn(`Nominatim request failed for "${query}": ${e}`);
      return 'error';
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
cd apps/api; npx jest src/modules/ai/services/geocoding.service.spec.ts
```

Expected: PASS (10 tests).

- [ ] **Step 5: Register in AiModule**

In `apps/api/src/modules/ai/ai.module.ts`: add the import next to the other service imports (top of file):

```ts
import { GeocodingService } from './services/geocoding.service';
```

and add `GeocodingService,` to the `providers: [...]` array (lines ~29–41, after `OcrService`). Do NOT export it — OCR is its only consumer.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/modules/ai
git commit -m "feat(api): add GeocodingService (Nominatim + geocode_cache, fail-silent)"
```

---

### Task 3: Attach `location` to the scan-receipt response (OCR wiring)

**Files:**
- Modify: `apps/api/src/modules/ai/services/ocr.service.ts`
- Modify: `apps/api/src/modules/ai/services/ocr.service.spec.ts`

**Interfaces:**
- Consumes: `GeocodingService.geocode` (Task 2).
- Produces: `ReceiptExpense.location: { lat: number; lng: number; name: string } | null` — the shape mobile Task 10 consumes from `POST /ai/scan-receipt`. `name` is the RAW `merchantAddress` printed on the receipt (human-readable), not Nominatim's display name.

- [ ] **Step 1: Write the failing test**

In `apps/api/src/modules/ai/services/ocr.service.spec.ts`, first find how `OcrService` is constructed (a Nest testing module or direct `new OcrService(...)`) and add a `GeocodingService` mock alongside the existing `PrismaService`/`ConfigService` mocks:

- Nest testing module style: add to `providers`:
  ```ts
  { provide: GeocodingService, useValue: { geocode: jest.fn().mockResolvedValue(null) } },
  ```
- Direct-instantiation style: add the mock object as the new constructor argument.

Import at top: `import { GeocodingService } from './geocoding.service';`. Keep a reference to the mock (e.g. `geocodingMock`) so tests can program it.

Then add this describe block (exercise `buildReceiptExpense` through whichever parse path the existing spec already tests — reuse its fixture that yields a parsed receipt; the essential assertions are below):

```ts
describe('receipt location (geocoding)', () => {
  it('geocodes merchantAddress and attaches location with the raw address as name', async () => {
    geocodingMock.geocode.mockResolvedValue({ lat: 52.23, lng: 21.01, displayName: 'Warszawa, PL' });
    // parsed receipt fixture must include: merchantAddress: 'ul. Marszałkowska 10, Warszawa'
    const result = await runParseWithFixture({ merchantAddress: 'ul. Marszałkowska 10, Warszawa' });
    expect(geocodingMock.geocode).toHaveBeenCalledWith('ul. Marszałkowska 10, Warszawa');
    expect(result.location).toEqual({ lat: 52.23, lng: 21.01, name: 'ul. Marszałkowska 10, Warszawa' });
  });

  it('returns location: null when geocoding finds nothing', async () => {
    geocodingMock.geocode.mockResolvedValue(null);
    const result = await runParseWithFixture({ merchantAddress: 'ul. Marszałkowska 10, Warszawa' });
    expect(result.location).toBeNull();
  });

  it('skips geocoding entirely when the receipt has no address', async () => {
    const result = await runParseWithFixture({ merchantAddress: null });
    expect(geocodingMock.geocode).not.toHaveBeenCalled();
    expect(result.location).toBeNull();
  });
});
```

(`runParseWithFixture` = whatever helper/pattern the existing spec uses to drive `parseReceipt` with a mocked OpenAI JSON response — adapt the fixture's `merchantAddress` field. If the spec has no such helper, mock `openai.chat.completions.create` to return `JSON.stringify({...fixture})` as it already does for other tests in that file.)

- [ ] **Step 2: Run to verify failure**

```powershell
cd apps/api; npx jest src/modules/ai/services/ocr.service.spec.ts
```

Expected: FAIL — `location` is `undefined` on the result (and possibly a constructor-arity error until Step 3).

- [ ] **Step 3: Implement**

In `apps/api/src/modules/ai/services/ocr.service.ts`:

1. Import: `import { GeocodingService } from './geocoding.service';`
2. Extend the `ReceiptExpense` interface (lines ~71–82) with:
   ```ts
   location: { lat: number; lng: number; name: string } | null;
   ```
3. Add to the constructor (after `private readonly prisma: PrismaService`):
   ```ts
   private readonly geocoding: GeocodingService,
   ```
4. Make `buildReceiptExpense` (line ~300) **async** and geocode:

   ```ts
   private async buildReceiptExpense(
     parsed: ParsedReceipt & { suggestedCategory?: string },
     categories: CategoryWithName[],
   ): Promise<ReceiptExpense> {
     // ... existing matchedCategory + description logic unchanged ...

     let location: ReceiptExpense['location'] = null;
     if (parsed.merchantAddress) {
       const geo = await this.geocoding.geocode(parsed.merchantAddress);
       if (geo) {
         // name = the raw address the user saw printed on the receipt
         location = { lat: geo.lat, lng: geo.lng, name: parsed.merchantAddress };
       }
     }

     return {
       // ... existing fields unchanged ...
       receiptItems: parsed.items || [],
       location,
     };
   }
   ```

   The four call sites (lines ~549, 599, 684, 706) are all `return this.buildReceiptExpense(...)` inside `async` methods returning `Promise<ReceiptExpense>` — no call-site changes needed.

- [ ] **Step 4: Run tests**

```powershell
cd apps/api; npx jest src/modules/ai/services/ocr.service.spec.ts
```

Expected: PASS (all pre-existing tests + 3 new).

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/modules/ai
git commit -m "feat(api): geocode receipt merchantAddress into scan-receipt location"
```

---

### Task 4: `ExpensesService` — persist/clear `locationName` (TDD via pure util)

**Files:**
- Create: `apps/api/src/modules/expenses/expense-location.util.ts`
- Create: `apps/api/src/modules/expenses/expense-location.util.spec.ts`
- Modify: `apps/api/src/modules/expenses/dto/index.ts`
- Modify: `apps/api/src/modules/expenses/expenses.service.ts`

**Interfaces:**
- Produces: `buildLocationColumns(location)` → `{ locationLat, locationLng, locationName }` used in all three Prisma write sites. `UpdateExpenseDto.location` becomes nullable (`LocationDto | null`) so `location: null` clears the pin (mobile Tasks 16–17 rely on this).

Semantics (single source of truth):
| input | locationLat/Lng | locationName |
|---|---|---|
| `undefined` | `undefined` (column untouched on update) | `undefined` |
| `null` | `null` (cleared) | `null` |
| `{lat, lng}` (no name) | values | `null` (a manually-moved pin invalidates the stale geocoded label) |
| `{lat, lng, name}` | values | name |

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/expenses/expense-location.util.spec.ts`:

```ts
import { buildLocationColumns } from './expense-location.util';

describe('buildLocationColumns', () => {
  it('undefined input leaves all columns untouched', () => {
    expect(buildLocationColumns(undefined)).toEqual({
      locationLat: undefined, locationLng: undefined, locationName: undefined,
    });
  });

  it('null input clears all three columns', () => {
    expect(buildLocationColumns(null)).toEqual({
      locationLat: null, locationLng: null, locationName: null,
    });
  });

  it('object with name sets all three', () => {
    expect(buildLocationColumns({ lat: 52.23, lng: 21.01, name: 'Marszałkowska 10' })).toEqual({
      locationLat: 52.23, locationLng: 21.01, locationName: 'Marszałkowska 10',
    });
  });

  it('object without name sets coordinates and CLEARS the stale name', () => {
    expect(buildLocationColumns({ lat: 52.23, lng: 21.01 })).toEqual({
      locationLat: 52.23, locationLng: 21.01, locationName: null,
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

```powershell
cd apps/api; npx jest src/modules/expenses/expense-location.util.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the util**

Create `apps/api/src/modules/expenses/expense-location.util.ts`:

```ts
export interface LocationInput {
  lat: number;
  lng: number;
  name?: string;
}

/**
 * Map the DTO `location` object onto the three Prisma columns.
 * undefined → leave columns untouched; null → clear all three;
 * object without `name` → coordinates set, stale name cleared.
 */
export function buildLocationColumns(location: LocationInput | null | undefined): {
  locationLat: number | null | undefined;
  locationLng: number | null | undefined;
  locationName: string | null | undefined;
} {
  if (location === undefined) {
    return { locationLat: undefined, locationLng: undefined, locationName: undefined };
  }
  if (location === null) {
    return { locationLat: null, locationLng: null, locationName: null };
  }
  return { locationLat: location.lat, locationLng: location.lng, locationName: location.name ?? null };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```powershell
cd apps/api; npx jest src/modules/expenses/expense-location.util.spec.ts
```

- [ ] **Step 5: Make `UpdateExpenseDto.location` nullable**

In `apps/api/src/modules/expenses/dto/index.ts` (line ~287), change **only the UpdateExpenseDto** field type:

```ts
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto | null;
```

(`@IsOptional()` skips validation for `null` as well as `undefined`, so `location: null` passes through — this is the "remove location" contract. `CreateExpenseDto.location` stays non-nullable.)

- [ ] **Step 6: Wire the util into all three write sites in `expenses.service.ts`**

Import at top: `import { buildLocationColumns } from './expense-location.util';`

1. **`create()` — `expenseData` (create branch, lines ~178–179):** replace
   ```ts
   locationLat: dto.location?.lat,
   locationLng: dto.location?.lng,
   ```
   with
   ```ts
   ...buildLocationColumns(dto.location),
   ```
2. **`create()` — `updateData` (upsert update branch, lines ~198–222):** this branch currently has NO location fields, which means the offline-retry-upsert path silently drops location — the exact bug class found with `paidByUserId` in the trip-wallet review. Add inside the object:
   ```ts
   ...buildLocationColumns(dto.location),
   ```
3. **`update()` — `expenseUpdateData` (lines ~523–524):** replace
   ```ts
   locationLat: dto.location?.lat,
   locationLng: dto.location?.lng,
   ```
   with
   ```ts
   ...buildLocationColumns(dto.location),
   ```

- [ ] **Step 7: Return `locationName` from list reads**

In `expenses.service.ts` `findAll` select block (line ~426), add after `locationLng: true,`:

```ts
locationName: true,
```

(`findOne` uses `include`, which returns all scalar columns — no change needed.)

- [ ] **Step 8: Run the full expenses + typecheck**

```powershell
cd apps/api; npx jest src/modules/expenses; npx tsc --noEmit
```

Expected: all PASS, tsc exits 0.

- [ ] **Step 9: Commit**

```powershell
git add apps/api/src/modules/expenses
git commit -m "feat(api): persist and clear expense locationName via buildLocationColumns"
```

---

### Task 5: Shared types & constants + PR1 verification

**Files:**
- Modify: `packages/shared-types/src/dto/sync.ts`
- Modify: `packages/shared-types/src/entities/expense.ts`
- Modify: `packages/shared-utils/src/constants/index.ts`

**Interfaces:**
- Produces: `SyncExpensePayload.location`; `Expense.locationName`; `ENCRYPTION_FIELDS.expense.tier2` includes `locationLat`/`locationLng` (mobile encryption middleware consumes this — tier2, NOT tier1, because `decryptFromSync` restores numeric types only for tier2 fields).

- [ ] **Step 1: `SyncExpensePayload`** — in `packages/shared-types/src/dto/sync.ts` (lines 26–47), add after `time`-adjacent fields (e.g. after `date: string;`):

```ts
  location?: {
    lat: number;
    lng: number;
    name?: string;
  } | null;
```

(The API's `sync.service.ts` spreads `...payload` into `ExpensesService.create/update`, which read `dto.location` — no sync.service change needed.)

- [ ] **Step 2: `Expense` entity** — in `packages/shared-types/src/entities/expense.ts`, after `locationLng?: number | null;` (line ~62) add:

```ts
  /** Separate name column as returned by the API. */
  locationName?: string | null;
```

- [ ] **Step 3: `ENCRYPTION_FIELDS`** — in `packages/shared-utils/src/constants/index.ts` line 129, change:

```ts
    tier2: ['amount', 'discountAmount'],
```

to:

```ts
    tier2: ['amount', 'discountAmount', 'locationLat', 'locationLng'],
```

(`locationName` is already in tier1 on line 128.)

- [ ] **Step 4: Full verification**

```powershell
npm run typecheck
cd apps/api; npx jest
```

Expected: typecheck green across the monorepo; the full API suite passes.

- [ ] **Step 5: Commit**

```powershell
git add packages
git commit -m "feat(shared): location on SyncExpensePayload, Expense.locationName, coords in encryption tier2"
```

---

# PR 2 — Mobile capture

### Task 6: `expo-location` + platform permissions

**Files:**
- Modify: `apps/mobile/package.json` (via expo install)
- Modify: `apps/mobile/android/app/src/main/AndroidManifest.xml`
- Modify: `apps/mobile/app.json`

**Interfaces:**
- Produces: `expo-location` importable; Android manifest has `ACCESS_COARSE_LOCATION`/`ACCESS_FINE_LOCATION`; iOS `NSLocationWhenInUseUsageDescription` configured.

- [ ] **Step 1: Install**

```powershell
cd apps/mobile; npx expo install expo-location
```

Expected: `expo-location` added to `apps/mobile/package.json` dependencies at the SDK-54-matched version.

- [ ] **Step 2: AndroidManifest** — in `apps/mobile/android/app/src/main/AndroidManifest.xml`, the permission list (lines 2–13) is alphabetical; insert at the top of the list (after `DETECT_SCREEN_CAPTURE`, before `INTERNET`):

```xml
  <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
```

(Bare workflow: `android/` is committed and EAS builds from it without prebuild — the manifest MUST be edited manually; the expo-location config plugin alone would not reach the committed manifest.)

- [ ] **Step 3: app.json** — three edits:
1. `android.permissions` array (lines ~40–50): add `"ACCESS_COARSE_LOCATION"` and `"ACCESS_FINE_LOCATION"`.
2. `ios.infoPlist` (lines ~23–26): add:
   ```json
   "NSLocationWhenInUseUsageDescription": "This app can attach your current location to expenses you add, so you can see them on a map. Optional and off by default."
   ```
3. `plugins` array: add the entry `"expo-location"` (keeps iOS prebuild correct; harmless for the committed Android project).

- [ ] **Step 4: Sanity check the bundler**

```powershell
cd apps/mobile; npx tsc --noEmit
```

Expected: exits 0 (no imports yet — this catches package resolution issues only).

- [ ] **Step 5: Commit**

```powershell
git add apps/mobile/package.json apps/mobile/android/app/src/main/AndroidManifest.xml apps/mobile/app.json package-lock.json
git commit -m "feat(mobile): add expo-location dependency and location permissions"
```

---

### Task 7: `locationSettingsStore` + `locationCapture` service (TDD)

**Files:**
- Create: `apps/mobile/src/stores/locationSettingsStore.ts`
- Create: `apps/mobile/src/services/locationCapture.ts`
- Create: `apps/mobile/src/services/__tests__/locationCapture.test.ts`

**Interfaces:**
- Produces:
  - `useLocationSettingsStore` — `{ captureEnabled: boolean; setCaptureEnabled(enabled: boolean): void }` (MMKV-persisted, default `false`).
  - `captureCurrentLocation(opts?: { force?: boolean }): Promise<{ lat: number; lng: number } | null>` — toggle-gated unless `force`; never throws; never blocks longer than ~4s.
  - `requestLocationPermission(): Promise<boolean>` — used by the settings toggle and the manual pin screen.
  - Type `CapturedLocation = { lat: number; lng: number }`.

- [ ] **Step 1: Create the store** (same MMKV pattern as `widgetVisibilityStore`):

```ts
// apps/mobile/src/stores/locationSettingsStore.ts
import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';

const mmkv = new MMKV({ id: 'location-settings' });
const KEY = 'captureEnabled';

interface LocationSettingsState {
  /** Opt-in: silently attach device GPS to expenses created "live". Default OFF. */
  captureEnabled: boolean;
  setCaptureEnabled: (enabled: boolean) => void;
}

export const useLocationSettingsStore = create<LocationSettingsState>((set) => ({
  captureEnabled: mmkv.getString(KEY) === 'true',
  setCaptureEnabled: (enabled) => {
    mmkv.set(KEY, String(enabled));
    set({ captureEnabled: enabled });
  },
}));
```

- [ ] **Step 2: Write the failing tests**

Create `apps/mobile/src/services/__tests__/locationCapture.test.ts`:

```ts
import { captureCurrentLocation, requestLocationPermission } from '../locationCapture';
import * as Location from 'expo-location';
import { useLocationSettingsStore } from '@/stores/locationSettingsStore';

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));

jest.mock('@/stores/locationSettingsStore', () => ({
  useLocationSettingsStore: { getState: jest.fn() },
}));

const mockGetState = useLocationSettingsStore.getState as jest.Mock;
const mockPerms = Location.getForegroundPermissionsAsync as jest.Mock;
const mockPos = Location.getCurrentPositionAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetState.mockReturnValue({ captureEnabled: true });
  mockPerms.mockResolvedValue({ status: 'granted' });
});

describe('captureCurrentLocation', () => {
  it('returns null when the toggle is off, without touching permissions', async () => {
    mockGetState.mockReturnValue({ captureEnabled: false });
    expect(await captureCurrentLocation()).toBeNull();
    expect(mockPerms).not.toHaveBeenCalled();
  });

  it('force bypasses the toggle', async () => {
    mockGetState.mockReturnValue({ captureEnabled: false });
    mockPos.mockResolvedValue({ coords: { latitude: 52.23, longitude: 21.01 } });
    expect(await captureCurrentLocation({ force: true })).toEqual({ lat: 52.23, lng: 21.01 });
  });

  it('returns null when permission is not granted', async () => {
    mockPerms.mockResolvedValue({ status: 'denied' });
    expect(await captureCurrentLocation()).toBeNull();
    expect(mockPos).not.toHaveBeenCalled();
  });

  it('maps coords to {lat, lng}', async () => {
    mockPos.mockResolvedValue({ coords: { latitude: 50.06, longitude: 19.93 } });
    expect(await captureCurrentLocation()).toEqual({ lat: 50.06, lng: 19.93 });
  });

  it('returns null when position lookup rejects (never throws)', async () => {
    mockPos.mockRejectedValue(new Error('gps off'));
    expect(await captureCurrentLocation()).toBeNull();
  });

  it('returns null when position lookup exceeds the timeout', async () => {
    jest.useFakeTimers();
    mockPos.mockReturnValue(new Promise(() => undefined)); // never resolves
    const promise = captureCurrentLocation();
    jest.advanceTimersByTime(4100);
    expect(await promise).toBeNull();
    jest.useRealTimers();
  });
});

describe('requestLocationPermission', () => {
  it('returns true when granted', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    expect(await requestLocationPermission()).toBe(true);
  });

  it('returns false when denied or the call throws', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    expect(await requestLocationPermission()).toBe(false);
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockRejectedValue(new Error('x'));
    expect(await requestLocationPermission()).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify failure**

```powershell
cd apps/mobile; npx jest src/services/__tests__/locationCapture.test.ts
```

Expected: FAIL — `Cannot find module '../locationCapture'`.

- [ ] **Step 4: Implement**

Create `apps/mobile/src/services/locationCapture.ts`:

```ts
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { useLocationSettingsStore } from '@/stores/locationSettingsStore';

export interface CapturedLocation {
  lat: number;
  lng: number;
}

const CAPTURE_TIMEOUT_MS = 4000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/**
 * Ask the OS for foreground location permission. Used when the user flips the
 * settings toggle ON and by the manual pin screen's "My location" button.
 */
export async function requestLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  } catch (e) {
    console.warn('[locationCapture] permission request failed:', e);
    return false;
  }
}

/**
 * Best-effort current position. Gated on the opt-in toggle (unless `force`,
 * used by the manual pin screen). NEVER throws and never takes longer than
 * ~4s — an expense save must not block on GPS.
 */
export async function captureCurrentLocation(opts?: { force?: boolean }): Promise<CapturedLocation | null> {
  if (Platform.OS === 'web') return null;
  if (!opts?.force && !useLocationSettingsStore.getState().captureEnabled) return null;

  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const pos = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      CAPTURE_TIMEOUT_MS,
    );
    if (!pos) return null;
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch (e) {
    console.warn('[locationCapture] capture failed:', e);
    return null;
  }
}
```

- [ ] **Step 5: Run tests — expect PASS**

```powershell
cd apps/mobile; npx jest src/services/__tests__/locationCapture.test.ts
```

- [ ] **Step 6: Commit**

```powershell
git add apps/mobile/src/stores/locationSettingsStore.ts apps/mobile/src/services/locationCapture.ts apps/mobile/src/services/__tests__/locationCapture.test.ts
git commit -m "feat(mobile): add opt-in GPS capture service and location settings store"
```

---

### Task 8: Settings toggle UI + `location` i18n section

**Files:**
- Modify: `apps/mobile/app/settings/data.tsx`
- Modify: all 9 files in `apps/mobile/src/i18n/locales/`

**Interfaces:**
- Consumes: `useLocationSettingsStore`, `requestLocationPermission` (Task 7).
- Produces: i18n section `location.*` (used again in Tasks 16–17) and the user-facing opt-in.

- [ ] **Step 1: Add the i18n `location` section to ALL 9 locales**

Add a new top-level `location:` object to each locale file (place it alphabetically near similar sections; the exact position doesn't matter, the key name does). Full translations:

`en.ts`:
```ts
  location: {
    sectionTitle: 'Location',
    attachToggle: 'Attach location to new expenses',
    attachToggleDesc: 'Saves your GPS position when you add an expense on the spot',
    permissionDenied: 'Location permission is required. Enable it in system settings.',
    title: 'Location',
    addLocation: 'Add location',
    editLocation: 'Edit location',
    removeLocation: 'Remove location',
    myLocation: 'My location',
    tapToPlace: 'Tap the map to place the pin',
    pickerTitle: 'Expense location',
  },
```

`de.ts`:
```ts
  location: {
    sectionTitle: 'Standort',
    attachToggle: 'Standort an neue Ausgaben anhängen',
    attachToggleDesc: 'Speichert deine GPS-Position, wenn du eine Ausgabe vor Ort hinzufügst',
    permissionDenied: 'Standortberechtigung erforderlich. Aktiviere sie in den Systemeinstellungen.',
    title: 'Standort',
    addLocation: 'Standort hinzufügen',
    editLocation: 'Standort bearbeiten',
    removeLocation: 'Standort entfernen',
    myLocation: 'Mein Standort',
    tapToPlace: 'Tippe auf die Karte, um den Pin zu setzen',
    pickerTitle: 'Ort der Ausgabe',
  },
```

`es.ts`:
```ts
  location: {
    sectionTitle: 'Ubicación',
    attachToggle: 'Adjuntar ubicación a nuevos gastos',
    attachToggleDesc: 'Guarda tu posición GPS cuando añades un gasto en el momento',
    permissionDenied: 'Se requiere permiso de ubicación. Actívalo en los ajustes del sistema.',
    title: 'Ubicación',
    addLocation: 'Añadir ubicación',
    editLocation: 'Editar ubicación',
    removeLocation: 'Eliminar ubicación',
    myLocation: 'Mi ubicación',
    tapToPlace: 'Toca el mapa para colocar el marcador',
    pickerTitle: 'Ubicación del gasto',
  },
```

`fr.ts`:
```ts
  location: {
    sectionTitle: 'Localisation',
    attachToggle: 'Joindre la localisation aux nouvelles dépenses',
    attachToggleDesc: 'Enregistre votre position GPS quand vous ajoutez une dépense sur place',
    permissionDenied: 'Autorisation de localisation requise. Activez-la dans les réglages du système.',
    title: 'Localisation',
    addLocation: 'Ajouter une localisation',
    editLocation: 'Modifier la localisation',
    removeLocation: 'Supprimer la localisation',
    myLocation: 'Ma position',
    tapToPlace: 'Touchez la carte pour placer le repère',
    pickerTitle: 'Localisation de la dépense',
  },
```

`pl.ts`:
```ts
  location: {
    sectionTitle: 'Lokalizacja',
    attachToggle: 'Dołączaj lokalizację do nowych wydatków',
    attachToggleDesc: 'Zapisuje pozycję GPS, gdy dodajesz wydatek na miejscu',
    permissionDenied: 'Wymagane jest uprawnienie do lokalizacji. Włącz je w ustawieniach systemu.',
    title: 'Lokalizacja',
    addLocation: 'Dodaj lokalizację',
    editLocation: 'Edytuj lokalizację',
    removeLocation: 'Usuń lokalizację',
    myLocation: 'Moja lokalizacja',
    tapToPlace: 'Dotknij mapy, aby ustawić pinezkę',
    pickerTitle: 'Lokalizacja wydatku',
  },
```

`ru.ts`:
```ts
  location: {
    sectionTitle: 'Локация',
    attachToggle: 'Прикреплять локацию к новым расходам',
    attachToggleDesc: 'Сохраняет вашу GPS-позицию, когда вы добавляете расход на месте',
    permissionDenied: 'Нужно разрешение на геолокацию. Включите его в настройках системы.',
    title: 'Локация',
    addLocation: 'Добавить локацию',
    editLocation: 'Изменить локацию',
    removeLocation: 'Удалить локацию',
    myLocation: 'Моё местоположение',
    tapToPlace: 'Коснитесь карты, чтобы поставить метку',
    pickerTitle: 'Локация расхода',
  },
```

`ua.ts`:
```ts
  location: {
    sectionTitle: 'Локація',
    attachToggle: 'Прикріплювати локацію до нових витрат',
    attachToggleDesc: 'Зберігає вашу GPS-позицію, коли ви додаєте витрату на місці',
    permissionDenied: 'Потрібен дозвіл на геолокацію. Увімкніть його в налаштуваннях системи.',
    title: 'Локація',
    addLocation: 'Додати локацію',
    editLocation: 'Змінити локацію',
    removeLocation: 'Видалити локацію',
    myLocation: 'Моє місцезнаходження',
    tapToPlace: 'Торкніться карти, щоб поставити позначку',
    pickerTitle: 'Локація витрати',
  },
```

`be.ts`:
```ts
  location: {
    sectionTitle: 'Лакацыя',
    attachToggle: 'Прымацоўваць лакацыю да новых выдаткаў',
    attachToggleDesc: 'Захоўвае вашу GPS-пазіцыю, калі вы дадаяце выдатак на месцы',
    permissionDenied: 'Патрэбны дазвол на геалакацыю. Уключыце яго ў наладах сістэмы.',
    title: 'Лакацыя',
    addLocation: 'Дадаць лакацыю',
    editLocation: 'Змяніць лакацыю',
    removeLocation: 'Выдаліць лакацыю',
    myLocation: 'Маё месцазнаходжанне',
    tapToPlace: 'Краніце карту, каб паставіць пазнаку',
    pickerTitle: 'Лакацыя выдатку',
  },
```

`nl.ts`:
```ts
  location: {
    sectionTitle: 'Locatie',
    attachToggle: 'Locatie toevoegen aan nieuwe uitgaven',
    attachToggleDesc: 'Slaat je GPS-positie op wanneer je ter plekke een uitgave toevoegt',
    permissionDenied: 'Locatietoestemming is vereist. Schakel deze in bij de systeeminstellingen.',
    title: 'Locatie',
    addLocation: 'Locatie toevoegen',
    editLocation: 'Locatie bewerken',
    removeLocation: 'Locatie verwijderen',
    myLocation: 'Mijn locatie',
    tapToPlace: 'Tik op de kaart om de pin te plaatsen',
    pickerTitle: 'Locatie van uitgave',
  },
```

- [ ] **Step 2: Add the toggle section to `app/settings/data.tsx`**

1. Add `Platform` to the existing `react-native` import block (lines 2–9).
2. Add imports:
   ```ts
   import { useLocationSettingsStore } from '@/stores/locationSettingsStore';
   import { requestLocationPermission } from '@/services/locationCapture';
   ```
3. Inside the component, read the store and define the handler:
   ```ts
   const captureEnabled = useLocationSettingsStore((s) => s.captureEnabled);
   const setCaptureEnabled = useLocationSettingsStore((s) => s.setCaptureEnabled);

   const handleToggleLocation = async (value: boolean) => {
     if (!value) {
       setCaptureEnabled(false);
       return;
     }
     const granted = await requestLocationPermission();
     if (!granted) {
       showAlert(t('location.sectionTitle'), t('location.permissionDenied'));
       return;
     }
     setCaptureEnabled(true);
   };
   ```
4. Insert a new section between the "Data & Sync" section (ends ~line 222) and the "Reports & Email" section (starts ~line 224) — GPS is meaningless on web, so gate it:
   ```tsx
   {Platform.OS !== 'web' && (
     <View style={styles.section}>
       <Text style={styles.sectionTitle}>{t('location.sectionTitle')}</Text>
       <View style={styles.card}>
         <View style={styles.fieldRow}>
           <View style={{ flex: 1 }}>
             <Text style={styles.fieldLabel}>{t('location.attachToggle')}</Text>
             <Text style={styles.fieldDesc}>{t('location.attachToggleDesc')}</Text>
           </View>
           <Switch
             value={captureEnabled}
             onValueChange={handleToggleLocation}
             trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
           />
         </View>
       </View>
     </View>
   )}
   ```
   (`section`, `card`, `fieldRow`, `fieldLabel`, `fieldDesc` styles and the `Switch` import already exist in this file.)

- [ ] **Step 3: Verify**

```powershell
cd apps/mobile; npx tsc --noEmit
```

Expected: exits 0. Manual check (optional now, required in final task): the toggle appears under Settings → Data & Reports on native, absent on web.

- [ ] **Step 4: Commit**

```powershell
git add apps/mobile/app/settings/data.tsx apps/mobile/src/i18n/locales
git commit -m "feat(mobile): GPS capture opt-in toggle in data settings"
```

---

### Task 9: `parseServerLocation` util + store/sync plumbing (push, retry, pull)

**Files:**
- Create: `apps/mobile/src/utils/location.ts`
- Create: `apps/mobile/src/utils/__tests__/location.test.ts`
- Modify: `apps/mobile/src/stores/expenseStore.ts` (addExpense push payload)
- Modify: `apps/mobile/src/stores/expenseSync.ts` (retry payload + pull Phase C)

**Interfaces:**
- Consumes: shared-types DTOs (already have `location`), `maybeEncrypt` (existing), `ENCRYPTION_FIELDS` tier2 coords (Task 5).
- Produces: `parseServerLocation(raw): { lat: number; lng: number; name?: string } | undefined` — Task 12+ map UI relies on `expense.location` being populated after every server pull.

**Background for the implementer:** the server returns FLAT `locationLat`/`locationLng` (Prisma `Decimal`, serialized as **strings** in JSON) + `locationName`; the mobile entity uses a NESTED `location: {lat, lng, name?}` object. The local repository (`expenseToParams`, `updateExpenseInDb`, `rowToExpense`) already maps the nested object to SQLite columns — the only gaps are the three payload builders below.

- [ ] **Step 1: Write the failing util test**

Create `apps/mobile/src/utils/__tests__/location.test.ts`:

```ts
import { parseServerLocation } from '../location';

describe('parseServerLocation', () => {
  it('parses Prisma Decimal strings into numbers', () => {
    expect(parseServerLocation({ locationLat: '52.2297', locationLng: '21.0122', locationName: 'Warszawa' }))
      .toEqual({ lat: 52.2297, lng: 21.0122, name: 'Warszawa' });
  });

  it('passes through plain numbers and omits empty name', () => {
    expect(parseServerLocation({ locationLat: 50.06, locationLng: 19.93, locationName: null }))
      .toEqual({ lat: 50.06, lng: 19.93, name: undefined });
  });

  it('returns undefined when either coordinate is missing', () => {
    expect(parseServerLocation({ locationLat: null, locationLng: 21, locationName: null })).toBeUndefined();
    expect(parseServerLocation({ locationLat: 52, locationLng: undefined, locationName: null })).toBeUndefined();
    expect(parseServerLocation({})).toBeUndefined();
  });

  it('returns undefined for non-numeric garbage', () => {
    expect(parseServerLocation({ locationLat: 'abc', locationLng: '21' })).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```powershell
cd apps/mobile; npx jest src/utils/__tests__/location.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the util**

Create `apps/mobile/src/utils/location.ts`:

```ts
/**
 * Build the mobile nested `location` object from the API's flat columns.
 * The server serializes Prisma Decimal as strings, so coerce with Number().
 */
export function parseServerLocation(raw: {
  locationLat?: unknown;
  locationLng?: unknown;
  locationName?: unknown;
}): { lat: number; lng: number; name?: string } | undefined {
  if (raw.locationLat == null || raw.locationLng == null) return undefined;
  const lat = Number(raw.locationLat);
  const lng = Number(raw.locationLng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return undefined;
  const name =
    typeof raw.locationName === 'string' && raw.locationName.length > 0
      ? raw.locationName
      : undefined;
  return { lat, lng, name };
}
```

- [ ] **Step 4: Run util tests — expect PASS**

- [ ] **Step 5: `expenseStore.addExpense` — include location in the encrypted push payload**

In `apps/mobile/src/stores/expenseStore.ts`, the `maybeEncrypt` call (lines ~242–248) currently passes `{ description, notes, merchant, amount, discountAmount, debtContactName }`. Add the three flat location fields:

```ts
maybeEncrypt('expense', {
  description: newExpense.description,
  notes: newExpense.notes,
  merchant: newExpense.merchant,
  amount: newExpense.amount,
  discountAmount: newExpense.discountAmount,
  debtContactName: newExpense.debtContactName,
  locationName: newExpense.location?.name,
  locationLat: newExpense.location?.lat,
  locationLng: newExpense.location?.lng,
}, accountId).then(...)
```

And in the `api.createExpense({...})` object (lines ~250–280), add after `merchant:`:

```ts
// For E2EE accounts the encrypted plaintext comes back zeroed (numbers) /
// nulled (strings) — use encPayload values directly, never fall back to the
// plaintext name (that would leak an encrypted field).
location: newExpense.location
  ? {
      lat: (encPayload.locationLat as number | undefined) ?? newExpense.location.lat,
      lng: (encPayload.locationLng as number | undefined) ?? newExpense.location.lng,
      name: (encPayload.locationName as string | null | undefined) ?? undefined,
    }
  : undefined,
```

- [ ] **Step 6: `expenseSync.ts` `syncPendingExpenses` — same two edits**

In `apps/mobile/src/stores/expenseSync.ts` (lines ~71–112): add the same three fields to its `maybeEncrypt('expense', {...})` object (using `expense.location?.…`), and the same `location:` block (using `expense.location`) to its `api.createExpense({...})` payload. This closes the offline-retry drop gap for location (do NOT copy the pattern of the other dropped fields — location must survive the retry path).

- [ ] **Step 7: `expenseSync.ts` Phase C — map server location on pull**

In the Phase C entity builder (lines ~286–334), add to the returned object after `time: decrypted.time ?? undefined,`:

```ts
location: parseServerLocation(decrypted),
```

with import at top: `import { parseServerLocation } from '@/utils/location';`

(`decrypted` = server row merged with any decrypted E2EE fields, so this covers plain and encrypted accounts in one line. Phase D's repository upsert already persists `location_*` columns.)

- [ ] **Step 8: Typecheck + run mobile store tests**

```powershell
cd apps/mobile; npx tsc --noEmit; npx jest src/utils src/services/__tests__/locationCapture.test.ts
```

Expected: green.

- [ ] **Step 9: Commit**

```powershell
git add apps/mobile/src/utils apps/mobile/src/stores/expenseStore.ts apps/mobile/src/stores/expenseSync.ts
git commit -m "feat(mobile): thread expense location through push, retry and pull sync paths"
```

---

### Task 10: Consume scan-receipt location + GPS wiring in all create paths

**Files:**
- Modify: `apps/mobile/src/services/ai.api.ts`
- Modify: `apps/mobile/src/features/receipt/useReceiptScanner.ts`
- Modify: `apps/mobile/app/expense/receipt.tsx`
- Modify: `apps/mobile/app/expense/new.tsx`
- Modify: `apps/mobile/app/expense/voice.tsx`
- Modify: `apps/mobile/src/services/notificationCapture/captureService.ts`

**Interfaces:**
- Consumes: `ReceiptExpense.location` from the API (Task 3), `captureCurrentLocation` (Task 7), `addExpense` location passthrough (Task 9).
- Produces: every "live" create path attaches a location when available. Priority: OCR address > GPS > none.

- [ ] **Step 1: Extend the scan-receipt response type**

In `apps/mobile/src/services/ai.api.ts`, the inline `scanReceipt` response type (lines ~137–162): add after `receiptItems: {...}[];`:

```ts
    location: { lat: number; lng: number; name: string } | null;
```

In `apps/mobile/src/features/receipt/useReceiptScanner.ts`, add the same field to the `ScannedReceipt` interface (lines 14–25):

```ts
  location: { lat: number; lng: number; name: string } | null;
```

- [ ] **Step 2: `receipt.tsx` — OCR location with GPS fallback**

In `apps/mobile/app/expense/receipt.tsx`:

1. Imports:
   ```ts
   import { captureCurrentLocation, type CapturedLocation } from '@/services/locationCapture';
   ```
2. Near the other hooks/state (~line 52), start a toggle-gated GPS capture on mount (a receipt without a printed address scanned in-store still gets a pin):
   ```ts
   const gpsLocationRef = useRef<CapturedLocation | null>(null);
   useEffect(() => {
     captureCurrentLocation().then((loc) => { gpsLocationRef.current = loc; });
   }, []);
   ```
   (add `useRef`/`useEffect` to the React import if missing)
3. In `handleConfirmExpense` (lines ~131–146), add to the `addExpense({...})` object:
   ```ts
   location: scannedReceipt.location ?? gpsLocationRef.current ?? undefined,
   ```

- [ ] **Step 3: `new.tsx` — GPS on mount**

In `apps/mobile/app/expense/new.tsx`: same `gpsLocationRef` + `useEffect` pattern as Step 2 (near the top of the component, ~line 56), and in `handleSubmit`'s `addExpense({...})` (lines ~163–184) add:

```ts
location: gpsLocationRef.current ?? undefined,
```

- [ ] **Step 4: `voice.tsx` — GPS on mount**

Same pattern in `apps/mobile/app/expense/voice.tsx`: ref + mount effect, and in `handleConfirmExpense`'s `addExpense({...})` (lines ~119–131) add `location: gpsLocationRef.current ?? undefined,`.

- [ ] **Step 5: Bank-push auto-capture**

In `apps/mobile/src/services/notificationCapture/captureService.ts`, inside `handleBankNotification` just before the `addExpense` call (lines ~140–155):

```ts
const capturedLocation = await captureCurrentLocation();
```

and add to the `addExpense({...})` object:

```ts
location: capturedLocation ?? undefined,
```

Import: `import { captureCurrentLocation } from '@/services/locationCapture';`. (This is the highest-accuracy signal — the phone is physically at the store when the bank push arrives. Background flow, so awaiting up to 4s is fine.)

- [ ] **Step 6: Typecheck**

```powershell
cd apps/mobile; npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```powershell
git add apps/mobile/src/services/ai.api.ts apps/mobile/src/features/receipt/useReceiptScanner.ts apps/mobile/app/expense apps/mobile/src/services/notificationCapture/captureService.ts
git commit -m "feat(mobile): attach OCR/GPS location on all live expense create paths"
```

---

### Task 11: PR2 verification checkpoint

**Files:** none new.

- [ ] **Step 1: Full mobile test + typecheck + lint**

```powershell
cd apps/mobile; npx jest; npx tsc --noEmit
npm run lint
```

Expected: green (lint from repo root covers all packages).

- [ ] **Step 2: Manual smoke (document results, don't skip silently)**

- Run `npm run dev:web` — app boots, no location toggle on web settings.
- If an Android device/emulator is available: enable the toggle (permission prompt appears), add a manual expense, confirm `location_lat/lng` populated in the local row (`expense.location` visible in the detail screen after Task 16; for now verify via the API: `GET /expenses` returns `locationLat/locationLng` for the new row). If no device is available, state that in the commit/PR notes.

- [ ] **Step 3: Commit any fixes; no separate commit needed if clean**

---

# PR 3 — Map UI

### Task 12: Leaflet HTML asset generation (build-time, no runtime CDN)

**Files:**
- Modify: `apps/mobile/package.json` (devDeps + script)
- Create: `apps/mobile/scripts/build-map-html.js`
- Create (generated, committed): `apps/mobile/src/components/map/mapHtml.generated.ts`

**Interfaces:**
- Produces: `MAP_HTML: string` — a self-contained HTML document exposing `window.__configure(opts)`, `window.__setPoints(points)`, `window.__setView(lat,lng,zoom)`, `window.__setPicker(bool)`, `window.__setPickerPin(lat,lng)`; it emits JSON messages `{type:'ready'}`, `{type:'open', id}`, `{type:'mapPress', lat, lng}` via `ReactNativeWebView.postMessage` (native) or `parent.postMessage` (web iframe). Tasks 14+ rely on these exact names.

- [ ] **Step 1: Add devDependencies**

```powershell
cd apps/mobile; npm install --save-dev leaflet@1.9.4 leaflet.markercluster@1.5.3
```

- [ ] **Step 2: Write the generation script**

Create `apps/mobile/scripts/build-map-html.js`:

```js
/**
 * Generates src/components/map/mapHtml.generated.ts — a self-contained Leaflet
 * map document (Leaflet + markercluster inlined; OSM tiles at runtime).
 * Regenerate after upgrading leaflet: `npm run generate:map-html` (from apps/mobile).
 * Mirrors the generate:help pattern — NEVER edit the generated file by hand.
 */
const fs = require('fs');
const path = require('path');

const nm = path.join(__dirname, '..', 'node_modules');
const read = (p) => fs.readFileSync(path.join(nm, p), 'utf8');

const leafletJs = read('leaflet/dist/leaflet.js');
const leafletCss = read('leaflet/dist/leaflet.css');
const clusterJs = read('leaflet.markercluster/dist/leaflet.markercluster.js');
const clusterCss =
  read('leaflet.markercluster/dist/MarkerCluster.css') +
  read('leaflet.markercluster/dist/MarkerCluster.Default.css');

const appJs = `
var map = L.map('map', { zoomControl: false }).setView([50, 15], 4);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);
var cluster = L.markerClusterGroup();
map.addLayer(cluster);
var pickerMarker = null;
var cfg = { openLabel: 'Open', interactive: true, picker: false };

function send(msg) {
  var s = JSON.stringify(msg);
  if (window.ReactNativeWebView) { window.ReactNativeWebView.postMessage(s); }
  else if (window.parent !== window) { window.parent.postMessage(s, '*'); }
}

window.__configure = function (options) {
  if (options.openLabel) cfg.openLabel = options.openLabel;
  if (options.interactive === false && cfg.interactive) {
    map.dragging.disable(); map.touchZoom.disable(); map.doubleClickZoom.disable();
    map.scrollWheelZoom.disable(); map.boxZoom.disable(); map.keyboard.disable();
    if (map.tap) map.tap.disable();
    cfg.interactive = false;
  }
};

window.__setPoints = function (points) {
  cluster.clearLayers();
  var bounds = [];
  points.forEach(function (p) {
    var m = L.marker([p.lat, p.lng]);
    // Popup built via DOM APIs + textContent — user data (merchant names) must never be injected as HTML.
    var div = document.createElement('div');
    div.style.minWidth = '140px';
    var title = document.createElement('div');
    title.style.fontWeight = '600';
    title.textContent = p.title;
    var amount = document.createElement('div');
    amount.textContent = p.amountLabel;
    div.appendChild(title);
    div.appendChild(amount);
    if (cfg.interactive) {
      var btn = document.createElement('a');
      btn.href = '#';
      btn.textContent = cfg.openLabel;
      btn.style.display = 'inline-block';
      btn.style.marginTop = '6px';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        send({ type: 'open', id: p.id });
      });
      div.appendChild(btn);
    }
    m.bindPopup(div);
    cluster.addLayer(m);
    bounds.push([p.lat, p.lng]);
  });
  if (bounds.length === 1) { map.setView(bounds[0], 15); }
  else if (bounds.length > 1) { map.fitBounds(bounds, { padding: [30, 30] }); }
};

window.__setView = function (lat, lng, zoom) { map.setView([lat, lng], zoom); };

window.__setPicker = function (enabled) { cfg.picker = !!enabled; };

window.__setPickerPin = function (lat, lng) {
  if (pickerMarker) { pickerMarker.setLatLng([lat, lng]); }
  else {
    pickerMarker = L.marker([lat, lng], { draggable: true }).addTo(map);
    pickerMarker.on('dragend', function () {
      var ll = pickerMarker.getLatLng();
      send({ type: 'mapPress', lat: ll.lat, lng: ll.lng });
    });
  }
};

map.on('click', function (e) {
  if (!cfg.picker) return;
  window.__setPickerPin(e.latlng.lat, e.latlng.lng);
  send({ type: 'mapPress', lat: e.latlng.lat, lng: e.latlng.lng });
});

send({ type: 'ready' });
`;

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>${leafletCss}${clusterCss}
html, body, #map { height: 100%; margin: 0; padding: 0; background: #e8e8e8; }
</style>
</head>
<body>
<div id="map"></div>
<script>${leafletJs}</script>
<script>${clusterJs}</script>
<script>${appJs}</script>
</body>
</html>`;

const outDir = path.join(__dirname, '..', 'src', 'components', 'map');
fs.mkdirSync(outDir, { recursive: true });
const out =
  '// AUTO-GENERATED by scripts/build-map-html.js — DO NOT EDIT.\n' +
  '// Regenerate with: npm run generate:map-html (from apps/mobile)\n' +
  '/* eslint-disable */\n' +
  'export const MAP_HTML = ' + JSON.stringify(html) + ';\n';
fs.writeFileSync(path.join(outDir, 'mapHtml.generated.ts'), out);
console.log('Wrote mapHtml.generated.ts (' + Math.round(html.length / 1024) + ' KB)');
```

- [ ] **Step 3: Add the npm script and run it**

In `apps/mobile/package.json` `scripts`: add `"generate:map-html": "node scripts/build-map-html.js"`. Then:

```powershell
cd apps/mobile; npm run generate:map-html
```

Expected: `Wrote mapHtml.generated.ts (~200 KB)` and the file exists.

- [ ] **Step 4: Commit**

```powershell
git add apps/mobile/package.json apps/mobile/scripts/build-map-html.js apps/mobile/src/components/map/mapHtml.generated.ts package-lock.json
git commit -m "feat(mobile): generate self-contained Leaflet map HTML asset"
```

---

### Task 13: `buildExpenseMapPoints` (TDD)

**Files:**
- Create: `apps/mobile/src/components/map/buildMapPoints.ts`
- Create: `apps/mobile/src/components/map/__tests__/buildMapPoints.test.ts`

**Interfaces:**
- Produces: `ExpenseMapPoint { id, lat, lng, title, amountLabel }`; `buildExpenseMapPoints(expenses: Expense[]): { points: ExpenseMapPoint[]; missingCount: number }`. Tasks 14–17 consume both.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/components/map/__tests__/buildMapPoints.test.ts`:

```ts
import { buildExpenseMapPoints } from '../buildMapPoints';

const base = {
  localId: 'x', userId: 'u', accountId: 'a', currencyCode: 'PLN' as const,
  date: new Date('2026-07-01'), source: 'manual' as const,
  isRecurring: false, isDebt: false, isDebtRepayment: false, isDeleted: false,
  syncStatus: 'synced' as const, syncVersion: 1,
  createdAt: new Date(), updatedAt: new Date(),
};

describe('buildExpenseMapPoints', () => {
  it('maps located expenses to points and counts the rest as missing', () => {
    const { points, missingCount } = buildExpenseMapPoints([
      { ...base, id: '1', amount: 45.8, merchant: 'Biedronka', location: { lat: 52.2, lng: 21.0 } } as any,
      { ...base, id: '2', amount: 12, description: 'Kawa' } as any,
    ]);
    expect(missingCount).toBe(1);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ id: '1', lat: 52.2, lng: 21.0, title: 'Biedronka' });
    expect(points[0].amountLabel).toContain('45');
  });

  it('falls back to description for title when merchant is empty', () => {
    const { points } = buildExpenseMapPoints([
      { ...base, id: '1', amount: 5, description: 'Parking', location: { lat: 50, lng: 19 } } as any,
    ]);
    expect(points[0].title).toBe('Parking');
  });

  it('treats (0,0) as missing — zeroed plaintext of an undecryptable E2EE row, not a real store', () => {
    const { points, missingCount } = buildExpenseMapPoints([
      { ...base, id: '1', amount: 5, location: { lat: 0, lng: 0 } } as any,
    ]);
    expect(points).toHaveLength(0);
    expect(missingCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure** (`cd apps/mobile; npx jest src/components/map`) — FAIL, module not found.

- [ ] **Step 3: Implement**

Create `apps/mobile/src/components/map/buildMapPoints.ts`:

```ts
import { formatCurrency } from '@budget/shared-utils';
import type { Expense } from '@budget/shared-types';

export interface ExpenseMapPoint {
  id: string;
  lat: number;
  lng: number;
  title: string;
  amountLabel: string;
}

/**
 * Turn the (already filtered) expense list into map pins.
 * Rows without coordinates are counted in `missingCount` for the banner.
 * (0,0) is excluded: it is the zeroed plaintext of an undecryptable E2EE
 * tier-2 row ("null island"), never a real purchase location.
 */
export function buildExpenseMapPoints(expenses: Expense[]): {
  points: ExpenseMapPoint[];
  missingCount: number;
} {
  const points: ExpenseMapPoint[] = [];
  let missingCount = 0;
  for (const e of expenses) {
    const loc = e.location;
    if (!loc || (loc.lat === 0 && loc.lng === 0)) {
      missingCount++;
      continue;
    }
    points.push({
      id: e.id,
      lat: loc.lat,
      lng: loc.lng,
      title: e.merchant || e.description || '',
      amountLabel: formatCurrency(e.amount, e.currencyCode),
    });
  }
  return { points, missingCount };
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```powershell
git add apps/mobile/src/components/map
git commit -m "feat(mobile): buildExpenseMapPoints helper for the expense map"
```

---

### Task 14: `ExpenseMapView` component (native WebView + web iframe)

**Files:**
- Create: `apps/mobile/src/components/map/ExpenseMapView.tsx`
- Create: `apps/mobile/src/components/map/ExpenseMapView.web.tsx`

**Interfaces:**
- Consumes: `MAP_HTML` (Task 12), `ExpenseMapPoint` (Task 13).
- Produces: `<ExpenseMapView points onPointPress onMapPress center interactive picker pickerPin openLabel style />` — identical props on both platforms. Tasks 15–17 consume it.

- [ ] **Step 1: Native implementation**

Create `apps/mobile/src/components/map/ExpenseMapView.tsx`:

```tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { MAP_HTML } from './mapHtml.generated';
import type { ExpenseMapPoint } from './buildMapPoints';

export interface ExpenseMapViewProps {
  points?: ExpenseMapPoint[];
  onPointPress?: (id: string) => void;
  onMapPress?: (lat: number, lng: number) => void;
  /** Explicit center wins over the auto fit-bounds from points. */
  center?: { lat: number; lng: number; zoom: number };
  /** false = static mini-map (no gestures). */
  interactive?: boolean;
  /** Picker mode: taps place/move a draggable pin and emit onMapPress. */
  picker?: boolean;
  pickerPin?: { lat: number; lng: number } | null;
  openLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function ExpenseMapView({
  points = [],
  onPointPress,
  onMapPress,
  center,
  interactive = true,
  picker = false,
  pickerPin = null,
  openLabel = 'Open',
  style,
}: ExpenseMapViewProps) {
  const webviewRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);

  const sync = useCallback(() => {
    const js =
      [
        `window.__configure(${JSON.stringify({ openLabel, interactive })});`,
        `window.__setPicker(${picker ? 'true' : 'false'});`,
        `window.__setPoints(${JSON.stringify(points)});`,
        center ? `window.__setView(${center.lat}, ${center.lng}, ${center.zoom});` : '',
        pickerPin ? `window.__setPickerPin(${pickerPin.lat}, ${pickerPin.lng});` : '',
      ].join('\n') + '\ntrue;';
    webviewRef.current?.injectJavaScript(js);
  }, [points, center, interactive, picker, pickerPin, openLabel]);

  useEffect(() => {
    if (ready) sync();
  }, [ready, sync]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        if (msg.type === 'ready') setReady(true);
        else if (msg.type === 'open' && onPointPress) onPointPress(String(msg.id));
        else if (msg.type === 'mapPress' && onMapPress) onMapPress(Number(msg.lat), Number(msg.lng));
      } catch {
        // ignore malformed bridge messages
      }
    },
    [onPointPress, onMapPress],
  );

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webviewRef}
        originWhitelist={['*']}
        source={{ html: MAP_HTML }}
        onMessage={onMessage}
        javaScriptEnabled
        setSupportMultipleWindows={false}
        nestedScrollEnabled
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  webview: { flex: 1, backgroundColor: 'transparent' },
});
```

- [ ] **Step 2: Web implementation (iframe srcDoc — same bridge)**

Create `apps/mobile/src/components/map/ExpenseMapView.web.tsx`:

```tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MAP_HTML } from './mapHtml.generated';
import type { ExpenseMapViewProps } from './ExpenseMapView';

// srcDoc iframes are same-origin: we call the window.__* API directly and
// receive messages via parent.postMessage (see mapHtml's send()).
export function ExpenseMapView({
  points = [],
  onPointPress,
  onMapPress,
  center,
  interactive = true,
  picker = false,
  pickerPin = null,
  openLabel = 'Open',
  style,
}: ExpenseMapViewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      try {
        const msg = JSON.parse(String(event.data));
        if (msg.type === 'ready') setReady(true);
        else if (msg.type === 'open' && onPointPress) onPointPress(String(msg.id));
        else if (msg.type === 'mapPress' && onMapPress) onMapPress(Number(msg.lat), Number(msg.lng));
      } catch {
        // ignore non-map messages
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onPointPress, onMapPress]);

  const sync = useCallback(() => {
    const win = iframeRef.current?.contentWindow as any;
    if (!win || typeof win.__setPoints !== 'function') return;
    win.__configure({ openLabel, interactive });
    win.__setPicker(picker);
    win.__setPoints(points);
    if (center) win.__setView(center.lat, center.lng, center.zoom);
    if (pickerPin) win.__setPickerPin(pickerPin.lat, pickerPin.lng);
  }, [points, center, interactive, picker, pickerPin, openLabel]);

  useEffect(() => {
    if (ready) sync();
  }, [ready, sync]);

  return (
    <View style={[styles.container, style]}>
      <iframe ref={iframeRef} srcDoc={MAP_HTML} style={iframeStyle} title="expense-map" />
    </View>
  );
}

const iframeStyle: React.CSSProperties = { border: 0, width: '100%', height: '100%' };
const styles = StyleSheet.create({ container: { overflow: 'hidden' } });
```

- [ ] **Step 3: Typecheck**

```powershell
cd apps/mobile; npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```powershell
git add apps/mobile/src/components/map
git commit -m "feat(mobile): ExpenseMapView WebView/iframe Leaflet component"
```

---

### Task 15: Expenses tab — List/Map mode + `map` i18n section

**Files:**
- Modify: `apps/mobile/app/(tabs)/expenses.tsx`
- Modify: all 9 locale files

**Interfaces:**
- Consumes: `ExpenseMapView`, `buildExpenseMapPoints`.
- Produces: `view=map` route param contract (Task 17's trip row navigates with it); i18n `map.*` keys.

- [ ] **Step 1: Add the `map` i18n section to ALL 9 locales**

`en.ts`:
```ts
  map: {
    mapView: 'Map',
    listView: 'List',
    noLocationCount_one: '{{count}} expense without location',
    noLocationCount_other: '{{count}} expenses without location',
    open: 'Open',
  },
```
`de.ts`: `mapView: 'Karte'`, `listView: 'Liste'`, `noLocationCount_one: '{{count}} Ausgabe ohne Standort'`, `noLocationCount_other: '{{count}} Ausgaben ohne Standort'`, `open: 'Öffnen'`.
`es.ts`: `'Mapa'`, `'Lista'`, `'{{count}} gasto sin ubicación'`, `'{{count}} gastos sin ubicación'`, `'Abrir'`.
`fr.ts`: `'Carte'`, `'Liste'`, `'{{count}} dépense sans localisation'`, `'{{count}} dépenses sans localisation'`, `'Ouvrir'`.
`pl.ts`: `'Mapa'`, `'Lista'`, `noLocationCount_one: '{{count}} wydatek bez lokalizacji'`, `noLocationCount_few: '{{count}} wydatki bez lokalizacji'`, `noLocationCount_many: '{{count}} wydatków bez lokalizacji'`, `open: 'Otwórz'`.
`ru.ts`: `'Карта'`, `'Список'`, `noLocationCount_one: '{{count}} расход без локации'`, `noLocationCount_few: '{{count}} расхода без локации'`, `noLocationCount_many: '{{count}} расходов без локации'`, `open: 'Открыть'`.
`ua.ts`: `'Карта'`, `'Список'`, `noLocationCount_one: '{{count}} витрата без локації'`, `noLocationCount_few: '{{count}} витрати без локації'`, `noLocationCount_many: '{{count}} витрат без локації'`, `open: 'Відкрити'`.
`be.ts`: `'Карта'`, `'Спіс'`, `noLocationCount_one: '{{count}} выдатак без лакацыі'`, `noLocationCount_few: '{{count}} выдаткі без лакацыі'`, `noLocationCount_many: '{{count}} выдаткаў без лакацыі'`, `open: 'Адкрыць'`.
`nl.ts`: `'Kaart'`, `'Lijst'`, `noLocationCount_one: '{{count}} uitgave zonder locatie'`, `noLocationCount_other: '{{count}} uitgaven zonder locatie'`, `open: 'Openen'`.

(pl uses `_one/_few/_many` like ru/ua/be — Polish has the same three plural categories.)

- [ ] **Step 2: Wire the mode into `(tabs)/expenses.tsx`**

1. Imports:
   ```ts
   import { ExpenseMapView } from '@/components/map/ExpenseMapView';
   import { buildExpenseMapPoints } from '@/components/map/buildMapPoints';
   ```
2. State + param (next to `activeTab`, ~line 43):
   ```ts
   const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
   ```
   Extend the param read (line 40): `const { tab, view } = useLocalSearchParams<{ tab?: string; view?: string }>();` and next to the existing `tab` effect (lines 93–97):
   ```ts
   useEffect(() => {
     if (view === 'map') {
       setActiveTab('expenses');
       setViewMode('map');
     }
   }, [view]);
   ```
3. Points memo (after `const expenses = getFilteredExpenses();`, line 64):
   ```ts
   const { points: mapPoints, missingCount } = useMemo(
     () => buildExpenseMapPoints(expenses),
     [expenses],
   );
   ```
   (add `useMemo` to the React import if missing)
4. Toggle button — in the `segmentedControlRow` (lines 313–339), insert BEFORE the search toggle button, only for the expenses tab:
   ```tsx
   {activeTab === 'expenses' && (
     <TouchableOpacity
       onPress={() => setViewMode(viewMode === 'map' ? 'list' : 'map')}
       style={styles.searchToggleButton}
       accessibilityLabel={viewMode === 'map' ? t('map.listView') : t('map.mapView')}
     >
       <Ionicons
         name={viewMode === 'map' ? 'list-outline' : 'map-outline'}
         size={20}
         color={viewMode === 'map' ? theme.colors.primary : theme.colors.textSecondary}
       />
     </TouchableOpacity>
   )}
   ```
5. Replace the transaction-list block (lines 379–402) with a three-way render:
   ```tsx
   {activeTab === 'expenses' && viewMode === 'map' ? (
     <View style={styles.mapContainer}>
       {missingCount > 0 && (
         <View style={styles.mapBanner}>
           <Ionicons name="information-circle-outline" size={16} color={theme.colors.textSecondary} />
           <Text style={styles.mapBannerText}>{t('map.noLocationCount', { count: missingCount })}</Text>
         </View>
       )}
       <ExpenseMapView
         points={mapPoints}
         openLabel={t('map.open')}
         onPointPress={(pointId) => router.push(`/expense/${pointId}`)}
         style={styles.map}
       />
     </View>
   ) : activeTab === 'expenses' ? (
     <FlatList /* existing expenses FlatList unchanged */ ... />
   ) : (
     <FlatList /* existing incomes FlatList unchanged */ ... />
   )}
   ```
6. Styles (in `createStyles`):
   ```ts
   mapContainer: { flex: 1 },
   map: { flex: 1 },
   mapBanner: {
     flexDirection: 'row' as const,
     alignItems: 'center' as const,
     gap: theme.spacing[1.5],
     paddingHorizontal: theme.spacing[4],
     paddingVertical: theme.spacing[2],
     backgroundColor: theme.colors.surfaceSecondary,
   },
   mapBannerText: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary },
   ```

- [ ] **Step 3: Verify manually**

`npm run dev:web`, open the Expenses tab → map icon appears on the expenses tab only; toggling shows the map (iframe) with the OSM canvas; expenses without coordinates produce the banner. Typecheck: `cd apps/mobile; npx tsc --noEmit`.

- [ ] **Step 4: Commit**

```powershell
git add "apps/mobile/app/(tabs)/expenses.tsx" apps/mobile/src/i18n/locales
git commit -m "feat(mobile): map view mode on the expenses tab"
```

---

### Task 16: Expense detail — `LocationSection` (mini-map + add/edit/remove)

**Files:**
- Create: `apps/mobile/app/expense/components/LocationSection.tsx`
- Modify: `apps/mobile/app/expense/[id].tsx`

**Interfaces:**
- Consumes: `ExpenseMapView`, `location.*` i18n (Task 8), `expenseStore.updateExpense` (forwards `location: null` — server contract from Task 4).
- Produces: navigation to `/expense/location?id=<id>` (Task 17 registers that route — build them in this order; until Task 17 lands the button 404s, which is fine mid-PR).

- [ ] **Step 1: Create the component**

Create `apps/mobile/app/expense/components/LocationSection.tsx` (mirror the section/card look of the sibling components — check `ReceiptSection.tsx` for the exact card/sectionTitle style keys it uses and reuse the same pattern):

```tsx
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useExpenseStore } from '@/stores/expenseStore';
import { ExpenseMapView } from '@/components/map/ExpenseMapView';
import type { Expense } from '@budget/shared-types';

interface Props {
  expense: Expense;
  canEdit: boolean;
}

export function LocationSection({ expense, canEdit }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const updateExpense = useExpenseStore((s) => s.updateExpense);

  const loc = expense.location;
  const hasLocation = !!loc && !(loc.lat === 0 && loc.lng === 0);

  if (!hasLocation && !canEdit) return null;

  const openPicker = () =>
    router.push({ pathname: '/expense/location', params: { id: expense.id } });

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('location.title')}</Text>
        {canEdit && hasLocation && (
          <TouchableOpacity onPress={() => updateExpense(expense.id, { location: null })}>
            <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
          </TouchableOpacity>
        )}
      </View>

      {hasLocation ? (
        <>
          <TouchableOpacity activeOpacity={canEdit ? 0.7 : 1} onPress={canEdit ? openPicker : undefined}>
            <ExpenseMapView
              points={[{ id: expense.id, lat: loc!.lat, lng: loc!.lng, title: expense.merchant || expense.description || '', amountLabel: '' }]}
              interactive={false}
              style={styles.miniMap}
            />
          </TouchableOpacity>
          <View style={styles.nameRow}>
            <Ionicons name="location-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={styles.nameText} numberOfLines={2}>
              {loc!.name || `${loc!.lat.toFixed(5)}, ${loc!.lng.toFixed(5)}`}
            </Text>
          </View>
          {canEdit && (
            <TouchableOpacity style={styles.actionRow} onPress={openPicker}>
              <Text style={styles.actionText}>{t('location.editLocation')}</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        <TouchableOpacity style={styles.actionRow} onPress={openPicker}>
          <Ionicons name="location-outline" size={16} color={theme.colors.primary} />
          <Text style={styles.actionText}>{t('location.addLocation')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[4],
  },
  headerRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[3],
  },
  title: { ...theme.textStyles.h4, color: theme.colors.text },
  miniMap: { height: 160, borderRadius: theme.borderRadius.md },
  nameRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    marginTop: theme.spacing[2],
  },
  nameText: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary, flex: 1 },
  actionRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    marginTop: theme.spacing[2],
  },
  actionText: { ...theme.textStyles.bodySm, color: theme.colors.primary, fontWeight: '600' as const },
});
```

(Adjust `theme.textStyles.h4` / style tokens to whatever the sibling `ReceiptSection.tsx` actually uses if these names differ — match the neighbors, don't invent tokens.)

- [ ] **Step 2: Mount it in `app/expense/[id].tsx`**

After `<ReceiptSection expenseId={id!} />` (line ~275) and before the Actions block:

```tsx
{/* Location (map card / add-location affordance) */}
<LocationSection expense={expense} canEdit={canEdit} />
```

Import: `import { LocationSection } from './components/LocationSection';`. The screen already derives edit permission — find the existing `canEdit` source in this file (it renders edit/delete actions); if the screen doesn't already have it, add `const canEdit = useAccountStore((s) => s.canEdit());` with the matching import (`import { useAccountStore } from '@/stores/accountStore';`).

- [ ] **Step 3: Typecheck + commit**

```powershell
cd apps/mobile; npx tsc --noEmit
git add apps/mobile/app/expense
git commit -m "feat(mobile): location section with mini-map on expense detail"
```

---

### Task 17: Manual pin screen (`app/expense/location.tsx`) + route registration

**Files:**
- Create: `apps/mobile/app/expense/location.tsx`
- Modify: `apps/mobile/app/_layout.tsx`

**Interfaces:**
- Consumes: `ExpenseMapView` picker mode, `captureCurrentLocation({force:true})`, `requestLocationPermission`, `expenseStore.updateExpense` (`location: {lat,lng}` sets, `location: null` handled in Task 16).
- Produces: the `/expense/location?id=` route Task 16 navigates to.

- [ ] **Step 1: Create the screen**

Create `apps/mobile/app/expense/location.tsx`:

```tsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useExpenseStore } from '@/stores/expenseStore';
import { ExpenseMapView } from '@/components/map/ExpenseMapView';
import { captureCurrentLocation, requestLocationPermission } from '@/services/locationCapture';
import { showAlert } from '@/utils/alert';

export default function ExpenseLocationScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { expenses, updateExpense } = useExpenseStore();

  // Same 4-way resolution as expense/[id].tsx (deep links may carry the server PK).
  const expense = expenses.find(
    (e) => e.id === id || e.serverId === id || e.clientId === id || e.localId === id,
  );

  const initial = expense?.location && !(expense.location.lat === 0 && expense.location.lng === 0)
    ? { lat: expense.location.lat, lng: expense.location.lng }
    : null;
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(initial);

  if (!expense) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.hint}>{t('expenseDetail.notFound')}</Text>
      </SafeAreaView>
    );
  }

  const handleMyLocation = async () => {
    const granted = await requestLocationPermission();
    if (!granted) {
      showAlert(t('location.sectionTitle'), t('location.permissionDenied'));
      return;
    }
    const loc = await captureCurrentLocation({ force: true });
    if (loc) setPin(loc);
  };

  const handleSave = () => {
    const unchanged = initial && pin && initial.lat === pin.lat && initial.lng === pin.lng;
    if (pin && !unchanged) {
      // No `name`: a manually placed pin invalidates the stale geocoded label
      // (server + local repo both clear locationName for a name-less object).
      updateExpense(expense.id, { location: { lat: pin.lat, lng: pin.lng } });
    }
    router.back();
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ExpenseMapView
        picker
        pickerPin={pin}
        onMapPress={(lat, lng) => setPin({ lat, lng })}
        center={pin ? { lat: pin.lat, lng: pin.lng, zoom: 15 } : { lat: 50, lng: 15, zoom: 4 }}
        style={styles.map}
      />
      <Text style={styles.hint}>{t('location.tapToPlace')}</Text>
      <View style={styles.footer}>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleMyLocation}>
          <Ionicons name="locate-outline" size={18} color={theme.colors.primary} />
          <Text style={styles.secondaryButtonText}>{t('location.myLocation')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, !pin && styles.primaryButtonDisabled]}
          onPress={handleSave}
          disabled={!pin}
        >
          <Text style={styles.primaryButtonText}>{t('common.save')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  map: { flex: 1 },
  hint: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    paddingVertical: theme.spacing[2],
  },
  footer: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
    padding: theme.spacing[4],
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[1.5],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  secondaryButtonText: { ...theme.textStyles.body, color: theme.colors.primary, fontWeight: '600' as const },
  primaryButton: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
  },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: { ...theme.textStyles.body, color: '#fff', fontWeight: '600' as const },
});
```

(Verify `common.save` exists in `en.ts` — it does in this codebase's `common` section; if the actual key differs, use the existing save key.)

- [ ] **Step 2: Register the route with a header** (new screens MUST have one)

In `apps/mobile/app/_layout.tsx`, next to the `expense/new` registration (lines ~307–314):

```tsx
<Stack.Screen
  name="expense/location"
  options={{
    presentation: 'modal',
    headerShown: true,
    title: t('location.pickerTitle'),
  }}
/>
```

- [ ] **Step 3: Manual verification**

On web (`npm run dev:web`): open an expense → Add location → modal opens with map + header; tap map → pin appears; Save → detail shows the mini-map card; trash icon removes it. Typecheck clean.

- [ ] **Step 4: Commit**

```powershell
git add apps/mobile/app/expense/location.tsx apps/mobile/app/_layout.tsx
git commit -m "feat(mobile): manual pin picker screen for expense location"
```

---

### Task 18: Trip account "Trip map" row

**Files:**
- Modify: `apps/mobile/app/account/[id].tsx`
- Modify: all 9 locale files (one key)

**Interfaces:**
- Consumes: the `view=map` param contract (Task 15).

- [ ] **Step 1: Add `tripMap` to the existing `trip` i18n section in ALL 9 locales**

en: `tripMap: 'Trip map'` · de: `'Reisekarte'` · es: `'Mapa del viaje'` · fr: `'Carte du voyage'` · pl: `'Mapa podróży'` · ru: `'Карта поездки'` · ua: `'Карта подорожі'` · be: `'Карта паездкі'` · nl: `'Reiskaart'`.

- [ ] **Step 2: Add the row**

In `apps/mobile/app/account/[id].tsx`, inside the trip actions card (lines 281–305), after the Payment Settings `TouchableOpacity` (line ~302):

```tsx
<View style={styles.divider} />
<TouchableOpacity
  style={styles.tripActionRow}
  onPress={() => router.push({ pathname: '/(tabs)/expenses', params: { view: 'map' } })}
>
  <Ionicons name="map-outline" size={20} color={theme.colors.primary} />
  <Text style={styles.tripActionText}>{t('trip.tripMap')}</Text>
  <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
</TouchableOpacity>
```

(The viewed trip account is already the active account on this screen, so the Expenses tab shows its expenses.)

- [ ] **Step 3: Typecheck + commit**

```powershell
cd apps/mobile; npx tsc --noEmit
git add "apps/mobile/app/account/[id].tsx" apps/mobile/src/i18n/locales
git commit -m "feat(mobile): trip map entry on the trip account screen"
```

---

### Task 19: Final verification, docs, ABA issue

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Full monorepo verification**

```powershell
npm run typecheck
npm run lint
cd apps/api; npx jest
cd ..\..\apps\mobile; npx jest
```

Expected: all green. Fix anything that isn't before proceeding.

- [ ] **Step 2: End-to-end smoke (use the `verify` skill if available)**

- Web: expenses tab map toggle, pin popup → navigates to detail; detail mini-map; picker save/remove; trip row.
- API (curl or through the app): `POST /ai/scan-receipt` with a Polish receipt photo → response contains `location` (or `null` gracefully); `PATCH /expenses/:id` with `{"location": null}` clears; `GET /expenses` returns `locationName`.
- Report honestly what was and wasn't exercised (Android device availability).

- [ ] **Step 3: Update CLAUDE.md**

Add a bullet under **Key Patterns → API** (near the OCR/AI notes) summarizing: `modules/ai/services/geocoding.service.ts` (Nominatim + `geocode_cache`, fail-silent, negative caching, 1 rps in-process limiter), scan-receipt `location`, `buildLocationColumns` in expenses, `UpdateExpenseDto.location: LocationDto | null` clear contract, coords in `ENCRYPTION_FIELDS.expense.tier2`. Add a bullet under **Mobile** for: `locationCapture` opt-in GPS (default off, `settings/data.tsx` toggle), location priority (manual pin > OCR address > GPS), `ExpenseMapView` (WebView + inlined Leaflet, `npm run generate:map-html`, NEVER edit `mapHtml.generated.ts` by hand, no react-native-maps), expenses-tab `view=map` param, `expense/location` picker screen, (0,0) null-island convention.

- [ ] **Step 4: Finish protocol**

Invoke the `finish-aba-task` skill — it creates the ABA-{N} GitHub issue (check `gh issue list --limit 1` first for numbering) and drives the remaining docs updates (user_docs/ help section if warranted). Commit docs changes. Do NOT push — ask the user for approval first.
