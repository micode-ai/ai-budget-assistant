# Expense Geo-Location & Map View — Design

**Date:** 2026-07-03
**Status:** Approved
**Scope decision:** Full v1 package — OCR-address geocoding + opt-in GPS capture + manual pin editing; map surfaces on the Expenses tab, the expense detail screen, and the trip account screen.

## 1. Problem & Goals

Users scanning receipts (and adding expenses on the go, especially in trip accounts) have no way to see **where** money was spent. Goals:

1. A scanned receipt automatically gets the store's location (address is printed on virtually every EU fiscal receipt and the OCR prompt already extracts it — then discards it).
2. Expenses viewed for a period can be shown on a **map**: clustered, clickable pins showing merchant + amount, tapping through to the expense detail screen.
3. Works great for `trip` accounts (visual trip diary) and for everyday budgets.

### Non-goals (v1)

- No location for bank/Wise CSV imports (historical data has no reliable address).
- No backfill of coordinates for existing expenses (old scans did not persist the address).
- No free-text address search on the manual pin screen (v2).
- No location for incomes.
- No server-rendered maps or server-side location analytics — the map is rendered entirely client-side from local data.

## 2. Current state (dormant plumbing — key discovery)

Roughly half the infrastructure already exists but is never fed data:

| Layer | State |
|---|---|
| Prisma `Expense` | `locationLat Decimal? @db.Decimal(10,8)`, `locationLng Decimal? @db.Decimal(11,8)` exist. **No `locationName`.** |
| API DTOs | `LocationDto { lat, lng, name? }` already on `CreateExpenseDto`/`UpdateExpenseDto`; `expenses.service.ts` already persists `dto.location?.lat/lng` on create AND update. `name` is silently dropped (no column). |
| Mobile SQLite | `location_lat`, `location_lng`, `location_name` columns exist; `expenseRepository` already maps them to `expense.location: {lat, lng, name}`. |
| shared-types | `Expense.location?: {lat, lng, name?}` + `locationLat/locationLng` exist. |
| OCR | `ocr.service.ts` prompt already extracts `merchantAddress` into `ReceiptData` — nothing consumes it. |
| E2EE | `ENCRYPTION_FIELDS.expense.tier1` already includes `locationName`. |
| Map tech | `react-native-webview` 13.15.0 already a dependency. No map library, no `expo-location`. |
| Sync | `SyncExpensePayload` / mobile sync push do NOT carry location fields. |

Consequence: no schema work on mobile at all; server needs one small column + one new table.

## 3. Coordinate sources & priority

Priority order (higher wins; manual always wins):

1. **Manual pin** — user places/edits the pin on a map screen; also "Remove location".
2. **OCR receipt address → server-side geocoding** — primary automatic source. Works even when the receipt is scanned at home hours later, because the address is printed on the receipt.
3. **Device GPS at creation time** — global opt-in toggle (default OFF). When enabled, coordinates are silently attached to expenses created "live": manual entry, voice, and **bank-notification auto-capture** (the phone is physically at the store at payment time — the highest-accuracy signal). Also used as fallback for a scanned receipt with no readable address. Never attached to imports.

## 4. Architecture

### 4.1 Geocoding (API)

New `GeocodingService` (provider-agnostic, lives in `modules/ai/services/` next to `ocr.service.ts` since the OCR flow is its only v1 consumer):

- `geocode(address: string): Promise<{lat, lng, displayName} | null>`
- Normalize address (trim, lowercase, collapse whitespace) → look up `geocode_cache` → on miss query **Nominatim** (`https://nominatim.openstreetmap.org/search?format=json&limit=1`) → store result in cache — **including negative results** (`lat/lng = null`) so unfindable addresses are never re-queried.
- Nominatim usage-policy compliance: dedicated `User-Agent` identifying the app, in-process rate limiter ≤1 req/s (single API container, so in-process is sufficient), mandatory caching. Request timeout 5 s.
- **Fail-silent**: any geocoder failure returns `null`; receipt scanning must never break because of geocoding.
- Provider is hidden behind the service interface — swap to LocationIQ/MapTiler later without touching callers. Runtime cost: $0.

`POST /ai/scan-receipt` (and the Telegram/WhatsApp/Slack photo handlers are NOT changed in v1 — bots have no map UI; app-only) response gains `location?: { lat, lng, name }` where `name` = the raw `merchantAddress` from the receipt (human-readable, matches what the user saw printed).

### 4.2 GPS capture (mobile)

- Add `expo-location` (Expo SDK package, no codegen-heavy native module; bare workflow → add `ACCESS_COARSE_LOCATION`/`ACCESS_FINE_LOCATION` to AndroidManifest and `NSLocationWhenInUseUsageDescription` to Info.plist).
- Setting: "Attach location to new expenses" toggle (default OFF). OS permission is requested when the user enables the toggle, not at capture time. Preference stored in MMKV.
- `src/services/locationCapture.ts` — `captureCurrentLocation(): Promise<{lat,lng} | null>`: toggle off → null; permission missing → null; `Location.getCurrentPositionAsync({ accuracy: Balanced })` with ~4 s timeout → null on timeout/error. **Never blocks or delays expense save**: on form screens capture starts on mount (result is ready by the time the user finishes the form; if not ready at save, save proceeds without location); on the bank-push auto-capture path it is awaited before `addExpense` (background flow, no user waiting).
- Wire into: `expense/new.tsx`, `expense/voice.tsx`, receipt confirm (fallback only — OCR address wins), `captureService` (bank push auto-capture). Web: no-op stub.

### 4.3 Map component (mobile — no native modules, by design)

`src/components/map/ExpenseMapView.tsx` = **WebView + Leaflet + OSM raster tiles**:

- `react-native-maps` is deliberately rejected: native module + Google Maps API key + codegen risk on the Windows MAX_PATH-constrained local Android toolchain (same reason keyboard-controller was removed).
- Leaflet JS/CSS + leaflet.markercluster are **inlined into the HTML document** (bundled asset string, no runtime CDN dependency for code); tiles load from `tile.openstreetmap.org` with required attribution. Tiles need network anyway — offline shows an empty-map placeholder.
- Props: `points: Array<{ id, lat, lng, title, amountLabel }>`, `onPointPress(id)`, optional `center/zoom`, `interactive: boolean` (detail-screen mini-map disables gestures).
- Bridge: `postMessage`/`onMessage`. Pin tap → Leaflet popup "«Biedronka» · 45,80 zł" with an Open button → message to RN → `router.push('/expense/[id]')`.
- Marker clustering on by default (markercluster).
- Web platform: platform-specific `ExpenseMapView.web.tsx` renders the same HTML document in an `<iframe srcdoc>`; if that proves flaky during implementation, v1 web falls back to a "map available in the app" placeholder (web is a testing surface, per project conventions).

### 4.4 UI surfaces

1. **Expenses tab** — List/Map toggle pill (same pattern as the subscriptions List/Calendar toggle, ABA-259), expenses tab only (incomes have no location). Map mode replaces the FlatList with `ExpenseMapView` fed from the **same `filteredItems`** — period/category/merchant filters apply for free. Expenses lacking coordinates are excluded, with a small banner "N expenses have no location".
2. **Expense detail** (`expense/[id].tsx`) — when coordinates exist: compact non-interactive mini-map card + `locationName` line; tap → full-screen map centered on the pin. Edit affordances (`canEdit`-gated): "Edit location" → manual pin screen; location chip removable.
3. **Manual pin** — `app/expense/location.tsx` (modal route, with nav header per project convention): full-screen interactive map, tap-to-place pin, "my location" button, Save / Remove location. Saving calls `expenseStore.updateExpense` with the new coordinates (and clears `locationName` when the pin was moved manually, since the geocoded label no longer matches).
4. **Trip account** (`account/[id].tsx`) — "Trip map" row → navigates to the Expenses tab with a `view=map` param (the trip account is already the active account on that screen).

## 5. Data model & API changes

- **Migration 1** `add_expense_location_name`: `Expense.locationName String? @map("location_name")`. `expenses.service.ts` create/update persist `dto.location?.name`; read paths include it.
- **Migration 2** `add_geocode_cache`: `geocode_cache` (`id`, `queryNormalized @unique`, `lat Decimal?`, `lng Decimal?`, `displayName String?`, `createdAt`). Global table (not account-scoped — an address is the same for everyone; no user data stored).
- **Sync**: `SyncExpensePayload` (shared-types `dto/sync.ts`) += `locationLat`, `locationLng`, `locationName`; `sync.service.ts` expense handler persists them; mobile sync push includes them. (Do not repeat the known `shares`/`splitType` gap — location must survive the offline-retry path.)
- Scan-receipt response DTO += `location?: {lat, lng, name}`.
- No new REST endpoints. The map is rendered from data the client already has.

## 6. Privacy & E2EE

- GPS capture is **strictly opt-in** (default OFF), visible as a location chip on the expense, removable in one tap.
- `locationName` is already in `ENCRYPTION_FIELDS.expense.tier1` — E2EE accounts encrypt it today by config; it starts actually flowing now.
- **Add `locationLat`, `locationLng` to `ENCRYPTION_FIELDS.expense.tier2`** (NOT tier1 — amended during planning): the codebase's own taxonomy is tier1 = sensitive text, tier2 = tier1 + numeric fields, and `decryptFromSync` restores numeric types only for fields in the tier2 set — coordinates in tier1 would come back as strings after decryption. The server never needs coordinates for any feature — the map is client-rendered from local SQLite — so tier-2 E2EE accounts keep coordinates out of server plaintext entirely. Non-E2EE (and tier-1) accounts store them in the existing plain columns.
- Note: for E2EE users the receipt image already transits the server for OCR, so scan-time geocoding introduces no new trust assumption.

## 7. i18n

~18 new keys × **9 locales** (en/de/es/fr/pl/ru/ua/be/nl): map/list toggle, no-location banner, location chip/row, manual pin screen (title, save, remove, my-location, tap-hint), settings toggle + description, trip map row, offline-map placeholder, OSM attribution stays untranslated.

## 8. Testing

- **API**: `GeocodingService` unit tests — cache hit, cache miss → provider call, negative-cache hit, normalization, rate limiter, timeout/failure → null, scan-receipt integration passes `merchantAddress` → `location`. DTO persistence of `location.name` on create/update.
- **Mobile**: `captureCurrentLocation` (toggle off → null; permission denied → null; timeout → null); pure points-builder function (`filteredItems` → map points; rows without coords excluded; amount labels formatted per currency); source-priority logic (OCR beats GPS; manual beats both).
- Map WebView: manual verification on Android + web (documented in the PR), not unit-tested.

## 9. Phasing

1. **PR 1 — API**: migrations, `GeocodingService` + tests, scan-receipt wiring, `locationName` persistence, sync payload.
2. **PR 2 — Mobile capture**: `expo-location` + permissions, settings toggle, `locationCapture` service, wiring into create paths, detail-screen mini-map card + location row.
3. **PR 3 — Map view**: `ExpenseMapView`, Expenses-tab List/Map toggle, manual pin screen, trip account entry, i18n, docs.

Estimated total: ~4–5 working days.

## 10. Risks & limitations

- **Coverage starts at zero**: only expenses created after release get coordinates; the map fills up over weeks. Mitigate by messaging the feature at scan/creation touchpoints.
- **OSM tile policy**: fine at current scale; attribution rendered. If usage grows, switch tiles to a free-tier commercial provider (MapTiler/Carto) — one URL constant.
- **Nominatim quality**: receipt addresses are messy; expect some misses (negative-cached) and occasional wrong hits — the manual pin is the correction path.
- **WebView map UX** is less silky than a native map; accepted trade-off for zero native-module risk.
- **Geocoding latency** (up to ~5 s worst case) is absorbed inside the existing OCR scan wait, which is already multi-second.
