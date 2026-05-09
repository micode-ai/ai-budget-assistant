# App Update Prompt — Design

**Date:** 2026-05-08
**Status:** Approved by user (brainstorming phase)
**Scope:** API (`apps/api`), admin web (`apps/admin`), mobile (`apps/mobile`).
No changes to `packages/shared-utils`. New types added to `packages/shared-types`.

## Problem

When a new version of the AI Budget Assistant mobile app is published to Google
Play or the App Store, users on older builds have no in-app signal that an
update exists. They keep using stale versions until the OS auto-updates (which
many users have disabled) or until they happen to visit the store page. For
critical fixes there is no way to nudge people to upgrade, and no kill switch
for builds that are known to be broken.

## Goal

Notify users at app launch when a newer version is available in their store,
with a dismissible modal that links straight to the store. For critical
releases, allow the admin to mark a minimum supported version — clients below
that version see a non-dismissible "must update" modal.

The "what is the latest version" value is set manually by an admin in the admin
panel after each store release. No scraping, no CI coupling.

## Non-goals

- **No push broadcast** when a new version is published. (User explicitly
  deselected this surface; keeping the admin form simple. Adding a "Notify
  users via push" checkbox later is a small follow-up.)
- **No staged rollout / per-cohort A/B.** All clients on a given platform see
  the same "latest" once it is published in the admin panel.
- **No "remind me in 24 h"** — dismiss is one-shot per `latestVersion` string.
- **No auto-detection of store version** (no Google Play / App Store scraping).
- **No web build behaviour.** The admin and the mobile-web preview never show
  the prompt; they always treat themselves as up to date.
- **No in-app inbox / notification-center entry** — the prompt only appears at
  app open / foreground.

## Architecture

```
admin panel  ──►  POST /admin/app-versions          (publish new release info)
                                                            │
                                                            ▼
mobile app   ──►  GET  /app-versions/check          (public, no auth)
                  ?platform=android&version=1.0.0
                  ◄── { latestVersion, minSupportedVersion,
                        isUpdateAvailable, isUpdateRequired,
                        releaseNotes, storeUrl }
                                                            │
                                                            ▼
                                              Modal at app open / foreground
                                              (dismissible unless
                                               isUpdateRequired)
```

A small new backend module owns "what is the latest version per platform". The
mobile app asks it on launch / foreground. The admin panel has a page to
publish a new entry after each Play / App Store release.

## Backend (`apps/api`)

### New module: `modules/app-versions/`

Files (matches existing module conventions):

- `app-versions.module.ts`
- `app-versions.controller.ts` — public `GET /app-versions/check`
- `app-versions.admin.controller.ts` — admin CRUD under `/admin/app-versions`,
  protected by `JwtAuthGuard` + the existing `AdminGuard` from
  `apps/api/src/modules/admin/admin.guard.ts` (email-allowlist via
  `ADMIN_EMAILS`). Do **not** introduce a new guard.
- `app-versions.service.ts`
- `dto/index.ts`
- `utils/semver.ts` — minimal numeric semver compare (split on `.`, compare
  segments as integers; ignore pre-release suffixes — we never publish them to
  the stores)

### Prisma model (`apps/api/prisma/schema.prisma`)

```prisma
enum AppPlatform {
  ios
  android
}

model AppVersion {
  id                  String       @id @default(cuid())
  platform            AppPlatform
  latestVersion       String       @map("latest_version")
  minSupportedVersion String       @map("min_supported_version")
  releaseNotes        Json?        @map("release_notes")    // { en: string, ru: string, ... }
  storeUrl            String       @map("store_url")
  publishedAt         DateTime     @default(now())          @map("published_at")
  updatedAt           DateTime     @updatedAt               @map("updated_at")

  @@index([platform, publishedAt(sort: Desc)])
  @@map("app_versions")
}
```

A migration is created via `npx prisma migrate dev --name add_app_versions`.

"The current latest" per platform = the row with the greatest `publishedAt` for
that platform. We never mutate historical rows; the admin always creates a new
row when announcing a new release. This gives a free audit trail and makes
"undo" trivial (delete the most-recent row, the previous one becomes current
again).

### Endpoints

**`GET /app-versions/check?platform=ios|android&version=1.2.3`** — public,
no auth required (mobile may call before login). Response:

```ts
{
  latestVersion: string;          // "1.2.3"
  minSupportedVersion: string;    // "1.0.0"
  isUpdateAvailable: boolean;     // semverLt(version, latestVersion)
  isUpdateRequired: boolean;      // semverLt(version, minSupportedVersion)
  releaseNotes: Record<string, string> | null;  // { en: "...", ru: "..." } or null
  storeUrl: string;
}
```

If no row exists for that platform yet, return `isUpdateAvailable: false`,
`isUpdateRequired: false`, `latestVersion = version` (the client's own
version), `releaseNotes: null`, and a sensible default `storeUrl` (see below).

Validation: `platform` must be `ios | android`; `version` must match
`/^\d+\.\d+\.\d+$/` (Zod via existing `ZodValidationPipe`). Bad input → 400.

**`GET /admin/app-versions`** — list all rows, ordered by
`platform ASC, publishedAt DESC`. Admin-only.

**`POST /admin/app-versions`** — create a new row.
Body: `{ platform, latestVersion, minSupportedVersion, releaseNotes?, storeUrl, publishedAt? }`.
Validation: `latestVersion >= minSupportedVersion` (semver compare); both must
match the strict semver regex above; `releaseNotes` keys must be valid locale
codes (`en|de|es|fr|pl|ru|ua|be`); `en` is required if `releaseNotes` is
provided.

**`PATCH /admin/app-versions/:id`** — partial update. Same validation as POST.

**`DELETE /admin/app-versions/:id`** — hard delete. Useful to undo a bad
publish (the previous row becomes "current" again).

### Default store URLs

Hardcoded in `app-versions.service.ts` and used when an admin creates a row
without overriding:

- iOS: `https://apps.apple.com/app/id<APP_STORE_ID>` — placeholder until the
  iOS bundle is live; the admin can override per row anyway.
- Android: `https://play.google.com/store/apps/details?id=com.budget.assistant`

These constants live alongside the service so they are easy to update once.

### Shared types (`packages/shared-types`)

Add to `src/entities/index.ts`:

```ts
export type AppPlatform = 'ios' | 'android';

export interface AppVersion {
  id: string;
  platform: AppPlatform;
  latestVersion: string;
  minSupportedVersion: string;
  releaseNotes: Record<string, string> | null;
  storeUrl: string;
  publishedAt: string;
  updatedAt: string;
}
```

Add to `src/dto/index.ts`:

```ts
export interface AppVersionCheckResponse {
  latestVersion: string;
  minSupportedVersion: string;
  isUpdateAvailable: boolean;
  isUpdateRequired: boolean;
  releaseNotes: Record<string, string> | null;
  storeUrl: string;
}

export interface CreateAppVersionDto {
  platform: AppPlatform;
  latestVersion: string;
  minSupportedVersion: string;
  releaseNotes?: Record<string, string>;
  storeUrl: string;
  publishedAt?: string;
}

export type UpdateAppVersionDto = Partial<CreateAppVersionDto>;
```

## Admin panel (`apps/admin`)

### New page: `/app-versions`

- Sidebar entry "App Versions" (add to the existing nav alongside "AI Usage",
  "Communications", etc.)
- Tabs or two side-by-side cards: **Android** | **iOS**
- For each platform: a list of past releases (most recent first). The top row
  is badged "Current".
- "New release" button opens a form with:
  - Platform (radio)
  - Latest version (text, semver pattern enforced client-side)
  - Min supported version (text, semver, defaults to the current
    `minSupportedVersion`)
  - Release notes — one `<textarea>` per locale (8 locales). EN required.
  - Store URL (text, pre-filled with the platform default)
- Edit / delete buttons per row. Delete confirms with the destructive shadcn
  AlertDialog.

Implementation uses React Query (existing pattern), the `ky`-based
`api-client.ts`, and shadcn primitives (`Card`, `Tabs`, `Dialog`, `Input`,
`Textarea`, `Button`).

## Mobile (`apps/mobile`)

### New dependency

Add `expo-application` (Expo-managed, already part of the Expo SDK). Used to
read `Application.nativeApplicationVersion`. We do **not** rely on
`Constants.expoConfig.version` because it can drift from the actual binary
version after OTA-only updates.

### New files

1. **`src/services/appVersion.ts`** — pure HTTP wrapper around
   `apiClient.get('/app-versions/check', { params: { platform, version } })`.
   Returns the `AppVersionCheckResponse` typed from `shared-types`.

2. **`src/hooks/useAppVersionCheck.ts`** —
   - On mount and on `AppState` change to `active`, calls the service once
     per app session (cache the result in module scope; refresh if it has been
     more than 6 h since the last call).
   - Reads platform via `Platform.OS` and version via
     `Application.nativeApplicationVersion ?? '0.0.0'`.
   - Skips entirely on `Platform.OS === 'web'`.
   - Failures are swallowed (logged via `debug`) and return `null` —
     never blocks rendering.
   - Returns `{ status: 'available' | 'required' | 'up-to-date' | 'unknown',
     check: AppVersionCheckResponse | null }`.

3. **`src/components/UpdatePrompt.tsx`** — Modal. Two modes:
   - **available**: title `update.titleAvailable`, body
     `update.bodyAvailable` plus localized release notes, two buttons
     `update.actionUpdate` (primary) and `update.actionLater` (secondary).
   - **required**: title `update.titleRequired`, body `update.bodyRequired`,
     only `update.actionUpdate` (no Later, no close gesture, no back-button
     dismiss on Android — set `onRequestClose={() => {}}`).
   - "Update" → `Linking.openURL(check.storeUrl)`. Modal stays open; the user
     comes back to the app after updating, and the next session will see they
     are on the new version.
   - "Later" → `AsyncStorage.setItem('skippedUpdateVersion', latestVersion)`
     and unmount.
   - On mount, read `skippedUpdateVersion` from AsyncStorage. If it equals
     `check.latestVersion` and the status is `available` (not `required`),
     do not render. Force-update always renders.

4. **`src/i18n/locales/{en,de,es,fr,pl,ru,ua,be}.ts`** — add the `update.*`
   keys listed below in all 8 files.

### Integration point

Mount `<UpdatePrompt />` near the root of `app/_layout.tsx`, **outside** the
auth gate, so it works for both logged-in and logged-out users (the check
endpoint is public). The component itself decides whether to render based on
the hook's status.

The hook runs once per `AppState` `active` transition; the modal's
visibility is purely a function of `(status, skippedVersion)`.

### i18n keys (added to all 8 locales)

```
update.titleAvailable    "Update available"
update.titleRequired     "Update required"
update.bodyAvailable     "A new version of AI Budget Assistant is available."
update.bodyRequired      "This version is no longer supported. Please update to continue."
update.actionUpdate      "Update"
update.actionLater       "Later"
update.releaseNotesLabel "What's new"
```

Localized release notes from the API are picked by user locale, falling back
to `en`. If the response's `releaseNotes` is `null`, the "What's new" section
is not rendered.

## Data flow

1. App launches → `app/_layout.tsx` mounts → `useAppVersionCheck` runs.
2. Hook reads `Platform.OS` and `Application.nativeApplicationVersion`.
3. Hook calls `GET /app-versions/check?platform=android&version=1.0.0`.
4. API loads the most-recent `AppVersion` row for that platform; computes
   `isUpdateAvailable` and `isUpdateRequired` via the semver util; returns the
   payload.
5. `UpdatePrompt` reads the hook's status and the `skippedUpdateVersion` from
   AsyncStorage; renders the modal if appropriate.
6. User taps **Update** → `Linking.openURL(storeUrl)` → store handles the
   install. Modal stays mounted; when the user returns, the next foreground
   transition triggers a fresh check (now on the new version → no modal).
7. User taps **Later** → `skippedUpdateVersion = latestVersion` → modal
   unmounts; will not reappear until a *new* `latestVersion` is published.

## Failure modes

| Situation | Behaviour |
|---|---|
| `/app-versions/check` 5xx, network error, timeout | Hook returns `unknown`; modal does not render. App continues normally. Logged via `debug`. |
| Admin has not yet created a row for this platform | API returns `isUpdateAvailable: false`; modal does not render. |
| `nativeApplicationVersion` is `null` (rare, pre-build dev mode) | Hook treats version as `'0.0.0'` so the dev sees the modal — useful for QA. Production builds always have a real version. |
| Web build (`Platform.OS === 'web'`) | Hook returns `unknown` immediately, no API call. |
| Malformed semver from the API | Service throws inside the comparator; hook swallows and returns `unknown`. |
| User taps Update but the store link is wrong | App stays on the modal; they hit Later or kill the app. Follow-up: admin can edit the row to fix the URL. |

## Testing

- **API unit:** semver compare util — table-driven tests for
  `1.0.0 < 1.0.1`, `1.10.0 > 1.9.0`, `1.0.0 === 1.0.0`, malformed input throws.
- **API e2e:** `/app-versions/check` with no rows → up-to-date; with a row
  greater than the client version → `isUpdateAvailable=true`; client below
  `minSupportedVersion` → `isUpdateRequired=true`; admin POST then GET round
  trip; non-admin POST → 403.
- **Admin:** smoke render of the page with a mocked list response; form
  submit calls the right endpoint with the right body.
- **Mobile:** mock `appVersion.ts` and `Application.nativeApplicationVersion`
  in tests. Cases: no row → no modal; available + skippedVersion equal → no
  modal; available + skippedVersion different → modal renders; required →
  modal renders even if skipped; web → no API call.

## Manual test plan

- [ ] Admin creates an `android` row with `latestVersion=1.1.0`, `min=1.0.0`,
      release notes EN+RU. Mobile (built as `1.0.0`) opens → "Update available"
      modal renders with the EN notes (or RU if device locale is `ru`).
- [ ] Tap **Later** → modal closes; quit + relaunch → modal does not return.
- [ ] Admin publishes a new row `latestVersion=1.2.0`. Relaunch → modal
      returns (new `latestVersion` invalidates the AsyncStorage skip).
- [ ] Admin sets `min=1.2.0`. Relaunch on `1.0.0` → modal renders without
      Later button; back-button on Android does not dismiss it.
- [ ] Tap **Update** → Play Store opens to the correct app page.
- [ ] iOS path: same flow against the `ios` platform row.
- [ ] Airplane mode → no modal, no error toast, app boots normally.
- [ ] Admin deletes the most-recent row → next mobile check shows no update.
- [ ] Web preview (`expo start --web`) → no API call, no modal.
- [ ] Spot-check translations in `ru`, `ua`, `de`.

## Risks / open questions

- **iOS App Store ID** is not yet known (the iOS build is pending). The
  default `storeUrl` for iOS is a placeholder — admins must edit the row's
  `storeUrl` per release until the App Store ID is fixed. Documented in the
  admin form's helper text.
- **Public `/app-versions/check` endpoint.** Endpoint is unauthenticated by
  design (must work pre-login). It returns no PII, but it is a new
  rate-limit-able surface. Existing global throttler (`@nestjs/throttler`,
  applied at app level) covers it.
- **AsyncStorage `skippedUpdateVersion`** is per-device, not per-account.
  Switching accounts on the same device does not re-show a previously
  dismissed prompt. That is acceptable: the prompt is about the binary, not
  about user data.
- **Foreground throttle.** Re-checking on every `AppState` `active` flip would
  be excessive. The 6 h in-memory cache is per-process; killing the app
  forces a fresh check, which is the common case.
