#!/usr/bin/env bash
# Build the mobile app as a STATIC web bundle (Expo web export, SPA output).
#
# Output: apps/mobile/dist/ — plain static files (index.html + one JS bundle +
# assets). No running server needed; serve them from nginx (see
# docs/ops/web-deploy.md).
#
# The API the web app talks to is baked in AT BUILD TIME from EXPO_PUBLIC_API_URL.
# Defaults to production. Override to point the build at a local/staging API:
#   EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1 scripts/build-web.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/apps/mobile"

export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-https://api.ai-budget.pl/api/v1}"
echo "==> Building web bundle against API: $EXPO_PUBLIC_API_URL"

rm -rf dist
npx expo export --platform web

# `web.output: "single"` makes Expo render its own HTML shell and ignore
# app/+html.tsx, so the PWA tags are injected here instead. Everything in
# apps/mobile/public/ (manifest + icons) is copied into dist/ by the export.
node scripts/inject-pwa-tags.js dist/index.html
grep -q 'rel="manifest"' dist/index.html   || { echo "ERROR: PWA tags missing from dist/index.html" >&2; exit 1; }

echo ""
echo "==> Done. Static site in: $ROOT/apps/mobile/dist"
echo "    Deploy with, e.g.:"
echo "    rsync -avz --delete apps/mobile/dist/ <SSH_USER>@<SSH_HOST>:/srv/ai-budget-web/"
