# Expense location and map

*Hub: [mobile-app](../mobile-app.md) · [api](../api.md)*

## What this is

Expenses carry `location: {lat, lng, name?}`, and the app shows them on a map — with **no native
map module**. Location comes from a manual pin, a geocoded receipt address, or silent GPS, in that
order of priority.

## Entry points

- `apps/api/src/modules/ai/services/geocoding.service.ts` — Nominatim + `geocode_cache`
- `apps/api/src/modules/ai/geocoding.module.ts` — a leaf module with no imports of its own
- `apps/api/src/modules/expenses/expense-location.util.ts` — `buildLocationColumns`
- `apps/mobile/src/services/locationCapture.ts` — `captureCurrentLocation`
- `apps/mobile/src/components/map/ExpenseMapView.tsx` — WebView + inlined Leaflet
- `apps/mobile/src/components/map/mapHtml.generated.ts` — **generated**, never edit
- `apps/mobile/app/expense/location.tsx` — the manual pin picker

Migration: `20260703161013_add_expense_location_name_and_geocode_cache`.

## Key concepts

**No native map dependency.** `react-native-maps` was deliberately rejected — native code, an API
key, and the Windows MAX_PATH codegen risk. Instead a WebView hosts an inlined Leaflet +
markercluster document over OSM raster tiles; the `.web.tsx` variant renders the same document in
an `<iframe srcDoc>`.

**Structured geocoding beats free text on receipts.** Nominatim's structured endpoint takes
`street` / `city` / `postalcode` / `country` separately. A Polish receipt prints both the store
address and the company's registered seat, and the blended free-text query returns no match and
then negative-caches it. Two tiers: full (street + city/postcode) → the exact building; on no
match, drop the street → a town centroid.

**The OCR prompt asks for the point-of-sale address only**, ignoring the registered seat and legal
name.

**Source priority: manual pin > OCR address > silent GPS.** GPS is wired through mount refs so it
never delays a save; imports never get a location.

## Invariants

**`GeocodingService` must be a single DI instance.** Its Nominatim throttle (≥1.1 s) is
instance-level state, so a second provider would pace its own gap and the two together could exceed
Nominatim's 1 req/s policy. That is why it lives in a standalone leaf `GeocodingModule` imported by
both `AiModule` and `CommunityPriceModule` — an earlier version had `CommunityPriceModule` provide
its own copy, silently splitting the throttle.

**Strip the street-type prefix before a structured query.** `ul.` / `al.` / `pl.` / `вул.` / `ул.`
— Nominatim's structured `street` wants "`<number> <name>`", and `street=ul. Wojska Polskiego 1`
returns nothing where `street=Wojska Polskiego 1` hits the exact building.

**Geocoding fails silent.** It returns `null` on any failure and never throws: receipt scanning must
not break because a geocoder was slow.

**A NULL lat/lng in `geocode_cache` is a negative cache** — "no match" — while a transient error is
deliberately NOT cached.

**`buildLocationColumns` must be spread into all THREE Prisma write sites**: the create branch, the
create-upsert **update** branch, and `update()`. The update branch was missing once and silently
dropped location on the offline-retry path — the same bug class as trip-wallet's `paidByUserId`.
Semantics: `undefined` leaves it untouched, `null` clears all three columns, and an object without a
name clears a stale name, because moving a pin by hand invalidates the geocoded label.

**`(0,0)` means "no location", not null island.** It is the zeroed plaintext of an undecryptable
E2EE tier-2 row, and every consumer treats it as absent.

**Never hand-edit `mapHtml.generated.ts`.** Regenerate with `npm run generate:map-html` from
`apps/mobile`; the script reads the monorepo ROOT `node_modules`, where Leaflet hoists.

**Embed the default marker PNGs as base64.** Leaflet's CSS references the marker images by relative
URL, which cannot resolve inside a single self-contained document — without this the pin lands in
the right place with no icon at all.

**Do not re-inject an unchanged payload into the WebView.** An unrelated parent re-render would
reset pan and zoom via `clearLayers` + `fitBounds`. A `readyTick` counter plus a payload diff means
a recreated WebView process always re-syncs while a no-op render does nothing.

**`view=map` needs a nonce param.** An unchanged param value does not re-fire the effect.

## Known gaps

- The mobile update path does not re-encrypt, so pin edits push plaintext for E2EE accounts and a
  stale `encryptedPayload` can revert them on the next pull — a pre-existing pattern shared with all
  field edits.
- An offline location *clear* is lost on the retry path.
- The geocode cache upsert can race.
- The pin picker has no in-screen `canEdit` guard.

## History

ABA-310 (the feature) · ABA-311 (structured geocoding) · ABA-312 (address search) · ABA-329 (bot
receipts carry their geocoded location through, instead of dropping it) · ABA-333 (proximity
search, near-me centering, recent places, web geolocation).
