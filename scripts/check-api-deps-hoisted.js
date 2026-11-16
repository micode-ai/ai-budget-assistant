#!/usr/bin/env node
/**
 * Deploy guard (ABA-810): every runtime dependency of apps/api must be installed
 * in the ROOT node_modules.
 *
 * docker/Dockerfile.api copies only `/app/node_modules` into the runner image —
 * never `apps/api/node_modules`. When npm nests a package there instead (it does
 * when it keeps an older copy of the same package hoisted for someone else, or
 * after a `-w apps/api` install), the build, the typecheck and every test still
 * pass locally, and the production container crash-loops on
 * `Cannot find module`. That is exactly how nodemailer 10 took the API down for
 * ~20 minutes on 2026-11-16.
 *
 * Reads package-lock.json and fails on any non-dev package under
 * `apps/api/node_modules/`. Fix by removing that lock entry and the folder, then
 * `npm install --legacy-peer-deps`, so npm re-places it at the root.
 */
const fs = require('fs');
const path = require('path');

const lockPath = path.join(__dirname, '..', 'package-lock.json');
const packages = JSON.parse(fs.readFileSync(lockPath, 'utf8')).packages || {};
const PREFIX = 'apps/api/node_modules/';

const nested = Object.entries(packages)
  .filter(([key, meta]) => key.startsWith(PREFIX) && !meta.dev && !meta.devOptional)
  .map(([key, meta]) => `${key.slice(PREFIX.length)}@${meta.version}`);

if (nested.length > 0) {
  console.error('FAIL: runtime packages nested under apps/api/node_modules (missing from the production image):');
  for (const p of nested) console.error(`  - ${p}`);
  console.error('Remove these entries from package-lock.json, delete the folders, and run `npm install --legacy-peer-deps`.');
  process.exit(1);
}
console.log('OK: every apps/api runtime dependency is in the root node_modules.');
