# Zero-Tap Sign-In via Restore Credentials — Stage 1 (Server) Design

From **April 2027** Google Play requires that any app supporting user sign-in —
optional or mandatory — automatically restores the user's signed-in state when
they move to a new Android device, using the Restore Credentials API. Apps that
do not get reduced visibility and publishing restrictions. Games are exempt; we
are not a game.

Today a user who replaces their phone signs in again from scratch. Session state
is a JWT pair in `expo-secure-store`, which is backed by the Android Keystore —
and Keystore material is deliberately never backed up, so nothing survives the
device transfer. That is the correct behaviour for a token store, and it is
precisely the gap restore credentials exist to fill.

The thing that makes this more than a plumbing task: **a restore credential is a
real WebAuthn public-key credential**. The client hands Credential Manager a
W3C `PublicKeyCredentialCreationOptionsJSON` and gets back an
`AuthenticatorAttestationResponse`; on the new device it gets an assertion. The
server has to verify both exactly as it would for a passkey. Google's own
documentation says restore credentials are "particularly recommended for apps
that already support passkeys because of the common underlying server-side
implementation." We have no such implementation — there is not one line of
WebAuthn anywhere in this repository.

This spec covers **stage 1 only: the server**. It is the whole cryptographic
surface, and it is fully testable without a second phone, which is why the work
is cut here.

## What already exists

- `modules/auth/` — `login`, `register`, `verifyEmail`, `refreshToken`,
  `googleLogin` (`POST /auth/google`, which verifies a Google ID token and
  returns the same shape as `/auth/login`). `auth.service.ts` already carries
  login, registration, Google, password reset and email change.
- `CacheService` — a `@Global()` ioredis wrapper, and `RedisThrottlerStorage`
  wired into `ThrottlerModule`, so rate limits survive restarts.
- API runs on `node:20-alpine` with `"module": "commonjs"`, `target: ES2021`.
- The apex `ai-budget.pl` is served by the `ai-budget-web-prod` nginx container
  from `/opt/ai-budget-web/html`, populated by `web-deploy.yml`'s rsync of the
  assembled apex tree. Its config is `try_files $uri $uri/ =404`.
- **No** `.well-known/` is published anywhere, for any purpose.
- Native-module precedent: `NotificationCaptureModule.kt` /
  `NotificationCapturePackage.kt`, legacy `ReactContextBaseJavaModule`
  registered by hand in `MainApplication.kt.getPackages()` — deliberately not a
  TurboModule, because Fabric codegen blows past the Windows MAX_PATH limit.

## Locked decisions

1. **`@simplewebauthn/server` (13.3.3), not hand-rolled verification.** Parsing
   the CBOR attestation object, decoding the COSE key and verifying an ES256
   signature is exactly the code one must not write oneself. The package ships
   dual CJS/ESM (`exports.require` is present) and declares
   `engines.node >= 20.0.0`, so it fits the CommonJS build and the Node 20
   runtime without a bundler change.
2. **A new `modules/restore-credentials/`, not more of `auth.service.ts`.** That
   file already holds five flows, and this repo has a documented habit of
   splitting services once they carry too much (`chat.service.ts`,
   `expenses.service.ts`, `admin.service.ts`, `import-bank.service.ts`). The
   routes still live under `/auth/restore*` so the public API stays coherent.
3. **Two controllers, not one.** The registration ceremony is authenticated and
   the authentication ceremony cannot be — the whole point is that the caller
   has no token yet. Splitting them means each controller carries a single
   class-level guard decision instead of alternating per-route guards, so a
   public route can never inherit a guard or, far worse, a guarded route quietly
   lose one. Precedent: `receipt-split`'s public `GuestController` sits beside
   the JWT-guarded `ReceiptSplitController`.
4. **Several credentials per user, keyed by `credentialId`.** A `@@unique` on
   `userId` would mean a second phone's registration silently overwrites the
   first, and restoring from the older backup would then fail against a public
   key the server no longer has. `allowCredentials` stays empty — the caller has
   no session, so we cannot know which credentials to offer — and the user is
   then resolved from the **stored credential row**, which we have to load
   anyway to get its public key. Resolving from the assertion's `userHandle`
   instead would add a second, client-supplied path to the same answer, and the
   row is the one we already trust.
5. **`attestation: "none"`.** Google's sample passes `"direct"`, but trust here
   comes from the origin ↔ `assetlinks.json` binding, not from the provenance of
   a system-managed authenticator. We have no reason to pin a trust anchor, and
   verifying an attestation chain we will never evaluate is theatre.
6. **Challenges live in Redis, not a table.** `CacheService`, 5-minute TTL,
   deleted at verification so an assertion cannot be replayed.
7. **Both signing certificates are trusted** — Play App Signing and the
   repository's `debug.keystore` — so the feature can be exercised on a dev
   build instead of only through an internal-testing track.

### Non-goals

- The Android native module, the `authStore` wiring and
  `clearCredentialState()` on sign-out. That is stage 2.
- iOS. Restore credentials are Android-only; there is no parallel requirement.
- Passkeys as a general sign-in method. This spec builds the machinery a passkey
  feature would reuse, but adds no user-facing passwordless login.
- Any change to `login` / `register` / `googleLogin` behaviour.

## Data

Migration `add_user_restore_credentials`, table `user_restore_credentials`:

| column | type | note |
|---|---|---|
| `id` | uuid PK | |
| `userId` | uuid | FK → `users`, `onDelete: Cascade` |
| `credentialId` | text | `@unique` — the WebAuthn credential ID, base64url |
| `publicKey` | bytes | COSE public key as returned by the library |
| `counter` | int | WebAuthn `signCount`; see edge cases |
| `transports` | text[] | may be empty |
| `createdAt` / `lastUsedAt` | timestamp | `lastUsedAt` nullable |

`@@index([userId])`. Nothing here is secret: a public key and a credential ID
are safe at rest, which is why no encryption tier applies.

## API surface

Registration — `RestoreCredentialRegistrationController`, class-level
`JwtAuthGuard`:

- `GET /auth/restore/register/options` → `PublicKeyCredentialCreationOptionsJSON`
  (`rp.id = ai-budget.pl`, `user.id` = the user's UUID as base64url,
  `user.name` = email, fresh challenge cached under `restorecred:reg:{userId}`).
- `POST /auth/restore/register` — body is the attestation JSON. Verifies,
  stores the row, returns `{ ok: true }`.
- `DELETE /auth/restore` — drops this user's rows, for sign-out.

Authentication — `RestoreCredentialAuthController`, no guard,
`@Throttle` applied (the only unauthenticated surface besides the existing
guest/webhook routes):

- `GET /auth/restore/options` → `PublicKeyCredentialRequestOptionsJSON`, empty
  `allowCredentials`, challenge cached under `restorecred:auth:{challenge}`.
- `POST /auth/restore` — body is the assertion JSON. Verifies, resolves the user
  from the stored credential row, bumps `counter`/`lastUsedAt`, and returns
  **the same shape as `/auth/login` and `/auth/google`** so the client has one
  response contract to handle.

## The trust chain, and the trap inside it

Credential Manager will only mint a credential for `rp.id = ai-budget.pl` if the
app is associated with that domain through Digital Asset Links. So
`https://ai-budget.pl/.well-known/assetlinks.json` must exist and list the app's
signing certificates with the `delegate_permission/common.get_login_creds`
relation. The file has to be added to the assembled apex tree in
`web-deploy.yml`; the apex container serves static files with
`try_files $uri $uri/ =404`, so a file that is not shipped is a silent 404 and
the whole feature fails with a confusing client-side error.

The trap: **the same SHA-256 fingerprint is needed in two different encodings.**

- `assetlinks.json` wants uppercase hex, colon-separated: `AB:CD:EF:…`
- The WebAuthn `origin` is `android:apk-key-hash:<base64url>` — base64url of the
  *same 32 raw bytes*, unpadded.

Confusing the two is the most likely way to lose a day to "signature does not
verify". A pure `fingerprintHexToApkKeyHash()` helper with unit tests is
therefore part of this stage, not an afterthought.

`expectedRPID` is `ai-budget.pl`. `expectedOrigin` is an **array** of both
apk-key-hash origins (release and debug), which SimpleWebAuthn supports
directly.

Getting the fingerprints:

- debug — `cd apps/mobile/android && ./gradlew signingReport` (Gradle brings its
  own JDK; `keytool` is not on PATH on this workstation)
- release — Play Console → the app → Test and release → Setup → App signing →
  "App signing key certificate" → SHA-256

## Edge cases

- **`signCount` may always be 0.** A system-managed restore key is not a
  hardware authenticator maintaining a counter. Requiring a strictly increasing
  count would lock out every user. Accept 0, and only treat a *decrease from a
  previously non-zero value* as suspicious.
- **Replay.** The challenge is deleted on use; a second `POST` with the same
  assertion finds no cached challenge and is rejected.
- **Deactivated or unverified accounts.** The restore sign-in must apply the
  same checks `googleLogin` already does — a deactivated account is refused
  rather than silently signed in.
- **Unknown credential, or a user deleted since the backup was taken** — a clean
  401 in both cases, never a 500.
- **E2EE accounts are unaffected.** The master key is derived from the user's
  passphrase plus a salt held on the server (`profile.pbkdf2Salt`), not from
  device-local material, so a restored user is prompted for the passphrase
  exactly as on any new device. Restoring sign-in state does not and must not
  restore data access.
- **Biometric.** On the new device `secureStorage` is empty, so `biometricEnabled`
  is absent and no lock is armed. This is acceptable rather than a regression:
  Google will not place a restore key in cloud backup at all unless the device
  has a screen lock, so the restored session is already behind the OS lock.

## Testing

Everything below runs without a device.

- `fingerprintHexToApkKeyHash` — hex → base64url, including the colon-stripping
  and unpadded output.
- Registration: a valid attestation stores the row; a wrong challenge, an
  unlisted origin, and a mismatched RP ID each reject.
- Authentication: a valid assertion returns tokens for the right user; replaying
  it fails; `signCount: 0` succeeds; a decreasing non-zero counter fails; an
  unknown credential gives 401; a deactivated user is refused.
- Controller specs pin that `/auth/restore/options` and `POST /auth/restore` are
  reachable **without** a JWT and that the registration routes are not — the
  single most damaging thing to get wrong here.

`@simplewebauthn/server` is **mocked** in the service specs. Its test vectors
are not exported from the npm package, and hand-building a valid CBOR
attestation to exercise someone else's well-tested signature verification would
test the library, not us. What we own — challenge issue/lookup/expiry, replay
rejection, the counter rule, credential lookup, user resolution, the `isActive`
check — is all reachable with the library stubbed. The one piece of real
cryptographic encoding we do own, the fingerprint conversion, is tested for
real.

## What we do not know

- Whether the restore provider accepts `attestation: "none"`; the sample uses
  `"direct"`. If creation throws `CreateRestoreCredentialDomException` in stage
  2, switching the options to `"direct"` is a one-line change and needs no
  server-side verification change, since we pin no trust anchor either way.
- Whether `signCount` is genuinely always 0 — hence accepting it rather than
  asserting a behaviour we have not observed.
- The Play App Signing SHA-256 is not yet in hand; it comes from Play Console.
- Exact `androidx.credentials` version for stage 2. Restore credentials landed
  in `1.5.0-alpha03`; the current sample pins `1.7.0-alpha03`. Shipping an alpha
  androidx library to production is a stage-2 decision, not settled here.
- End-to-end behaviour is unverifiable until stage 2 plus a real device-to-device
  transfer or cloud-backup restore. Stage 1 can be proven correct, but not
  proven *sufficient*.

## Follow-ups

- Stage 2: Kotlin module over `androidx.credentials`, JS bridge, creation after
  login / Google login / on launch when already signed in behind a
  `hasSyncedRestoreCredential` flag, `clearCredentialState()` plus
  `DELETE /auth/restore` on sign-out.
- The machinery here is most of a passkey implementation. Offering passkeys as a
  real sign-in method later is a small addition, and worth considering on its
  own merits rather than as a side effect.
