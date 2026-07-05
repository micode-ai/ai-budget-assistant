# Location Picker — Address Search — Design

**Date:** 2026-07-05
**Status:** Approved
**Scope:** Add forward-geocoding address/place search to the expense location picker (`app/expense/location.tsx`), so a pin can be set/changed by typing an address — not only by tapping the map.

## Problem

The manual pin picker (ABA-310) only supports tap-to-place, "My location", and Save. When the user knows the address/place but isn't looking at it on the map, there's no way to jump the pin there. Add a search box that geocodes a typed query and places the pin at a chosen result.

## Architecture (API-only geocoding, client renders)

Reuses the existing `GeocodingService` (Nominatim + throttle + identifying User-Agent). `geocode()` returns one result (`limit=1`); search needs several candidates.

### Server (`apps/api`)
- **`GeocodingService.search(query: string): Promise<GeocodeSearchResult[]>`** where `GeocodeSearchResult = { lat, lng, name }` (`name` = Nominatim `display_name`). Free-text Nominatim `?format=json&limit=5&q=…`, through the SAME `throttled()` serializer + 5s timeout + User-Agent. Returns `[]` for queries shorter than 3 chars and on any error (fail-silent). **Caching:** results cached in **Redis** via `CacheService` (key `geo:search:{normalizedQuery}`, TTL 3600s) — the `geocode_cache` table stores a single lat/lng per key and can't hold a list, and Nominatim's policy requires caching. `GeocodingService` gains a `@Optional() CacheService` dependency (already `@Global`).
- **`GET /ai/geocode/search?q=<query>`** on `AiController` — under the class-level `JwtAuthGuard + AccountContextGuard`; **no `AiUsageGuard`** (not an OpenAI call, free). Returns `{ results: GeocodeSearchResult[] }`. Trims/validates `q`.

### Mobile (`apps/mobile`)
- **`ai.api.ts`**: `geocodeSearch(q: string): Promise<{ results: { lat: number; lng: number; name: string }[] }>`.
- **`app/expense/location.tsx`**: a search `TextInput` at the top; debounced ~400ms call to `geocodeSearch`; a results dropdown (mirrors the invite-search result-row pattern). Tapping a result sets the pin AND recenters the map (`center` at zoom 15), clears the results, and records the result's `name`. Tap-on-map and "My location" continue to work and clear the recorded name (a hand-placed pin has no name).
- **Save contract:** if the pin came from a search result → `updateExpense(id, { location: { lat, lng, name } })`; if from tap/GPS → `{ location: { lat, lng } }` (name absent, as today). This threads the searched address into `location.name` — a real improvement over the current name-less manual pin.
- **i18n:** `location.searchPlaceholder`, `location.searchNoResults`, `location.searching` in all 9 locales.

## Data flow

Type query → debounce → `GET /ai/geocode/search` → `GeocodingService.search` (Redis cache → throttled Nominatim `limit=5`) → `{results}` → dropdown → tap → pin + center + name → Save → existing expense update/location plumbing (unchanged).

## Error handling

Fail-silent throughout: short query / network / non-OK / parse error → `[]` → dropdown shows the "no results" line. A search failure never blocks placing a pin by tap.

## Testing

- **API:** `geocoding.service.spec.ts` — `search`: `<3` chars → `[]` (no cache/network); Redis cache hit → no network; cache miss → Nominatim called with `limit=5` + query, caches the array, returns mapped results; empty array → `[]`; network error → `[]` (not cached). Controller: q passed through, empty q guarded.
- **Mobile:** debounce + result-selection are UI; verify by typecheck + manual (web).

## Out of scope

- Autocomplete-as-you-type beyond a simple debounced list; map-search overlays; using search anywhere other than the picker. `ExpenseMapView` is unchanged (already accepts `center`/`pickerPin`).

## Follow-up issue

Ties to the geo-location feature line (ABA-310/311); file as a new ABA on finish.
