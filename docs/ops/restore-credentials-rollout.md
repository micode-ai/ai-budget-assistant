# Restore credentials (Android zero-tap sign-in) rollout

Stage 1 of this feature gives the API a WebAuthn-based "restore credential" —
after a user transfers to a new Android device (or reinstalls), Credential
Manager can present a passkey-like credential scoped to `rp.id = ai-budget.pl`
and sign the user back in with no password, without them ever entering
credentials on the new device. `RestoreCredentialsService`
(`apps/api/src/modules/restore-credentials/restore-credentials.service.ts`)
implements the registration and authentication ceremonies; two controllers
expose five routes under `/auth/restore` (`GET .../register/options`,
`POST .../register`, `DELETE .../` — JWT-guarded — and the public,
throttled `GET .../options` / `POST /auth/restore` used by a signed-out
device).

This runbook is about the two things that have to be true in production
**before any of that can work**: the API needs to know which certificate
fingerprints to trust, and Android needs a public file on the apex domain
telling it that `com.budget.assistant` is allowed to act on behalf of
`ai-budget.pl`. Neither is code — both are configuration/deployment, which is
exactly the kind of thing that is easy to get half-right and hard to notice
until a user is stuck on a "restore my session" screen that quietly fails.

## The two env vars

Both live in `.env.example` and are consumed by
`resolveRestoreCredentialConfig` (`apps/api/src/modules/restore-credentials/restore-credential.config.ts`):

- **`RESTORE_CREDENTIAL_CERT_FINGERPRINTS`** — comma-separated list of
  SHA-256 signing-certificate fingerprints, colon-separated uppercase hex
  (the same format `keytool`/`signingReport` print, e.g.
  `FA:C6:17:45:DC:...`). Every fingerprint here is converted internally
  (`fingerprintHexToApkKeyHash`) into an `android:apk-key-hash:<base64url>`
  WebAuthn origin — **the same 32 raw bytes, two different text encodings**.
  Never hand-convert one to the other; let the code do it. This is the one
  thing that must exactly track `docs/ops/assetlinks.json`'s
  `sha256_cert_fingerprints` array (see below).
- **`RESTORE_CREDENTIAL_RP_ID`** — the WebAuthn Relying Party ID. Defaults to
  `ai-budget.pl` when unset; there should be no reason to override it in
  production.

### Where each fingerprint value actually comes from

- **Debug** (for exercising the feature on a local/dev build, signed with
  the repo's own `apps/mobile/android/app/debug.keystore`):

  ```bash
  cd apps/mobile/android && ./gradlew signingReport
  ```

  Gradle brings its own JDK, so this works even on a machine with no
  `keytool` on `PATH`. Look for the `:app:signingReport` task's `Variant:
  debug` / `Config: debug` block — its `Store:` line points at
  `apps/mobile/android/app/debug.keystore`, `Alias: androiddebugkey` — and
  take its `SHA-256:` line. **This can take several minutes on a cold Gradle
  daemon** (a first run here took ~3.5 minutes before printing anything) —
  let it finish rather than assuming it hung.

- **Release** (the one that matters for real users): **Play Console → the
  app → Test and release → Setup → App signing → "App signing key
  certificate" → SHA-256.**

  **This must be the App Signing key, not the Upload key.** Play re-signs
  every AAB you upload with its own App Signing key before it reaches a
  device — the Upload key's certificate never leaves Play Console. If you
  paste the Upload key's fingerprint here instead, everything will look
  correct in Play Console and CI, and restore will still fail for every real
  user, because the certificate Android actually sees on-device is the App
  Signing one.

Both fingerprints are trusted simultaneously (comma-separated in the env var,
both entries present in `assetlinks.json`'s `sha256_cert_fingerprints`
array) so the feature works from both a Play-distributed build and a local
debug build.

## What happens if the fingerprints var is unset

`RestoreCredentialsService`'s constructor calls `resolveRestoreCredentialConfig`
and catches a thrown error rather than letting it propagate — an unset
`RESTORE_CREDENTIAL_CERT_FINGERPRINTS` (there is no such failure mode for
`RESTORE_CREDENTIAL_RP_ID`, which just falls back to `ai-budget.pl`) logs

```
Restore credentials disabled: RESTORE_CREDENTIAL_CERT_FINGERPRINTS is not set; restore credentials cannot verify any Android origin without it
```

as a `Logger.warn` at boot and leaves the service in a disabled state. **The
API itself boots and serves everything else normally** — this is a
deliberate fail-closed-on-the-feature design, not fail-closed-on-the-app.
Every one of the five `/auth/restore*` routes calls `requireConfig()` before
doing anything else, so with the var unset all five return

```
503 Service Unavailable — "Restore credentials are not configured"
```

There is no separate feature flag: whether the module is "on" is entirely a
function of whether this one env var is set to something parseable.

## The apex file: `assetlinks.json`

`docs/ops/assetlinks.json` is the committed source of truth for
`https://ai-budget.pl/.well-known/assetlinks.json` (served as
`application/json`) — the Digital Asset Links file Android's Credential
Manager fetches to confirm `com.budget.assistant`, signed by one of the
listed certificates, is allowed to act as `ai-budget.pl` (both
`delegate_permission/common.handle_all_urls` and
`delegate_permission/common.get_login_creds`).

It is copied into the deploy's apex tree by the "Assemble apex tree" step in
`.github/workflows/web-deploy.yml`, alongside the landing/blog/help copies,
and lands at `apex/.well-known/assetlinks.json` → rsynced to
`/opt/ai-budget-web/html/.well-known/assetlinks.json` on every push to
`development`. **Do not** put this file under `docs/marketing/` — that whole
tree is gitignored except for narrow negations covering `seo/` and
`landing/`, so a file placed there would silently never be committed and the
deploy step's own `test -f` guard would fail with a confusing "file missing"
error instead of the real problem (nothing was ever added to git).

### Deploy-time placeholder guard

The same workflow step greps the copied file for the literal string
`REPLACE_WITH_` and fails the build with `::error::` if it finds it. This
exists because the real App Signing fingerprint isn't available from this
workstation (it's behind a Play Console login) — so
`docs/ops/assetlinks.json`, as committed on this branch, still carries
`REPLACE_WITH_PLAY_APP_SIGNING_SHA256` in place of the release fingerprint.
The guard is what makes it impossible to ship that placeholder to production
by accident once this branch merges — it does not relax until someone pastes
in the real value from Play Console.

Before that happens, replace **both** entries in
`sha256_cert_fingerprints` with real colon-separated uppercase-hex SHA-256
values (see **Where each fingerprint value actually comes from** above), and
update `RESTORE_CREDENTIAL_CERT_FINGERPRINTS` in `.env.production` to match —
see the next section.

## Deploying: both places, together

Once both fingerprints are real:

1. Edit `docs/ops/assetlinks.json`'s `sha256_cert_fingerprints` array, commit,
   push to `development` (the normal deploy path publishes it as part of the
   web deploy).
2. Add the same two fingerprints, comma-separated, to
   `RESTORE_CREDENTIAL_CERT_FINGERPRINTS` in `.env.production` on the VPS,
   then force-recreate the API — a plain `docker restart` does **not** reload
   `env_file` (same trap documented in `CLAUDE.md` → Production and repeated
   in every other rollout runbook in this directory):

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate api
   ```

## Post-deploy verification

Once the web-deploy workflow has run (it deploys on every push to
`development`, independent of the API deploy):

```bash
curl -sS -D- -o /dev/null https://ai-budget.pl/.well-known/assetlinks.json
curl -sS https://ai-budget.pl/.well-known/assetlinks.json | head
```

Expected: `HTTP/2 200`, a `content-type: application/json` response header,
and the JSON body itself in the second command's output.

**This step could not be run as part of authoring this runbook** — the
branch this file was written on has not been merged or deployed, so there is
nothing live to curl yet. Run it for real the first time this ships.

### The nginx dotfile caveat

A `403` or `404` here most often means nginx is refusing a dotfile path —
many stock configs carry a `location ~ /\. { deny all; }` rule, and
`.well-known` starts with a dot. If that happens, check
`/opt/ai-budget-web/default.conf` on the VPS (the inner nginx container,
`ai-budget-web-prod`) for such a rule and, if present, add an explicit
exception for `/.well-known/` **above** it so it wins by being matched first;
also check the front door, `/opt/shared-nginx/conf.d/ai-budget.conf`'s
`ai-budget.pl` server block, for the same thing.

As of this writing (2026-08-30) neither config actually has a dotfile-deny
rule: `/opt/ai-budget-web/default.conf`'s only `location` blocks are
`/_expo/`, a static-asset extension match, `= /index.html`, and a catch-all
`location / { try_files $uri $uri/ =404; }` — a `.well-known/assetlinks.json`
request falls through to that catch-all and is served as a plain static
file, and the container's `/etc/nginx/mime.types` does map `json` to
`application/json`. So the curl check above is expected to just pass with no
nginx change needed. This note stays here anyway, because a future edit to
either config (this one especially — see the ABA-366 PageSpeed hardening
entry in `CLAUDE.md`, which already touched this exact file once) could
reintroduce a deny-by-default dotfile rule without anyone connecting it to
this feature.

**If an edit to `/opt/ai-budget-web/default.conf` ever is needed**: it is a
**single-file bind mount** into `ai-budget-web-prod` (confirmed via `docker
inspect`), the same gotcha documented for `receipt-split-rollout.md`'s
sibling files — editing it with anything that replaces the inode (an editor
that does a rename-into-place, or a `mv` of a new version over it) leaves the
running container serving the **old** file. An in-place edit (`sed -i`, or
overwriting the file's contents without replacing the file itself) needs a
follow-up `docker restart ai-budget-web-prod` to actually take effect.

## Rotating the Play App Signing key

If Google ever rotates or re-keys the App Signing certificate (a rare event,
but Play does support requesting it), **both** of the following must be
updated in the same change:

1. `docs/ops/assetlinks.json`'s `sha256_cert_fingerprints` entry for the
   release certificate.
2. `RESTORE_CREDENTIAL_CERT_FINGERPRINTS` in `.env.production`, followed by
   the `--force-recreate api` command above.

**A mismatch between the two is the hardest kind of breakage to notice**: an
already-registered restore credential on an existing device is unaffected —
nothing re-validates it after the fact — so existing users see nothing
change. Only a **new** restore-credential registration (a device transfer, a
reinstall, a user granting the credential for the first time) fails, and it
fails at the WebAuthn origin-verification step inside
`verifyRegistrationResponse`/`verifyAuthenticationResponse`, which surfaces
to the app as an opaque client-side error with no server-side signal pointing
at "these two fingerprints disagree." There is no alert or health check for
this — catching it means noticing a WebAuthn origin-mismatch error case in
`RestoreCredentialsService`, or noticing new-device restore success rates
drop, since existing sessions give no evidence either way.

## Rollback

There is no feature flag independent of the env var described above.

- **Disable the feature entirely without reverting code**: unset (or blank
  out) `RESTORE_CREDENTIAL_CERT_FINGERPRINTS` in `.env.production` and
  force-recreate `api`. All five `/auth/restore*` routes immediately start
  returning `503` again; the rest of the API is unaffected (see **What
  happens if the fingerprints var is unset** above). This is the fastest way
  to pull the feature if something is wrong in production.
- **`assetlinks.json`**: reverting the file to placeholder values has no
  runtime effect on the API by itself (nothing on the server reads this
  file), but it does mean Android's Credential Manager will no longer
  recognize the app for a **new** restore-credential registration attempt —
  functionally equivalent to disabling the feature from the Android side.
  Prefer disabling via the env var above; it's immediate and doesn't wait on
  the next web-deploy + CDN/DNS propagation cycle.
- **Full revert**: a code revert of this branch's server-side module is
  outside the scope of this runbook. Note that this stage **does** add a
  table — migration `20260830120000_add_user_restore_credentials` creates
  `user_restore_credentials` (`RestoreCredential` in the Prisma schema,
  cascade-deleted with its `User`) — so a full revert is a code revert plus a
  fresh migration to drop that table, not a no-op; any already-registered
  restore credentials would be lost along with it.
