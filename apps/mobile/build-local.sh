#!/usr/bin/env bash
set -euo pipefail

# Local Android production build via Docker
# Usage: bash build-local.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Building Android .aab locally via Docker ==="
echo "This will take 10-20 minutes..."

docker run --rm -it \
  -v "$SCRIPT_DIR/../..:/repo" \
  -w /repo/apps/mobile \
  -e EXPO_TOKEN="${EXPO_TOKEN:-}" \
  node:20 bash -c "
    apt-get update -qq && apt-get install -y -qq default-jdk >/dev/null 2>&1
    npm install -g eas-cli@latest
    npm ci --prefix /repo
    eas build --platform android --profile production --local --non-interactive
  "

echo "=== Build complete! ==="
echo "Look for .aab file in apps/mobile/"
