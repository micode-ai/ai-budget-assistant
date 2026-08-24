#!/usr/bin/env bash
# Reclaim Docker disk on the prod VPS, on a schedule rather than only on deploy.
#
# Why this exists: the same prune commands already run inside scripts/deploy.sh,
# but deploy.yml is path-filtered to apps/api, apps/admin, packages, docker and
# scripts/deploy.sh. Weeks of mobile/marketing/docs work therefore go by with no
# prune at all, and the BuildKit cache grows unattended — on 2026-08-24 it had
# reached 3.35 GB of cache plus a 1.8 GB metadata_v2.db and pushed / to 88%,
# tripping infra-watch twice. The same cause as ABA-165.
#
# Piped in over SSH by .github/workflows/docker-gc.yml:
#   ssh … 'bash -s' < scripts/docker-gc.sh
#
# SAFETY — this box is shared with other MiCode projects on ONE Docker daemon:
#   * `docker volume prune` is NEVER run. ai-budget_postgres_data and
#     ai-budget_redis_data live there, and so do other projects' volumes.
#   * `docker image prune` runs WITHOUT -a, so only dangling (untagged, unused)
#     images go. Unused-but-tagged images are another project's rollback target.
#   * The build cache is shared, so pruning it makes everyone's next build slower
#     but cannot affect correctness.
#   * The journal is vacuumed to a size, not deleted.
set -uo pipefail

THRESHOLD="${DISK_THRESHOLD:-70}"   # only act when / is above this
JOURNAL_KEEP="${JOURNAL_KEEP:-200M}"

used() { df -P / | awk 'NR==2 {gsub(/%/,"",$5); print $5}'; }

BEFORE_PCT="$(used)"
BEFORE_AVAIL="$(df -h / | awk 'NR==2 {print $4}')"
echo "disk before: ${BEFORE_PCT}% used, ${BEFORE_AVAIL} free (act above ${THRESHOLD}%)"

if [ "$BEFORE_PCT" -le "$THRESHOLD" ]; then
  echo "below threshold — nothing to do"
  exit 0
fi

echo
echo "--- build cache ---"
docker builder prune -af 2>&1 | tail -1 || echo "builder prune failed (non-fatal)"

echo
echo "--- dangling images (no -a: tagged images are left alone) ---"
docker image prune -f 2>&1 | tail -1 || echo "image prune failed (non-fatal)"

echo
echo "--- stopped containers ---"
docker container prune -f 2>&1 | tail -1 || echo "container prune failed (non-fatal)"

if command -v journalctl >/dev/null 2>&1; then
  echo
  echo "--- journal, trimmed to ${JOURNAL_KEEP} ---"
  journalctl --vacuum-size="$JOURNAL_KEEP" 2>&1 | tail -1 || echo "vacuum failed (non-fatal)"
fi

AFTER_PCT="$(used)"
AFTER_AVAIL="$(df -h / | awk 'NR==2 {print $4}')"
echo
echo "disk after: ${AFTER_PCT}% used, ${AFTER_AVAIL} free (was ${BEFORE_PCT}%)"

# Reclaimable that this script deliberately does NOT take, so the report says so
# instead of the number quietly looking wrong.
echo
echo "--- left on purpose ---"
docker system df 2>/dev/null | awk 'NR==1 || /Images|Local Volumes/'
echo "(unused-but-tagged images need -a, which would hit other projects' rollback targets)"

# Still high after cleaning is a real finding, not a success.
if [ "$AFTER_PCT" -gt 85 ]; then
  echo "STILL ABOVE 85% after cleanup — needs a human" >&2
  exit 1
fi
exit 0
