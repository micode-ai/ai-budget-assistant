#!/usr/bin/env bash
#
# Guard: fail if apps/api RUNTIME-imports @budget/shared-utils.
#
# The API has NO build step for workspace packages, so a runtime import loads the
# shared-utils TypeScript barrel (`export * from './validation'`), which the prod
# Node ESM runtime rejects with ERR_UNSUPPORTED_DIR_IMPORT — crash-looping the API
# (ABA-317; before that ABA-252/253 and the safe-to-spend regression). `import
# type` is erased by tsc and is safe. Test files run under Jest (ts-jest), not the
# prod ESM runtime, so they're excluded. Copy any needed runtime value into an
# API-local util (see apps/api/src/modules/insights/safe-to-spend.util.ts).
#
# Mirrors the apps/api ESLint rule (@typescript-eslint/no-restricted-imports) but
# runs standalone in CI, independent of the API's other lint errors.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

hits=$(grep -rnE "(import|export)[^;]*from '@budget/shared-utils'|require\((['\"])@budget/shared-utils" \
  "$ROOT/apps/api/src" --include='*.ts' 2>/dev/null \
  | grep -vE "\.(spec|test)\.ts:" \
  | grep -vE ":[0-9]+:[[:space:]]*(//|\*)" \
  | grep -vE "\bimport type\b|\bexport type\b" \
  || true)

if [ -n "$hits" ]; then
  echo "::error::Runtime import of @budget/shared-utils in apps/api — crashes prod ESM (ERR_UNSUPPORTED_DIR_IMPORT)." >&2
  echo "Use an API-local util instead (see apps/api/src/modules/insights/safe-to-spend.util.ts). 'import type' is allowed." >&2
  echo "$hits" >&2
  exit 1
fi

echo "OK: no runtime @budget/shared-utils imports in apps/api."
