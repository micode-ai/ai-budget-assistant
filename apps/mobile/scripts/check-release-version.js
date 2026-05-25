#!/usr/bin/env node
/**
 * Release version guard — run in CI before a production build/submit.
 *
 * Why this exists: this is a BARE Expo project (android/ is committed), so the
 * version shown in Google Play comes from android/app/build.gradle's
 * `versionName`, NOT from app.json. EAS only manages the build number
 * (versionCode) remotely via appVersionSource:remote + autoIncrement; it never
 * touches versionName. For a long time app.json was bumped but build.gradle was
 * not, so every release kept shipping as 1.0.0.
 *
 * This script fails the build when:
 *   1. build.gradle `versionName` != app.json `expo.version` (the exact drift
 *      that caused the bug — keep both in sync so app.json stays meaningful for
 *      the in-app update gate).
 *   2. (best effort) the version is not strictly greater than the latest
 *      `v*.*.*` git tag, if any such tags exist. No tags => this check is
 *      skipped, so adopting release tags is optional but recommended.
 *
 * Usage: node scripts/check-release-version.js   (run from apps/mobile/)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const mobileRoot = path.resolve(__dirname, '..');
const appJsonPath = path.join(mobileRoot, 'app.json');
const gradlePath = path.join(mobileRoot, 'android', 'app', 'build.gradle');

function fail(msg) {
  console.error(`\n❌ Release version check failed:\n   ${msg}\n`);
  process.exit(1);
}

// --- read app.json version ---
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
const appVersion = appJson?.expo?.version;
if (!appVersion) fail(`Could not read expo.version from ${appJsonPath}`);

// --- read build.gradle versionName ---
const gradle = fs.readFileSync(gradlePath, 'utf8');
const m = gradle.match(/versionName\s+"([^"]+)"/);
if (!m) fail(`Could not find versionName in ${gradlePath}`);
const gradleVersion = m[1];

console.log(`app.json expo.version      = ${appVersion}`);
console.log(`build.gradle versionName   = ${gradleVersion}`);

// --- check 1: the two must match (this is what Play actually shows) ---
if (appVersion !== gradleVersion) {
  fail(
    `app.json (${appVersion}) and android/app/build.gradle versionName (${gradleVersion}) ` +
      `disagree. Google Play shows the build.gradle value. Bump BOTH to the same version.`,
  );
}

// --- semver helpers ---
function parseSemver(v) {
  const mm = String(v).match(/^(\d+)\.(\d+)\.(\d+)/);
  return mm ? [Number(mm[1]), Number(mm[2]), Number(mm[3])] : null;
}
function cmp(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

// --- check 2 (best effort): must be greater than the latest v* release tag ---
let tags = [];
try {
  tags = execSync('git tag --list "v*.*.*"', { cwd: mobileRoot, encoding: 'utf8' })
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean);
} catch {
  // git not available — skip the tag check
}

const tagVersions = tags
  .map((t) => ({ tag: t, parts: parseSemver(t.replace(/^v/, '')) }))
  .filter((t) => t.parts);

if (tagVersions.length > 0) {
  tagVersions.sort((a, b) => cmp(a.parts, b.parts));
  const latest = tagVersions[tagVersions.length - 1];
  const current = parseSemver(gradleVersion);
  if (!current) fail(`versionName "${gradleVersion}" is not valid semver (x.y.z)`);
  if (cmp(current, latest.parts) <= 0) {
    fail(
      `versionName ${gradleVersion} is not greater than the latest release tag ${latest.tag}. ` +
        `Bump the version before releasing.`,
    );
  }
  console.log(`latest release tag         = ${latest.tag} (ok, ${gradleVersion} is newer)`);
} else {
  console.log('no v*.*.* release tags found — skipping "must increment" check');
}

console.log('\n✅ Release version check passed.');
