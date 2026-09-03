#!/usr/bin/env node
/**
 * Inject the PWA <head> tags into the exported web index.html.
 *
 * Why this exists instead of `app/+html.tsx`, which is the documented way to
 * customise the HTML shell: with `web.output: "single"` (this app's setting, and
 * what the nginx SPA fallback assumes) Expo SDK 54 renders its own built-in
 * shell and ignores `+html.tsx` entirely — verified by building with `--clear`
 * and diffing the output. Switching to `output: "static"` to get that file
 * honoured would change the rendering mode of the whole app, which is a far
 * bigger change than a manifest link is worth.
 *
 * Run from `scripts/build-web.sh`, which is also what CI runs (web-deploy.yml),
 * so the deployed bundle gets these tags too.
 *
 * Fails loudly. A silent no-op here ships an app that cannot be installed, and
 * nothing downstream would notice — the same reasoning as the assetlinks guard
 * in web-deploy.yml.
 */
const fs = require('fs');

const TAGS = `    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="theme-color" content="#E37F2B" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="AI Budget" />
`;

const file = process.argv[2];
if (!file) {
  console.error('usage: inject-pwa-tags.js <index.html>');
  process.exit(1);
}

let html;
try {
  html = fs.readFileSync(file, 'utf8');
} catch (e) {
  console.error(`[pwa] cannot read ${file}: ${e.message}`);
  process.exit(1);
}

// Idempotent: a second run over an already-processed file is a no-op, not a
// duplicated block.
if (html.includes('rel="manifest"')) {
  console.log('[pwa] tags already present, nothing to do');
  process.exit(0);
}

if (!html.includes('</head>')) {
  console.error('[pwa] no </head> in the exported HTML — Expo changed its shell');
  process.exit(1);
}

fs.writeFileSync(file, html.replace('</head>', `${TAGS}  </head>`), 'utf8');
console.log(`[pwa] injected manifest + iOS install tags into ${file}`);
