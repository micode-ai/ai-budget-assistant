---
title: 'Mobile Android Release'
status: running
iterations: 0
---

# Mobile Android Release

## Trigger
Manual `workflow_dispatch` on `.github/workflows/mobile-build.yml`. Inputs:
- `profile` — `preview` or `production` (default: `production`)
- `submit` — whether to push the AAB to Google Play after build (default: `true`)

A lighter EAS-only variant exists in `.github/workflows/mobile-eas-build.yml` (no local Gradle, submits to EAS cloud queue instead).

## Steps
1. Check out repo; set up Node 20, Java 17 (Temurin), Android SDK.
2. `npm ci` — install all workspace deps.
3. `eas build --platform android --profile <profile> --local` — builds AAB locally inside the runner. The `eas-build-pre-install` hook (`apps/mobile/scripts/write-google-services.js`) writes `google-services.json` from the `GOOGLE_SERVICES_JSON` secret before Gradle runs.
4. Upload AAB as GitHub Actions artifact (`app-release-<profile>`, retained 30 days).
5. If `submit=true` and `profile=production`:
   a. Write `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY` secret to disk.
   b. `eas submit --platform android --profile production` — uploads AAB to Google Play internal track.
   c. Clean up service account key file (`always()` step).

## Failure modes
- **Gradle build failure** — check the full EAS/Gradle log; usually a missing env var, native module config issue, or SDK version mismatch.
- **`google-services.json` missing** — `GOOGLE_SERVICES_JSON` secret not set or malformed; verify in repo Settings → Secrets.
- **Submit rejected by Google Play** — version code not incremented, or policy violation; bump `versionCode` in `app.config.ts` and retry.
- **Job timeout (60 min)** — local Android builds are slow; check if Gradle daemon OOMed or a dependency download stalled.
- **Service account key cleanup skipped** — `always()` step runs regardless; if it fails anyway, rotate the key in Google Cloud Console.

## Owner
Mihail Perevertkin (manual trigger per release cycle)

## Where to look first when it breaks
- GitHub Actions → "Mobile Build & Publish" run, expand "Build AAB locally"
- EAS build log URL printed in the step output
- `apps/mobile/eas.json` — build profile configuration
