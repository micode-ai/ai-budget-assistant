#!/usr/bin/env bash
# One-shot production disk diagnostics. Pipe over SSH:
#   ssh user@host 'bash -s' < scripts/infra-diagnostics.sh
# Read-only — prints what is consuming disk. Tolerates missing sudo (docker
# group is enough for `docker system df`; the du breakdowns need root and are
# skipped gracefully if passwordless sudo is unavailable).
set -uo pipefail

echo "===== df -h / ====="
df -h /

echo
echo "===== docker system df ====="
docker system df || true

echo
echo "===== docker system df -v (top 40 lines) ====="
docker system df -v 2>/dev/null | head -40 || true

# du breakdowns need root; try non-interactive sudo, skip if not allowed.
if sudo -n true 2>/dev/null; then
  echo
  echo "===== top of / (du -xh -d1) ====="
  sudo du -xh -d1 / 2>/dev/null | sort -rh | head -15

  echo
  echo "===== /var/lib/docker breakdown ====="
  sudo du -xh -d1 /var/lib/docker 2>/dev/null | sort -rh | head -15

  echo
  echo "===== largest container log dirs ====="
  sudo du -ah /var/lib/docker/containers 2>/dev/null | sort -rh | head -10

  echo
  echo "===== /opt/ai-budget size ====="
  sudo du -sh /opt/ai-budget 2>/dev/null
else
  echo
  echo "(passwordless sudo unavailable — skipping du breakdowns; rely on 'docker system df' above)"
fi

echo
echo "DIAGNOSTICS DONE"
