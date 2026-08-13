# Store Arrival Card — Design (v1)

Every number this app computes arrives after the money is gone. Standing in a
shop is the one moment where a nudge can still change the outcome, and it is the
moment the app is uniquely equipped for: it already knows the shopping list, what
is left to spend, and — from the user's own geo-tagged expenses — which shop this
is.

This adds a home-screen widget that appears when the user is at a shop they have
bought from before, carrying the two things that matter there: what they came for,
and what they can spend.

## Locked decisions (from brainstorming)

1. **Foreground only.** No geofences, no background task, no new permission. The
   check runs when the home tab is focused. Background geofencing — the version
   that pushes a notification while the app is closed — is deliberately deferred:
   it needs `ACCESS_BACKGROUND_LOCATION` and iOS "Always", both of which draw the
   most scrutiny either store applies, on top of the `BIND_NOTIFICATION_LISTENER_SERVICE`
   permission this app already has to justify. Shipping the foreground version
   first also answers a cheaper question: whether anyone wants this at all.
2. **The existing location opt-in governs it.** `captureCurrentLocation()` is
   called *without* `force`, so the toggle in Settings → Data (default OFF)
   decides. A user who declined location is not silently GPS-located on every app
   open. The cost is reach: the feature is invisible until someone opts in.
3. **Store coordinates come from the user's own geo-tagged expenses.** The
   community store-geo table exists but its read path is kill-switched off in
   production (`COMMUNITY_PRICE_READ_ENABLED` is unset), so it is not a source
   this can build on today.
4. **A home widget, not a modal or a screen.** The home screen already has
   fourteen widgets with user-controlled visibility and ordering; this is a
   fifteenth. A modal would interrupt, which is a worse trade than being one card
   down a scroll.

### Non-goals for v1

- No geofencing, no background location, no push notification, no cron.
- No server change: no schema, no migration, no endpoint.
- No "cheaper nearby" from community prices — that read is dark in production.
- No comparison against a typical basket at this store.

## What the card shows

Two things, and deliberately only two:

- **The unchecked items on the active shopping list** — what the user came for.
- **Today's safe-to-spend figure** — what restrains them.

A third line was considered and cut: "you usually spend about X here". It is
interesting, but it neither tells the user what to do nor holds them back, and a
card at the till has room for exactly the things that do.

When the shopping list is empty the card still renders with the spend figure
alone: "you are in a shop, here is what you can spend" stands on its own.

Tapping it opens the shopping list.

## Deciding that the user is at a shop

A pure function, `findNearbyStore({ coords, expenses, config })`, returning the
matched merchant name and its distance, or `null`.

1. Take expenses that carry coordinates, group them by normalised merchant.
2. **Take the median of each merchant's coordinates, not the mean.** One stray
   geotag — a receipt scanned at home, a shopping-centre neighbour — drags a mean
   far enough to matter; a median ignores it. This is the single most likely
   source of a wrong answer and the reason the function is worth unit-testing at
   all.
3. Require at least `MIN_VISITS` (2) coordinate-bearing expenses for that
   merchant. One stray geotag must not be able to invent a shop.
4. Return the nearest merchant within `RADIUS_M` (150), else `null`.

Distance is a haversine. **It has to be a new copy, and that is worth stating
rather than discovering:** the existing one lives in
`apps/api/src/modules/price-history/basket-calculator.ts` as a *private*,
unexported function, and it is in the API, which mobile cannot import from at
all. `packages/shared-utils` has none. So this feature writes a small local
haversine in the mobile utility beside `findNearbyStore`, and the repository now
carries two.

Extracting the API's copy into `shared-utils` and having both sides use it was
considered and rejected for v1: the API cannot import runtime values from
`shared-utils` (it has no build step for workspace packages, and a pre-deploy
script fails the build over exactly that), so "sharing" it would mean the same
duplicated-pair arrangement as `financial-month.ts` — two files to keep in step —
for a five-line formula that has not changed since it was written. A second copy
with a comment pointing at the first is the smaller liability.

`(0, 0)` is skipped, following the null-island convention this codebase already
applies to expense coordinates (it is what an undecryptable tier-2 row's zeroed
plaintext looks like).

## When it runs

On focus of the home tab, via `captureCurrentLocation()` with no `force` flag.
That function already returns `null` when the opt-in toggle is off, on permission
denial, on a 4-second timeout, and on any thrown error — every one of which simply
means the card does not render. No new failure path is introduced.

The resolved position is cached briefly (5 minutes) so returning to the home tab
does not re-acquire GPS each time.

## Edge cases

- **No coordinates on any expense** (the common case for a new user, and for
  anyone who never enabled the toggle): no card, no GPS request.
- **Two shops within the radius** — nearest wins; a tie is broken by merchant
  name so the result is deterministic.
- **A merchant the user visits at several branches**: the median collapses them
  toward whichever branch dominates, so a rarely-visited branch may not match.
  Accepted for v1 — per-branch clustering is a real feature, not a tweak.
- **Viewer role**: the card is read-only information, so it renders. It does not
  offer any write action.
- **Web**: the card *can* appear. `captureCurrentLocation` checks the opt-in
  toggle first and only then branches to the browser Geolocation API, so a web
  user who enabled location and allowed the browser prompt does get a position.
  This is left as-is rather than special-cased: the card is information, not an
  interruption, and it still requires being within 150 m of a shop the user has
  actually bought from. The caveat worth knowing is that a desktop browser's
  position is often IP-derived and coarse — which in practice means it lands
  nowhere near the radius and simply produces no card, rather than a wrong one.

## Testing

- `findNearbyStore` — unit tested: median-not-mean (a stray geotag must not move
  the centre), the visit-count floor, the radius boundary, null island, tie
  determinism, and the empty cases.
- The widget itself: typecheck plus a manual pass. This codebase has no React
  Native rendering test dependency, so what CI will not verify here is the card's
  rendering and the focus-effect firing — stated rather than papered over.

## Follow-ups

- The background geofenced version, which is the one that reaches a user whose
  phone is in their pocket. This design is the cheap half of it: `findNearbyStore`
  and the card's content are exactly what that version would reuse, so the work is
  not thrown away.
- "Cheaper nearby" once the community read path is enabled.
- Per-branch clustering for chains.
