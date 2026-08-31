# Zero-Tap Sign-In via Restore Credentials — Stage 2 (Android Client) Design

Stage 1 gave the API a WebAuthn implementation: it can issue registration and
authentication options, verify what Android's Credential Manager returns, and
trade a valid assertion for a normal JWT session. Nothing calls it. This spec
is the client half — the Kotlin module that talks to Credential Manager, and
the wiring that makes a restored device sign itself in.

Google Play enforces this from **April 2027**. The deadline is not the reason
to be careful; the reason is that this is an automatic sign-in path with no
human in the loop, running before the app has drawn its first screen.

## The constraint that shapes everything below

**The core behaviour cannot be verified here.** Compiling the module, unit
testing the JS, and asserting the bridge is reachable are all possible. The
round trip that matters — create a credential on one device, restore the
session on another — needs two physical devices or a real cloud-backup
restore, and neither exists in this environment.

Registration is the asymmetric half: it IS verifiable on a single device,
because a created credential shows up as a row in `user_restore_credentials`.
Restoration is not.

The chosen response is not a feature flag. A flag would delay the moment we
learn whether this works without making it more likely to work, and it would
delay the only evidence available. Instead the feature ships and **production
tells us**: rows appearing in `user_restore_credentials` prove registration
works in the wild; a non-null `lastUsedAt` proves a real device transfer
restored a real session. No client analytics are needed — the app has none,
and this needs none.

## What already exists

- **Five endpoints**, all live in production as of ABA-464:
  `GET /auth/restore/register/options`, `POST /auth/restore/register`,
  `DELETE /auth/restore` (JWT-guarded); `GET /auth/restore/options`,
  `POST /auth/restore` (public, throttled). The last returns the same session
  JSON as `/auth/login` and `/auth/google`.
- **The trust chain is published and verified**:
  `https://ai-budget.pl/.well-known/assetlinks.json` returns 200 with the Play
  App Signing certificate's SHA-256, and the API trusts the matching
  apk-key-hash origin.
- **Native-module precedent**: `NotificationCaptureModule.kt` /
  `NotificationCapturePackage.kt`, a legacy `ReactContextBaseJavaModule`
  registered by hand in `MainApplication.kt.getPackages()` — deliberately not
  a TurboModule, because Fabric codegen exceeds the Windows MAX_PATH limit.
- **JS bridge precedent**: `src/services/notificationCapture/` with
  `index.ts` / `index.android.ts` / `index.ios.ts` / `index.web.ts`.
- `authStore.initialize()` restores a session from `secureStorage`; its
  no-session branch is a bare `set({ isInitializing: false })`.
- `useFirstRunOnboarding` routes a user to `/get-started` when local SQLite
  holds zero transactions.

## Locked decisions

1. **`androidx.credentials:credentials:1.6.0` and
   `credentials-play-services-auth:1.6.0` — the stable releases.** Restore
   credentials need 1.5.0 or higher, and 1.6.0 is stable, so the alpha
   (`1.7.0-alpha03`) that Google's sample pins is unnecessary. Do not ship an
   alpha androidx library to production for a feature this central.
2. **Registration happens on launch as well as after sign-in.** Every existing
   user is already signed in and will not log in again, so a
   registration-after-login-only design would reach new sign-ins and nobody
   else — the entire installed base would silently never get a restore
   credential. Guarded by a per-user flag so it costs one cheap check per
   launch, not a network call.
3. **The restore attempt is bounded by a 5-second timeout and swallows every
   error.** It runs inside `authStore.initialize()`, before the first screen is
   drawn. A hung Credential Manager call without a timeout freezes the app on
   the splash screen — a far worse outcome than the feature not working. Any
   failure, including the timeout, falls through to the normal login screen.
   Five seconds is a guess, and should be read as one: it is long enough for a
   Credential Manager round trip on a cold start on a slow device, and short
   enough that a user who is about to be shown a login screen anyway does not
   experience it as a hang. It lives in one named constant so it can be changed
   once production shows what the real distribution looks like. The precedent
   in this codebase is `captureCurrentLocation`'s 4-second
   `Promise.race` — same shape of problem, same answer.
4. **A restored session marks first-run onboarding as seen.** On a new device
   local SQLite is empty until the first sync pull, and `useFirstRunOnboarding`
   reads exactly that, so a user with years of history would be shown "add
   your first expense". Restoring by credential is proof the user is
   established.
5. **No project-specific debug keystore in this stage.** It is only needed to
   exercise the feature on a dev build, which the chosen verification path does
   not use, and minting one breaks Google sign-in on debug builds until the new
   SHA-1 is registered in Google Cloud Console. Deferred, with that caveat
   recorded.
6. **`E2eeUnavailableException` is retried with `isCloudBackupEnabled = false`.**
   Users without a screen lock or without Google backup would otherwise get no
   credential at all. A local-only restore key still works for a
   device-to-device cable transfer.

### Non-goals

- iOS and web. Restore credentials are Android-only; both get no-op stubs so
  the call sites need no platform branching.
- Any change to the server. Stage 1 is deployed and unchanged by this work.
- Passkeys as a user-facing sign-in method.
- Changing what E2EE requires. A restored user still enters their passphrase;
  the master key derives from it plus the server-held salt, exactly as on any
  new device.

## The native module

`apps/mobile/android/app/src/main/java/com/budget/assistant/restorecredentials/`
— `RestoreCredentialModule.kt` and `RestoreCredentialPackage.kt`, the latter
added to `MainApplication.kt.getPackages()` beside `NotificationCapturePackage()`.

Three `@ReactMethod`s, each resolving a `Promise`:

| Method | Takes | Resolves | Rejects |
|---|---|---|---|
| `createCredential(requestJson)` | `PublicKeyCredentialCreationOptionsJSON` as a string | the registration response JSON | a code + message, never a crash |
| `getCredential(requestJson)` | `PublicKeyCredentialRequestOptionsJSON` as a string | the assertion JSON | as above |
| `clearCredential()` | — | `true` | as above |

`createCredential` catches `E2eeUnavailableException` and retries once with
`isCloudBackupEnabled = false`. Every other exception is converted to a
rejection carrying a stable code, so the JS layer can tell "no credential
exists" (the ordinary case on a device that was never backed up) apart from a
real failure without string-matching.

## The JS layer

`src/services/restoreCredentials/` mirroring the notification-capture split:
`index.ts` (the typed interface plus a no-op default), `index.android.ts` (the
real bridge), `index.ios.ts` and `index.web.ts` (no-ops resolving to `null`).

Above it, `src/features/auth/restoreCredential.ts` holds the two flows as pure
orchestration over the bridge and the API client, so both are testable with the
bridge mocked:

- `registerRestoreCredential()` — fetch options, call the bridge, post the
  attestation, set the synced flag. Fail-silent; logs at `warn`, never `error`
  (the ABA-157 convention: an expected, transient failure is not exceptional).
- `attemptRestoreSession()` — fetch options, call the bridge under a timeout,
  post the assertion, return the session or `null`.

The synced flag lives in MMKV keyed by user id, so signing into a different
account on the same device registers that account too.

## Where each flow attaches

- **After sign-in** — `authStore.login`, `googleLogin`, and the verify-email
  path, fired after the session is stored, not awaited.
- **On launch when already signed in** — from `useAuthenticatedBootstrap`,
  which already owns the delayed post-login work, gated on the synced flag.
- **Restore** — in `authStore.initialize()`'s no-session branch. On success it
  stores tokens and user exactly as `login` does, marks first-run onboarding
  seen, and proceeds into the same data-hydration path. On anything else it
  falls through unchanged.
- **Sign-out** — `authStore.logout` calls `DELETE /auth/restore` while the
  token is still valid (the same ordering the push-token unregister already
  uses) and then `clearCredential()`.

## Edge cases

- **A hung native call.** Bounded by the timeout in decision 3; the boot
  continues.
- **No credential on the device** — the overwhelmingly common case, since only
  a restored or backed-up device has one. Must be indistinguishable from any
  other failure at the call site: fall through, no log noise on every cold
  start.
- **A restored session for a deactivated or deleted account.** The server
  already refuses; the client treats it as no session.
- **Multi-profile and non-mobile form factors.** Google restricts restore
  credentials to the first profile and to phones. No client handling — the call
  simply fails and we fall through.
- **Re-registration.** The server is idempotent per credential id (ABA-464), so
  a lost flag or a reinstall re-registering the same credential updates the row
  rather than failing.
- **Sign-out while offline.** The `DELETE` fails; the local
  `clearCredential()` still runs, so the device stops offering a credential
  even though the server row survives. The row is harmless — restoring it would
  need the private key that was just cleared.

## Testing

What can be tested here, and honestly nothing more:

- The two orchestration functions with the bridge and API client mocked:
  success, bridge rejection, API rejection, timeout, and the flag being set
  only after a successful post.
- The no-op stubs resolve rather than throw on iOS and web.
- `authStore.initialize()`'s no-session branch: restores when the flow returns
  a session, falls through untouched when it returns `null`, and marks
  first-run onboarding seen on success.
- A Kotlin compile check (`./gradlew :app:compileDebugKotlin`) — proof the
  module builds against the real androidx APIs, which is the only thing
  standing in for a device.

## What we do not know

- Whether Credential Manager accepts `attestation: 'none'`. Google's sample
  uses `'direct'`. If creation fails with `CreateRestoreCredentialDomException`,
  switching the server's registration options to `'direct'` is a one-line
  change needing no verification change, since no trust anchor is pinned
  either way.
- Whether a restore key reports a non-zero `signCount`. The server accepts
  either.
- How long a `getCredential` call takes on a cold start on a slow device —
  which is what the timeout value is really guessing at.
- Whether the feature works at all end to end. Production will answer this;
  nothing before production can.

## Follow-ups

- A project-specific debug keystore plus its SHA-1 in Google Cloud Console,
  when on-device debugging is wanted.
- `DELETE /auth/restore` removes every row for the user, so signing out on one
  device kills another device's restore credential. Stage 1 recorded this; the
  client contract now makes it real, and it wants a per-credential delete.
- A short-lived stolen token can re-register the same credential id and
  overwrite the legitimate device's public key, killing its restore. Not a
  privilege escalation, but worth a decision once this is in use.
