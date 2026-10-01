# App version gate

*Hub: [api](../api.md) · related: [admin-dashboard](../admin-dashboard.md)*

## What this is

How a native install learns that a newer version exists, or that its version is no longer
supported. Operators publish a release row per platform in the admin App Versions page; the app
checks it on launch and on every return to the foreground, and `UpdatePrompt` offers or forces the
update.

## Entry points

- `apps/api/src/modules/app-versions/app-versions.controller.ts` — public
  `GET /app-versions/check?platform=ios|android&version=x.y.z` (no auth: the app calls it before
  login)
- `app-versions.admin.controller.ts` — CRUD under `/admin/app-versions` (`JwtAuthGuard` +
  `AdminGuard`)
- `app-versions.service.ts` — `check`, `list`, `create`, `update`; `DEFAULT_STORE_URLS`
- `utils/semver.ts` — `compareSemver`, `isSemver`
- `apps/mobile/src/hooks/useAppVersionCheck.ts`, `apps/mobile/src/components/UpdatePrompt.tsx`
- `apps/admin/src/app/app-versions/page.tsx`, `apps/admin/src/hooks/use-app-versions.ts`

Migration: `20260508141317_add_app_versions` (`AppVersion`, indexed on `[platform, publishedAt desc]`).

## Key concepts

**The latest row wins.** `check` reads the row with the newest `publishedAt` for the platform and
returns `{latestVersion, minSupportedVersion, isUpdateAvailable, isUpdateRequired, releaseNotes,
storeUrl}` — available when the client is below `latestVersion`, required when it is below
`minSupportedVersion`. With no row for the platform the response echoes the client's own version
and says neither, with the platform's default store URL.

**`releaseNotes` is per locale** (JSON keyed by app locale); the client picks its language.

**`storeUrl` is required on every row.** The defaults in `DEFAULT_STORE_URLS` are used only when a
platform has no row; the iOS default is a placeholder until an App Store id exists.

**The client caches and re-checks.** `useAppVersionCheck` caches the result in module scope, forces
a re-check when the app returns to the foreground, and keeps its previous state on a failed fetch
rather than flipping to an error.

## Invariants

**`latestVersion >= minSupportedVersion` on every write.** `create` and `update` both enforce it via
`compareSemver`; a row that "requires" more than it offers would force every user into an update
that does not exist.

**Versions are strict `x.y.z`.** The DTOs validate with a semver regex and `compareSemver` throws
on anything else. The client sends `Application.nativeApplicationVersion`, never the web build's
`<version>+<sha>` display string — build metadata would fail validation.

**The gate is native-only.** `useAppVersionCheck` returns early on web, and there is deliberately no
`web` platform: a native install can be arbitrarily old and needs forcing forward, while a web
reload is always current.

**Add the release here after every store publish**, or `UpdatePrompt` never learns about it — the
Play version number comes from `build.gradle`, not from this table.

## History

ABA-202 (admin detail dialog) ·
ABA-514 (web build id, and why there is no web platform).
