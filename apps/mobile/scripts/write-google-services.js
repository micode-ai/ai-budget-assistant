#!/usr/bin/env node
/**
 * Writes android/app/google-services.json from $GOOGLE_SERVICES_JSON env var.
 *
 * Runs as `eas-build-pre-install` — invoked by EAS Build (cloud or --local)
 * AFTER the project archive is extracted into the build workdir, BEFORE
 * `npm install` and Gradle. This is the only reliable place to materialize
 * the Firebase config without committing the file or fighting .gitignore /
 * .easignore exclusions during archive upload.
 *
 * The secret is passed in by the GitHub Actions workflow via `env:` on the
 * `eas build` step. Locally it's a no-op when the env var is absent (you
 * already have the file checked into your working tree).
 */

const fs = require('node:fs');
const path = require('node:path');

const json = process.env.GOOGLE_SERVICES_JSON;
if (!json) {
  console.log('[eas-build-pre-install] GOOGLE_SERVICES_JSON not set — skipping');
  process.exit(0);
}

const target = path.join('android', 'app', 'google-services.json');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, json);

const bytes = Buffer.byteLength(json, 'utf8');
console.log(`[eas-build-pre-install] Wrote ${target} (${bytes} bytes)`);
