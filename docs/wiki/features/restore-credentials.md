# Restore credentials (Android session restore)

*Hub: [auth](../auth.md)*

## What this is

A real WebAuthn public-key credential that lets a signed-in session survive an Android device
transfer, for Google Play's April-2027 requirement. Verified exactly as a passkey would be.

## Entry points

- `apps/api/src/modules/restore-credentials/` — two controllers, deliberately not one
- `restore-credential.config.ts` — `fingerprintHexToApkKeyHash`, `resolveRestoreCredentialConfig`
- `apps/mobile/android/app/src/main/java/com/budget/assistant/restorecredentials/RestoreCredentialModule.kt`
- `apps/mobile/src/services/restoreCredentials/index.{ts,android,ios,web}.ts` — the bridge
- `apps/mobile/src/features/auth/restoreCredential.ts` — `registerRestoreCredential`,
  `attemptRestoreSession`
- `docs/ops/assetlinks.json`, `docs/ops/restore-credentials-rollout.md`

Migration: `20260830120000_add_user_restore_credentials`.

## Key concepts

**Two controllers, on purpose.** The registration controller carries a class-level `JwtAuthGuard`;
the auth controller carries none, because its caller is a freshly-restored device with no token.
Splitting them means a public route can never inherit a guard and a guarded route can never quietly
lose one. Both public routes pair `@UseGuards(ThrottlerGuard)` with `@Throttle` — this app registers
no global throttler guard, so `@Throttle` alone is inert.

**Several rows per user, deliberately.** The unique is on `credentialId`, not `userId`: a `userId`
unique would let a second device's registration overwrite the first, and restoring from that older
backup would then fail against a public key the server no longer holds.

**Challenges live in Redis** with a 300 s TTL. The auth challenge is consumed via the atomic
`CacheService.getAndDelete` (`GETDEL`) **before** signature verification, so a replay cannot race a
slow verification and two concurrent submissions of one assertion cannot both mint a session. Fails
closed on a Redis error.

**Native module conventions.** A legacy Old-Arch `ReactContextBaseJavaModule` registered by hand in
`MainApplication.kt` — no TurboModule spec, the same Windows MAX_PATH / Fabric-codegen constraint as
the notification-capture module. `androidx.credentials` is pinned to **1.6.0 stable** rather than
the sample's alpha: restore credentials need only ≥1.5.0, so the alpha buys nothing. It uses the
**callback** (`*Async`) Credential Manager APIs, not the suspend ones — a Promise is already a
callback, and the suspend variants would tie the module to an Activity-scoped coroutine scope for
no gain.

## Invariants

**`signCount` 0 is accepted.** Zero means "this authenticator does not report counts", not "the
counter went backwards" — and a restore credential's whole purpose is arriving on a device with no
guarantee the old counter travelled. A stored non-zero followed by a presented 0 is accepted too;
only both-non-zero-and-not-advancing is rejected.

**`attestationType: 'none'`.** Trust comes from the origin ↔ assetlinks binding, not attestation
provenance — which is exactly why a debug fingerprint is deliberately NOT trusted: the template
`debug.keystore`'s private key is public, and that binding is the feature's only trust anchor.

**One fingerprint, two encodings, converted in exactly one place.** `assetlinks.json` uses
colon-separated uppercase hex; the WebAuthn origin an Android app reports is unpadded base64url of
the same 32 raw bytes. `fingerprintHexToApkKeyHash` is the single conversion.

**The authenticated user comes from the stored credential row's `userId`**, never from the
assertion's `userHandle`.

**Misconfiguration must not take the API down.** `resolveRestoreCredentialConfig` throws when the
fingerprint env var is unset; the constructor catches, logs a warning and holds `config: null`; a
private `requireConfig()` throws `ServiceUnavailableException` per call. `deleteForUser` skips that
guard so sign-out cleanup still works on a misconfigured deployment.

**Every `@ReactMethod` wraps its async dispatch in a `try` that ends exactly at the call**, so a
synchronous failure (malformed request JSON, say) cannot race an already-scheduled native callback
into double-settling the Promise.

**The bridge never rejects.** Every exported function resolves; `null` means "not available", which
is the normal answer on iOS, on web, and on any Android device that was never restored.
`getRestoreCredential` fails **silently** — it is the expected outcome on every cold start on an
un-restored device, so logging would be permanent noise.

**Mark synced only after the server confirms.** `restoreCredentialFlag.markSynced` runs after the
POST succeeds; marking earlier would let a network failure permanently block retry.

**Registration must fire on every authenticated launch, not only after sign-in.** The launch path is
the load-bearing one: sign-in only reaches users who authenticate from now on, but `JWT_EXPIRES_IN`
is 7 days and the app otherwise restores its session from local storage indefinitely — so without it
the entire installed base would silently never get a credential.

**`attemptRestoreSession` is bounded at 5 s.** It runs inside `authStore.initialize()` before the
first screen draws, and an unbounded native call would freeze the app on the splash. `clearTimeout`
in `.finally()` so the loser does not leak a handle.

**A restored device marks first-run onboarding seen.** Its local SQLite is empty until the first
sync pull, and `useFirstRunOnboarding` reads exactly that signal — without this, a user with years
of history is shown "add your first expense".

**Sign-out wipes the local passkey unconditionally.** `api.deleteRestoreCredentials()` runs inside
the token-valid guard; `clearRestoreCredential()` runs outside it, so an offline sign-out still
leaves no credential a signed-out device could silently use to sign back in.

## Known gaps

- **Verification is production-only.** Nothing in a dev environment can execute the real Credential
  Manager round trip. The two signals that will confirm it: rows appearing in
  `user_restore_credentials`, and a non-null `lastUsedAt` on one of them.
- The release-key fingerprint in `docs/ops/assetlinks.json` is still a placeholder, and the deploy
  guard that rejects it **blocks the entire `web-deploy.yml` job** — its failing step runs before
  both rsyncs, so it would also freeze the SPA deploy until the Play App Signing SHA-256 is filled
  in.

## History

ABA-464 (server) · ABA-465 (Android client). Design:
`docs/superpowers/specs/2026-08-30-restore-credentials-design.md`.
