# Play Install Referrer: attribute the installs we cannot see

**Date:** 2026-09-15
**Status:** design approved, pending implementation plan
**Issue:** ABA-553

## Problem

Acquisition attribution only sees the web. `attribution.native.ts` is a
deliberate no-op whose own comment names this gap: "a native install has no
landing-page query string to read ... Attributing an install to the marketing
site needs the Play Install Referrer API, which is a separate piece of work."

Measured on the admin `/acquisition` page:

| Source | Signups | Share |
|---|---|---|
| Direct / unknown | 44 | 91.7% |
| landing | 3 | 6.3% |
| help | 1 | 2.1% |
| blog | 0 | 0% |

So 44 of 48 registrations are unattributable **by construction**, not by a bug:
they are app installs, and an install carries no query string. Every content and
marketing decision is currently made against the 4 signups we can see.

A second measurement, taken from prod nginx logs over 7 days, is what makes this
urgent rather than merely tidy. The blog produced 44 organic arrivals from Google
(~190/month across 243 articles) and zero attributed signups. The 417 hits
carrying `src=blog` at the app container are crawler traffic, not people: the
distribution is 31 arrivals via `loc=footer` in French, 12 via `nav` in
Belarusian, and one Hetzner address (`144.76.32.189`) accounting for 27 on its
own. Humans do not click a footer 31 times.

That is a defensible conclusion about the blog. It says nothing about where the
44 real users came from, and that is the number that matters.

## What already exists (and must not be rebuilt)

The whole chain below the client is done and stays untouched:

- `parseAcquisition(search)` already reads both our own `src`/`loc`/`lang`/`plan`
  and the standard `utm_source`/`utm_medium` (ABA-492), all-or-nothing, with
  `normalizeTag` folding a hostile or out-of-charset value into something the API
  accepts rather than dropping it.
- `auth.api.ts` already sends `acquisition: getAcquisition()` on **both**
  `/auth/register` and `/auth/google`.
- `User.acquisition{Source,Location,Language,Plan}` + `@@index` exist
  (migration `20260827120000_add_user_acquisition`).
- The admin `/acquisition` page reads them (ABA-452).

An Install Referrer string is literally a query string
(`utm_source=google-play&utm_medium=organic`), so it feeds `parseAcquisition`
with no new parsing logic. The work is confined to the client, one new endpoint,
one column, and link tagging.

## Decisions

1. **Backfill existing users, not only new installs.** Play returns the referrer
   of the original install and keeps returning it after app updates, so the
   current 44 are recoverable. Without backfill the first useful numbers arrive
   only after a month or two of fresh installs accumulate.
2. **Tag our Play links with both schemes at once.** Our own
   `src`/`loc`/`lang` keeps full fidelity (`parseAcquisition` prefers it and
   language survives); the parallel `utm_source`/`utm_medium` makes Play
   Console's own acquisition reports work. A referrer is written once at install
   and can never be re-tagged retroactively, so paying a few duplicated
   characters now avoids an unrecoverable choice later.
3. **Store the raw referrer string** in a new nullable column. The four existing
   columns are 20 characters of `[A-Za-z0-9_-]`; anything else is dropped
   silently by design. For a feature whose entire purpose is "we do not know
   where users come from", discarding the unparsed cases repeats the mistake
   being fixed, and there is no second source: nginx logs rescued the blog
   diagnosis, but an install referrer is delivered once, to the device only.

## Design

### 1. Native module (Android only)

`android/app/src/main/java/com/budget/assistant/installreferrer/`
— `InstallReferrerModule.kt` + `InstallReferrerPackage.kt`.

A legacy `ReactContextBaseJavaModule`, **no TurboModule spec**, registered by
hand in `MainApplication.kt`'s `getPackages()` beside `NotificationCapturePackage()`
and `RestoreCredentialPackage()`. This is not a style preference: Fabric codegen
exceeds the Windows MAX_PATH limit in this repo, which is why both existing
native modules are shaped this way. A third-party RN package was rejected for the
same reason — most ship a codegen spec or need autolinking configuration.

Dependency: `com.android.installreferrer:installreferrer:2.2` in `app/build.gradle`.

One `@ReactMethod fun getInstallReferrer(promise: Promise)`:

- Builds `InstallReferrerClient`, calls `startConnection`.
- `OK` → resolve the `ReferrerDetails.installReferrer` string.
- `FEATURE_NOT_SUPPORTED`, `SERVICE_UNAVAILABLE`, `DEVELOPER_ERROR`, or any
  throw → resolve **null**.
- `endConnection()` in all paths.

**The promise always resolves and never rejects** — the restore-credentials
bridge convention. `null` means "not available", which is the normal answer on a
sideloaded build, on a device without Play Services, and on every non-Play
install. A settled-flag guards against `onInstallReferrerServiceDisconnected`
firing alongside the success callback and double-settling the promise (the same
failure `RestoreCredentialModule` documents).

### 2. JS wiring: the synchronous interface is preserved

The design tension: `getAcquisition()` is **synchronous** and is called inside
the request body in `auth.api.ts`, while reading the referrer is **asynchronous**
(it needs a service connection).

Resolution — the interface does not change at all:

- `captureAcquisition()` stays `(): void` and is called from `index.js`, the same
  call site as web. On Android it starts the async read and writes the result to
  MMKV when it lands.
- `getAcquisition()` stays `(): Acquisition | undefined` and reads MMKV.
- Registration is never blocked on it. If the read has not landed, the field is
  omitted — exactly today's behaviour.

`auth.api.ts` is not touched. Storage lives in a small MMKV store (id
`acquisition`), following `firstRunStore`'s pure-`resolve*`-reader shape:
`acquisition` (JSON), `acquisitionRaw` (string), `acquisitionRead` (bool).

**First touch wins**, matching web: an existing record is never overwritten.
`acquisitionRead` is set only on a **successful** read, so a transient
`SERVICE_UNAVAILABLE` retries on the next launch instead of being recorded as a
permanent "no referrer".

iOS returns `undefined`. Apple has no equivalent API; AdServices is a different
system solving a different problem.

### 3. Backfill endpoint

`PATCH /users/me/acquisition` on `UsersController`, `JwtAuthGuard`. Body: the
same `AcquisitionDto` the registration path already sends (see section 4 — it
carries `referrerRaw` too).

The write is a single
`updateMany({ where: { id, acquisitionSource: null }, data })`. Using the filter
rather than a read-then-write makes first-touch **structural**: two concurrent
calls cannot race, and an already-attributed user can never be overwritten by a
later claim. Returns 204 unconditionally — whether this call won is not something
the client can act on.

Client side: fired from `useAuthenticatedBootstrap`, the documented home for
"on every authenticated launch" work (restore-credential registration already
hangs there), once per install behind an MMKV flag, fire-and-forget, `console.warn`
on failure per ABA-157. The flag is set after a 204 regardless of who won.

This path exists **only** for users who registered before this shipped; a new
registration carries the value in its own request body.

### 4. Schema and how the raw string travels

One additive migration: `User.acquisitionReferrerRaw String?` (truncated to 200
characters client-side). Nullable, no backfill, no index — it is read by hand
when a source needs explaining, never grouped.

Getting it to the server needs one deliberate choice, because the obvious
arrangement has a hole. The backfill endpoint alone cannot carry it: a **new**
registration already sets `acquisitionSource`, so the `acquisitionSource IS NULL`
guard would correctly refuse the later PATCH and the raw string would never be
stored for exactly the users we have the best data for.

So the raw string rides with the four columns instead:

- `Acquisition` gains an optional `referrerRaw?: string`.
- `AcquisitionDto` gains the matching optional field, validated **separately**
  from the other four: `@MaxLength(200)` and a permissive charset, never the
  20-character `SAFE` pattern. It is evidence, not a label — holding it to the
  label's charset would discard precisely the unparseable values it exists to
  preserve.
- `ACQUISITION_KEYS` is unchanged, so the `SAFE`-regex loops in
  `parseAcquisition` and `getAcquisition`'s re-validation never touch it.

`auth.api.ts` still needs no edit: it forwards whatever `getAcquisition()`
returns. The registration path therefore stores the raw string on first write,
and the backfill endpoint reuses the same DTO for pre-existing users.

### 5. Link tagging

A `play_url(loc, lang, src)` helper in all three generators, mirroring the
existing `app_url(loc, lang, src)`, emitting:

    {PLAY}&referrer=<quote("src=..&loc=..&lang=..&utm_source=..&utm_medium=..")>

Two traps, both already documented in `app_url`'s own comment: `PLAY` already
carries `?id=`, so the separator is `&`; and inside an HTML attribute it must be
written `&amp;`.

`loc` keeps using the GA4 tracker's `loc()` vocabulary — if it drifts, the click
and the signup report into different buckets and the funnel splits in half.
`build_help.py` keeps passing `src="help"`, or all 369 help pages file themselves
as blog traffic.

The nine hardcoded Play links in the landing's translated contact/legal strings
are tagged too. Left untagged, an install from one of them would arrive wearing
Play's own organic referrer and inflate the single number this feature exists to
isolate.

## Edge cases

- **Sideloaded / debug build**: no referrer. Resolves null, nothing is stored,
  `acquisitionRead` stays false. Correct — and it is why this cannot be verified
  before release.
- **Reinstall**: Play reports the *original* install's referrer. A user who
  reinstalls is credited to where they first came from, which matches the
  first-touch rule the web side already follows.
- **Organic Play search**: arrives as `utm_source=google-play&utm_medium=organic`
  and needs no tagging from us. This is expected to be the bulk of the current 44
  and is the single most valuable thing the feature reveals: it separates ASO
  working from links working.
- **`gclid`-only referrer** (Google Ads): `parseAcquisition` finds no
  `utm_source` and returns undefined, so the four columns stay empty — but the
  raw string is stored, so the case is diagnosable rather than invisible.
- **Empty referrer string**: treated as a successful read of "nothing". Stored as
  read so we stop asking; the columns stay null.
- **Web and native on the same account**: different storage, different installs.
  Whichever registration happens first carries its own value; nothing merges.

## Testing

Pure and unit-testable:

- `parseAcquisition` against the real referrer shapes: Play organic, our
  combined string, empty, `gclid`-only, and an over-long value that must
  truncate rather than drop.
- The `updateMany`-with-null-filter guard, in the users service spec: a populated
  row is not overwritten, an empty one is.
- `play_url` output in the generators: correct separator, `&amp;` inside the
  attribute, `quote()`d payload, `src="help"` from the help generator.

**Not testable here:** the native module. No device in CI, and a sideloaded build
returns no referrer, so the round trip can only be exercised by a real Play
install. This matches the restore-credentials precedent, where verification is
explicitly production-only. The success signal is the `/acquisition` page showing
values other than "Direct / unknown".

## Risks

The backfill's value rests on Play returning the original install's referrer
after an app update. This is documented behaviour, but it is unverifiable before
release, and if it does not hold, decision 1 collapses to "new installs only" —
the feature still works, it just answers nothing about the existing 44.

## Non-goals

- iOS.
- Click-to-install timestamps (`referrerClickTimestampSeconds`) — available for
  free, no question currently needs them.
- Any change to `auth.api.ts`, the four existing acquisition columns, or the
  admin page. The admin surface for `acquisitionReferrerRaw` is deliberately
  deferred: it is a diagnostic read by SQL when a source needs explaining, and
  building a UI for it before knowing what the values look like would be guessing.
- Play Console's own reports: they start working as a side effect of the utm
  half of decision 2; there is nothing to build.

## Documentation to update

- `CLAUDE.md`, the ABA-436 acquisition entry.
- **Both** privacy policies, section 2.5: the marketing copy under
  `docs/marketing/landing/legal/{en,pl}/privacy.html`, and the `gh-pages` copy at
  `{en,pl}/privacy.html` that the registration checkbox actually links. Changing
  only one leaves the policy a user accepts at signup contradicting the policy
  the site publishes — the exact gap ABA-497 had to close.
- Re-read the Play Data Safety declaration against the collected-data categories.

## Outstanding action — human required before the next store submission

**Not done by this feature, and not doable by an agent.** This feature reads a
value off the device (the Play Install Referrer), sends it to our server, and
links it to the user's account. That is exactly the shape of thing Google
Play's Data Safety form asks a developer to declare per app, in the Play
Console web UI — a form no agent can open or submit.

Before the next production submission that ships this feature, a human must
open Play Console → the app → Policy → App content → Data safety, and confirm
whether the already-declared collected-data categories cover install-source /
referrer data, adding or amending the declaration if not. This is a release
gate, not a nice-to-have: an inaccurate Data Safety declaration is itself a
Play policy violation, independent of whether the feature's engineering is
correct.
