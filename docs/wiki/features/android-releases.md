# Android releases and version numbers

*Hub: [mobile-app](../mobile-app.md) · see also [app-version-gate](app-version-gate.md)*

## What this is

How a version number is set, checked and shown on native and web, how a Play release is
published, and the Samsung Galaxy Store as a second channel. `CLAUDE.md`'s *Mobile releases*
section keeps the procedure; this page keeps the reasons.

## Entry points

`apps/mobile/android/app/build.gradle` (`versionName`), `apps/mobile/app.json` (`version`)
`apps/mobile/scripts/check-release-version.js`, `.github/workflows/mobile-build.yml`, `.github/workflows/mobile-eas-build.yml`
`apps/mobile/src/features/about/displayVersion.ts`
Runbook: `docs/ops/samsung-galaxy-store-rollout.md`

## Key concepts

**Bare Expo workflow.** — `apps/mobile/android/` is committed, so EAS builds from the native project and does **not** run prebuild or read `app.json` for the version. The version shown in **Google Play comes from `apps/mobile/android/app/build.gradle` `versionName`**, not `app.json`. `eas.json` `appVersionSource: "remote"` + production `autoIncrement: true` only manage the integer `versionCode` (build number) remotely; they never touch `versionName`. (Historically this caused every release to ship as `1.0.0` while `versionCode` quietly incremented — ABA-131.)

**Before each release.** bump `versionName` in `android/app/build.gradle` (source of truth for Play) AND `version` in `app.json` (kept in sync for the in-app update gate) to the same value. Do not hand-edit `versionCode` — EAS remote autoIncrement owns it.

**One semver, two cadences — the web carries a build id and native does not (ABA-514).** Native and web are ONE codebase and ONE `app.json` version, and they must stay that way: a different scheme would invent a distinction the source does not have and break the only thing the number is for, tying a bug report to code. What they do not share is a release cadence — `web-deploy.yml` deploys on every push to `development`, while a phone carries whatever last cleared Play review (weeks here, and once frozen outright by the foreground-service declaration, ABA-438). So a bare shared number claims two different builds are the same software, and it already did: the deployed web app read `1.25.0` while carrying commits that were in no store build. **The web therefore shows `<version>+<short sha>`** — `EXPO_PUBLIC_BUILD_SHA`, set by `web-deploy.yml` from `github.sha`, composed by pure `src/features/about/displayVersion.ts` and rendered in the **existing** version row on the About screen (no new i18n key — a second row would need eleven locales for a developer-facing string). `+` is semver **build metadata and is explicitly ignored for precedence**, so nothing that compares versions can see it: not `UpdatePrompt`/`useAppVersionCheck`, not `minSupportedVersion`, not the store-review throttle. Native passes no sha and keeps the bare version, because Play owns that string and `versionCode` is its own build identity. `displayVersion` **drops a non-hex build id rather than showing it** (the value comes from an env var, which can hold anything — including an un-expanded `${{ github.sha }}`); 7 characters, matching git's own abbreviation. **Do NOT add a `web` platform to the app-versions gate**: that gate exists because a native install can be arbitrarily old and needs forcing forward, whereas a web reload is always current — it would be a mechanism with no failure mode to prevent.

**CI guard.** `apps/mobile/scripts/check-release-version.js` runs as a production-only step in `mobile-build.yml` and `mobile-eas-build.yml`. It fails the build if `build.gradle` versionName ≠ `app.json` version, and if the version isn't strictly greater than the latest `v*.*.*` git tag (skipped only when the repo truly has no release tags). Both workflows must check out with `fetch-tags: true`: without it the script saw no tags, logged "skipping", and 1.32.0 reached Play twice (2026-09-27 and 2026-10-01) — two builds a phone shows identically. The About screen now shows `versionName (versionCode)` on native for exactly that case (ABA-629).

**Publish.** run the *Mobile Build & Publish* workflow (`mobile-build.yml`, profile `production`, submit `true`) → builds AAB `--local` → `eas submit` to the Play production track. After release, also add the new version in **admin → App Versions** so the in-app `UpdatePrompt` knows about it.

**Samsung Galaxy Store is a second, signature-separate channel (ABA-495).** runbook `docs/ops/samsung-galaxy-store-rollout.md`. Two facts that decide everything else. (1) Since **2026-09-02** Samsung blocks *every* Seller Portal submission whose binary is not ADV-approved (unconditional — not the country-scoped install block of 2026-09-30), so the certificate signing the Galaxy Store build must first be added under **Play Console → Android developer verification → `com.budget.assistant` → Add key**; that package is registered with **1 key** today (Play App Signing, 2026-04-10). (2) Play App Signing holds our app signing key and will not export it, so a Galaxy Store build is signed with the **upload key** instead — same package, different signature, therefore **mutually exclusive installs** with the Play version and no updates crossing between stores, permanently. Verified as *not* signature-bound, so nothing breaks: Google sign-in uses the **web** OAuth client via the `ai-budget.pl/oauth/callback/` relay (`EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` is dead config, read nowhere), and `google-services.json` carries no `oauth_client`/`certificate_hash` at all. The binary needs no code change — *Mobile Build & Publish* with `profile=preview, submit=false` already yields a production-API release APK (`app-release-preview` artifact), since every submit step is gated on `profile == 'production'`. Listing copy cannot be pasted from `docs/marketing/copy/google-play-listings.md` unchanged: Galaxy Store counts **bytes**, and `shortDescription` is **40 bytes** against Play's 80 chars, so all 9 locales are over (ru/ua/be by 63–67 B — UTF-8 Cyrillic leaves ~20 letters); screenshots must be ≤ **2:1**, and ours are 1080×2340 (2.17:1), so they pad to 1170×2340. Registration is free, but commercial-seller validation needs a company-domain e-mail (not the gmail Play login) plus MICODE documents, at up to 10 business days per stage. F-Droid is permanently ineligible — `LICENSE` says proprietary, not open source.

**The foreground-service declaration** that once blocked every submit is described on
[shopping-mode](shopping-mode.md).

## History

ABA-131 · ABA-438 · ABA-495 · ABA-514 · ABA-629.
