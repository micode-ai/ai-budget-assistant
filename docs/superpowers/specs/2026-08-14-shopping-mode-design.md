# Shopping Mode — Design (v1)

The Store Arrival card (ABA-404) only works while the user is looking at the
home screen. The moment that matters — walking into the shop with the phone in
a pocket — is exactly the moment nobody is looking at a home screen.

This adds an explicit, user-started mode that notifies on arrival at a known
shop and once more on the way out if anything is still unchecked, then stops by
itself.

It is deliberately **not** the geofenced version. It is the half of it that
ships without asking Google for anything.

## Locked decisions (from brainstorming)

1. **A foreground service, not background geofences.** `ACCESS_BACKGROUND_LOCATION`
   requires a Play Console declaration with a video demo, and this app already
   ships one sensitive permission (`BIND_NOTIFICATION_LISTENER_SERVICE`) that has
   to be justified. A rejection blocks *every* release, not just this feature. A
   foreground service with a visible notification is exempt from that permission
   entirely — it is how run-tracking apps read location without it. So v1 needs
   `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_LOCATION` and nothing else.
   The cost is real and is the whole trade: the user has to press a button.
2. **One shop per session: arrival, then exit, then stop.** The service lives
   exactly the length of one shop visit, which is the most honest battery story
   available. A second shop on the same trip means pressing the button again.
3. **No target selection.** One button — "I'm going shopping" — and the first
   known shop the user walks into wins. People decide *which* shop en route, and
   the app already knows all of them. Distance to every candidate is recomputed
   per update; that arithmetic is free next to the GPS itself.
4. **No native code.** `expo-location`'s `startLocationUpdatesAsync` creates and
   owns the Android foreground service. There is no Kotlin, no TurboModule, no
   codegen — and therefore none of the Windows `MAX_PATH` exposure that got
   `react-native-keyboard-controller` removed from this repo.

### Non-goals for v1

- No geofencing, no `ACCESS_BACKGROUND_LOCATION`, no Play declaration.
- No server change: no schema, no migration, no endpoint, no remote push.
- No iOS. There is no `ios/` native project in this repo and no App Store
  release; iOS is configured in `app.json` but has never shipped. Building for a
  platform that cannot be tested would be guesswork.
- No auto-start. Nothing about this begins without a deliberate press — and on
  Android 14+ that is not merely a preference: a foreground service of type
  `location` cannot legally be started from the background at all, so any future
  "just start it automatically" idea is barred by the platform, not by taste.
  Making this automatic means the geofenced version and its Play declaration.
- No "cheaper nearby", no basket comparison — same exclusions as ABA-404.

## What already exists and is reused unchanged

- `findNearbyStore({ coords, expenses, config })` (ABA-404) — the pure matcher,
  including its trusted-source rule (`ocr` / `notification` / the three bot
  sources; never `manual` or `voice`, whose coordinates are the device's position
  at form-mount time), its `minVisits` floor of 2, its lower-middle-order-statistic
  centre, and its null-island guard. **This spec adds no matching logic.** The
  reuse is the reason ABA-404 called this work "the cheap half" of the geofenced
  version.
- The Store Arrival card itself, which continues to work exactly as it does now
  and is unaffected by whether a session is running.
- `expo-location`, `expo-task-manager`, `expo-notifications` — all three are
  already dependencies. `expo-task-manager` has **no call sites anywhere in the
  app today**, so this is its first real use; expect its native side to be
  exercised for the first time on a device.

## Verified platform facts

These were checked against the installed packages rather than assumed, because
the whole design rests on them:

- `Location.startLocationUpdatesAsync(taskName, options)` accepts
  `foregroundService: { notificationTitle, notificationBody, notificationColor?,
  killServiceOnDestroy? }` (`expo-location@~19.0.8`).
- `expo-location`'s own AAR manifest already declares
  `<service android:name=".services.LocationTaskService"
  android:foregroundServiceType="location" />`. Manifest merger supplies it, so
  the app manifest needs **only the two `uses-permission` lines** — no service
  declaration of our own.
- The `expo-location` config plugin would inject those same two permissions, but
  this is a bare workflow: `apps/mobile/android/` is committed and EAS does not
  run prebuild, so the manifest is edited by hand. That is the same documented
  seam as `MainApplication.kt`'s `getPackages()`.
- `expo-notifications@~0.32.16` **no longer exports `presentNotificationAsync`**.
  A local notification is `scheduleNotificationAsync({ content, trigger: null })`.
- `TaskManager.defineTask`, `isTaskRegisteredAsync` and `unregisterTaskAsync` are
  all available.

## The constraint that shapes everything: the task may be headless

A location task can be invoked in a **headless JS context** — the process is
alive because the foreground service holds it, but React has not mounted and no
Zustand store has hydrated. Anything the task reads from a store may be empty,
and it will be empty precisely in the case the feature exists for (the app was
never opened at the shop).

So the task reads **nothing** from Zustand, and nothing from the network.

At session start, while the app is alive and its stores are populated, the app
writes one **session snapshot** to MMKV:

- the shop list — merchant name plus centre coordinate, computed from the same
  trusted-source expenses `findNearbyStore` uses
- the number of unchecked items on the active shopping list, and the first few
  of their labels
- today's Safe to Spend figure and its currency

The task then only ever: takes a position, reads MMKV, writes MMKV, and
sometimes posts a local notification. All synchronous, all safe in any context.

Snapshotting Safe to Spend is deliberate rather than lazy. It is a daily number;
it does not move meaningfully inside one shopping trip, and reaching for the
live value would mean a network call from a background task that may have no
authenticated store to read a token from. The unchecked-item count is refreshed
whenever the shopping list changes while the app is alive, so it is current in
every case except a headless wake — and there it is at worst a few minutes
stale. The notification is a nudge; one tap opens the list, which is always
live.

## The session state machine

Pure, and the only part of this feature that is unit-testable:

```
reduce(state, { coords, now }) -> { state, effect }
```

`state` carries the session's `startedAt`, whether it is `approaching` or
`inside`, and which merchant it is inside. `effect` is one of `none`,
`notifyArrival`, `notifyExit`, `stop`.

- **Arrival** — not yet inside, and `findNearbyStore` returns a match within
  `ARRIVE_RADIUS_M` (150, the same radius the card uses): become `inside` that
  merchant, emit `notifyArrival`.
- **Exit** — inside, and the distance to that same merchant's centre exceeds
  `LEAVE_RADIUS_M` (250): emit `notifyExit` when unchecked items remain, else
  `none`, and in both cases `stop`.
- **Timeout** — `now - startedAt > SESSION_MAX_MS` (2 h): `stop`, silently.

**The two radii differ on purpose, and this is the single most likely source of
a bad experience if it is got wrong.** A phone standing still at a shop entrance
reports positions that wander by tens of metres. On one shared threshold at
150 m that wander crosses the boundary repeatedly, and each crossing is an
arrival or a departure notification. The 100 m gap is hysteresis: once inside,
it takes a real walk away to get out again. Exit is also only ever evaluated
against **the merchant we are inside**, never against the nearest one, so
passing a second shop cannot end the session.

Exit is **not** exactly-once by construction, and it is worth being precise
about that rather than assuming it. The reducer returns the session unchanged
when it emits an exit, so calling it again with the same session and any
position still past the leave radius emits a second exit. Tearing the service
down is asynchronous and the service survives the app being killed, so an
update already queued when the exit decision was taken is a real path to a
duplicate notification.

What makes it once is the caller: on `stop`, the persisted session must be
cleared **synchronously, before** anything is awaited — before the
notification, not merely before `stopLocationUpdatesAsync`. The next update
then finds no session and tears down silently instead of notifying again.

## Starting and stopping

**Start** is a button on the shopping-list screen — that is where the intent
forms. A second row in the home screen's `shopping_hub` quick-action sheet was
considered and dropped: that sheet is data-driven and *already* carries a
"Shopping list" row pointing at the same screen, so another row to the same
destination under a different label would be noise rather than an entry point.
Pressing the button:

1. checks there is at least one known shop, and says so plainly if there is not,
   rather than starting a service that can never fire;
2. requests foreground location permission if it is not already granted;
3. writes the session snapshot;
4. calls `startLocationUpdatesAsync` with `accuracy: Balanced`,
   `distanceInterval: 50`, and `killServiceOnDestroy: false`.

**Permission is deliberately not gated on the Settings → Data location toggle**
that governs the passive card. Pressing this button is explicit, scoped,
per-session consent with a persistent notification visible the whole time — a
stronger signal than the toggle. Requiring the toggle as well would refuse the
feature to exactly the user who wants an explicit mode instead of continuous
tracking.

**Stop** happens three ways: the state machine's `stop`, a "Stop" affordance in
the app, and a stale-session sweep.

Dismissing the persistent notification is **not** one of them. Since Android 13
a user can swipe away an ongoing foreground-service notification, and the
service keeps running regardless. That is precisely why the in-app stop and the
timeout are load-bearing rather than belt-and-braces: for a user who has
dismissed the notification, they are the only two ways the service ever ends.

The sweep is the one that matters for correctness. `killServiceOnDestroy: false`
keeps the service alive across the app being swiped away, so a crash between
`startedAt` and any subsequent update could otherwise strand it. Every app start
therefore checks MMKV for a session older than `SESSION_MAX_MS` and stops it.
The service is also stopped defensively if `isTaskRegisteredAsync` reports it
running with no session recorded.

## What the notifications say

Both are local and both deep-link to the shopping list.

They do **not** land on the app's existing `'default'` channel, and no amount of
`content.channelId` will put them there: in `expo-notifications` 0.32 the
channel is a property of the **trigger**, not the content, so a `trigger: null`
notification short-circuits to expo's own fallback channel. That fallback is
created at `IMPORTANCE_HIGH`, so heads-up display and sound behave as intended —
the only real consequence is that these two appear under expo's fallback channel
name in Android's per-app notification settings rather than beside the app's
other alerts. Stated here because the obvious "fix" is to add a `channelId` and
it does nothing.

- **Arrival** — the shop name, the unchecked-item count, and today's Safe to
  Spend. The same two facts the card carries, for the same reason: what you came
  for, and what restrains you.
- **Exit** — the shop name and the count of what is still unchecked. Nothing
  else; a person walking to their car reads four words.

Both need new i18n keys in all 9 locales. Neither gets a per-type notification
preference toggle: the user starts each session by hand, and a mode you switched
on 40 minutes ago is not a recurring background alert. This follows the same
reasoning as `account_invitation` and `split_payment_claimed`, which are also
untoggleable one-off action requests.

## Edge cases

- **No known shops.** The button explains instead of starting. A brand-new user
  has no geotagged expenses at all, so this is the first-run state, not a rare one.
- **Permission denied.** No session starts, and the button says why once rather
  than re-prompting on every press.
- **Location services switched off at the OS level.** The service starts but no
  updates arrive; the 2 h timeout is the backstop and nothing is notified.
- **Battery.** `Balanced` accuracy plus a 50 m displacement filter means the OS
  coalesces updates and can serve them from its own fused provider. The 2 h cap
  bounds the worst case absolutely.
- **The user is already at the shop when they press the button.** The first
  update arrives inside the radius and arrival fires immediately. Correct, and
  worth stating because it means arrival is not an edge-crossing test.
- **Account switch mid-session.** The snapshot belongs to the account that
  started it. Switching accounts stops the session rather than silently
  notifying about another account's list — same class of bug as the widget's
  `currentAccountId` dependency, and cheaper to avoid than to detect.
- **Non-Android.** The button does not render. Same treatment as the
  auto-capture settings screen.
- **A second session started while one runs.** The start path stops any existing
  session first, so the task is never registered twice.

## Testing

- The reducer — unit tested: arrival, exit past the outer radius, no exit
  between the two radii, no exit for a *different* merchant, the silent
  timeout, exit-with-nothing-unchecked producing `stop` without a notification,
  and the already-inside-at-start case.
- The snapshot builder — unit tested: it must exclude untrusted sources exactly
  as `findNearbyStore` does, so a session cannot watch a shop the card would
  never match.
- Everything else — the service wiring, the headless wake, the persistent
  notification, the deep link — is a manual device pass. This repo has no React
  Native rendering test dependency and no instrumentation harness, and a
  foreground service cannot be exercised under Jest. Stating that plainly is
  better than a test that asserts a mock was called.

The device pass that actually proves the feature: start a session at home, walk
or drive to a shop with at least two receipt-scanned expenses, confirm the
arrival notification arrives with the app closed, then leave and confirm the
exit notification and that the persistent notification disappears.

## Follow-ups

- The geofenced version, which is the one that needs no button. This work is its
  groundwork twice over: the reducer and the notification copy carry across
  unchanged, and a shipped, working shopping mode is exactly the video
  demonstration and real-usage evidence the Play Console declaration asks for.
- iOS, once there is an iOS build to test on. `NSLocationAlwaysAndWhenInUse`
  and a `UIBackgroundModes` entry would be needed even for this foreground
  variant.
- Multi-shop trips, if the one-shop limit turns out to annoy people more than
  the battery cost would have.
