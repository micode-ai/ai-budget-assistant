#!/usr/bin/env bash
# Production VPS health probe: root-disk usage + container state.
# Designed to be piped over SSH:  ssh user@host 'bash -s' < scripts/infra-check.sh
# Prints a human summary; exits non-zero listing every problem found (so CI can alert).
#
# Optional env (prefix the remote command, e.g. ssh host "DISK_THRESHOLD=90 bash -s" < ...):
#   DISK_THRESHOLD (default 85)  - percent used on / that triggers an alert
#   CONTAINERS     (default the 4 prod containers)
#   INBOUND_MAIL_EXPECTED (default auto) - the inbound-mail container (ABA-644) is checked only
#                  when it is expected to run: "true" forces the check, "false" skips it, "auto"
#                  reads INBOUND_MAIL_CONTAINER=true from ENV_FILE. While the profile is off
#                  (port 25 closed on purpose) nothing about it is probed or alerted.
#   ENV_FILE       (default /opt/ai-budget/.env.production)
#   TLS_CHECKEND   (default 1209600 = 14 days) - alert if the SMTP STARTTLS cert expires sooner
set -uo pipefail

DISK_THRESHOLD="${DISK_THRESHOLD:-85}"
CONTAINERS="${CONTAINERS:-budget-db-prod budget-redis-prod budget-api-prod budget-admin-prod}"

ENV_FILE="${ENV_FILE:-/opt/ai-budget/.env.production}"
INBOUND_MAIL_EXPECTED="${INBOUND_MAIL_EXPECTED:-auto}"
TLS_CHECKEND="${TLS_CHECKEND:-1209600}"
INBOUND_CONTAINER="budget-inbound-mail-prod"

inbound_expected=false
case "$INBOUND_MAIL_EXPECTED" in
  true) inbound_expected=true ;;
  false) inbound_expected=false ;;
  *)
    flag="$(grep -E '^INBOUND_MAIL_CONTAINER=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"'"'"' \r' || true)"
    [[ "$flag" == "true" ]] && inbound_expected=true
    ;;
esac
if $inbound_expected; then
  case " $CONTAINERS " in
    *" $INBOUND_CONTAINER "*) ;;
    *) CONTAINERS="$CONTAINERS $INBOUND_CONTAINER" ;;
  esac
else
  echo "Container ${INBOUND_CONTAINER}: not expected (INBOUND_MAIL_CONTAINER != true) - skipped"
fi

problems=()

# --- Disk usage on / ---
used="$(df --output=pcent / 2>/dev/null | tail -1 | tr -dc '0-9')"
if [[ -z "$used" ]]; then
  echo "Disk used on /: UNKNOWN"
  problems+=("could not read disk usage on /")
else
  echo "Disk used on /: ${used}% (threshold ${DISK_THRESHOLD}%)"
  if (( used > DISK_THRESHOLD )); then
    problems+=("disk ${used}% > ${DISK_THRESHOLD}% on /")
  fi
fi

# --- Container state ---
for c in $CONTAINERS; do
  if ! docker inspect "$c" >/dev/null 2>&1; then
    echo "Container ${c}: MISSING"
    problems+=("container ${c} does not exist")
    continue
  fi
  running="$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null)"
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$c" 2>/dev/null)"
  echo "Container ${c}: running=${running} health=${health}"
  if [[ "$running" != "true" ]]; then
    problems+=("container ${c} not running")
  elif [[ "$health" == "unhealthy" ]]; then
    problems+=("container ${c} unhealthy")
  fi
done

# --- Inbound mail TLS (only when the container is expected) ---
# Opportunistic STARTTLS means a lapsed cert fails SILENTLY for senders (they fall back to
# plaintext or defer), so the cert expiry is checked here instead.
if $inbound_expected; then
  if ! command -v openssl >/dev/null 2>&1; then
    echo "Inbound mail TLS: openssl not installed on the host - skipped"
  else
    if echo QUIT | timeout 20 openssl s_client -starttls smtp -connect 127.0.0.1:25 \
         -servername mail-in.ai-budget.pl 2>/dev/null \
       | openssl x509 -noout -checkend "$TLS_CHECKEND" >/dev/null 2>&1; then
      echo "Inbound mail TLS: STARTTLS ok, certificate valid for > $((TLS_CHECKEND / 86400)) days"
    else
      echo "Inbound mail TLS: FAILED"
      problems+=("inbound-mail STARTTLS on :25 missing, unreadable, or certificate expires within $((TLS_CHECKEND / 86400)) days")
    fi
  fi
fi

if (( ${#problems[@]} > 0 )); then
  echo "INFRA CHECK FAILED:"
  for p in "${problems[@]}"; do echo "  - $p"; done
  exit 1
fi
echo "INFRA CHECK OK"
