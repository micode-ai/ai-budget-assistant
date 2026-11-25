# Store Arrival and Shopping Mode (off the mainline)

*Hub: [mobile-app](../mobile-app.md) · see also [shopping-list](shopping-list.md)*

## What this is

The Store Arrival home card and the foreground-service Shopping Mode session. They live on the
`feature/shopping-mode` branch, not on `development`, because their manifest permission blocked
every Play release.

## Key concepts

**Store Arrival card + Shopping Mode live on `feature/shopping-mode`, NOT on `development` (ABA-438).** the pair (ABA-404 home card, ABA-408 foreground-service location session, ABA-437 branch clustering) was lifted off the mainline because `FOREGROUND_SERVICE_LOCATION` in `AndroidManifest.xml` makes Google Play refuse the **track update** for every submit until the Foreground service permissions declaration is filled in Play Console — so one unreleased feature froze the release pipeline for the whole app. Removed from `development` by a single forward commit (no history rewrite): the feature-only files, the `storeArrival` `WidgetKey` and its `HomeWidgetSwitch` case, the location-task registration in `index.js`, the sweep/list-sync hooks in `app/_layout.tsx`, the sign-out stop in `authStore`, the button on `app/shopping-list/index.tsx`, both manifest permissions, the `shoppingMode`/`storeArrival` i18n objects in all 9 locales, and the Shopping Mode section of `user_docs/*/38-shopping-list.md`. `expo-location`/`expo-task-manager` stay in `package.json` — `locationCapture` still needs the former and the branch needs both back. To re-land: fill the Play declaration first, then merge the branch and revert that removal commit; do NOT cherry-pick the 40 original commits, they are interleaved with unrelated ABA work.

**Why the release froze.** While the app declares `FOREGROUND_SERVICE_LOCATION` (Shopping Mode, ABA-408), `eas submit` fails at the *track update* step — the AAB uploads fine — with `Google Api Error: Invalid request - You must let us know whether your app uses any Foreground Service permissions.` fastlane retries it five times and every attempt fails identically, because this is a **Play Console form, not an API field**: Android 14+ requires a per-FGS-type declaration under **Play Console → the app → Policy → App content → Foreground service permissions**, stating what the feature does, why it must run as a foreground service, and (for the `location` type) usually a short video of the in-app journey. It is declared **per app, not per release**, so once filled in it stops blocking future submits. Recovery without rebuilding: the workflow already uploaded the AAB as the `app-release-production` GitHub artifact (30-day retention) — fill in the declaration, then upload that same file by hand in Play Console. A re-run of the workflow also works but burns another remote `versionCode`. Not to be confused with the much heavier `ACCESS_BACKGROUND_LOCATION` declaration, which this app deliberately does not need. **`development` no longer declares either permission** — ABA-438 moved Shopping Mode to `feature/shopping-mode` precisely so releases stop being hostage to this form — so a submit from the mainline works again without it. The declaration still has to be filled before that branch can re-land, and it is per app, not per release, so filling it early costs nothing.

## Invariants

- Fill the Play Console *Foreground service permissions* declaration **before** re-landing the branch.
- Re-land by merging the branch and reverting the removal commit, never by cherry-picking the original commits.

## History

ABA-404 · ABA-408 · ABA-437 · ABA-438 (moved off `development`).
