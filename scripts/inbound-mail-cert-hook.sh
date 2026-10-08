#!/usr/bin/env bash
# certbot deploy hook: copy ONLY the mail-in.ai-budget.pl certificate pair into the directory the
# inbound-mail container mounts read-only (ABA-644 audit M4). The container must never see the
# rest of /etc/letsencrypt (private keys of api./admin./apex).
#
# Install (once, as root on the VPS; see docs/ops/inbound-mail.md section 2 step 6):
#   install -m 0755 /opt/ai-budget/scripts/inbound-mail-cert-hook.sh \
#     /etc/letsencrypt/renewal-hooks/deploy/inbound-mail.sh
# certbot then runs it after every successful renewal of ANY certificate, with RENEWED_LINEAGE set
# to that certificate's live dir; the script ignores every lineage but its own.
#
# Manual first run (before the container exists):
#   RENEWED_LINEAGE=/etc/letsencrypt/live/mail-in.ai-budget.pl /opt/ai-budget/scripts/inbound-mail-cert-hook.sh
#
# Idempotent: safe to run twice. No prompts. Logs to stdout.
set -euo pipefail

LINEAGE_NAME="${INBOUND_MAIL_CERT_NAME:-mail-in.ai-budget.pl}"
LE_LIVE="${LE_LIVE:-/etc/letsencrypt/live}"
DEST="${INBOUND_MAIL_TLS_DIR:-/opt/ai-budget/inbound-mail-tls}"
# The image runs as the `node` user (uid/gid 1000).
CONTAINER_GID="${INBOUND_MAIL_GID:-1000}"
OWNER="${INBOUND_MAIL_OWNER:-root}" # overridable for tests only


# Under certbot, only act for our own certificate.
if [ -n "${RENEWED_LINEAGE:-}" ] && [ "$(basename "$RENEWED_LINEAGE")" != "$LINEAGE_NAME" ]; then
  echo "inbound-mail-cert-hook: lineage $(basename "$RENEWED_LINEAGE") is not $LINEAGE_NAME, skipping"
  exit 0
fi

SRC="${RENEWED_LINEAGE:-$LE_LIVE/$LINEAGE_NAME}"
for f in fullchain.pem privkey.pem; do
  if [ ! -r "$SRC/$f" ]; then
    echo "inbound-mail-cert-hook: $SRC/$f missing or unreadable" >&2
    exit 1
  fi
done

umask 027
install -d -m 0750 -o "$OWNER" -g "$CONTAINER_GID" "$DEST"

# Write to temp names in the same directory and rename: the container (mounted on the directory)
# never sees a half-written file, and the mtime change is what triggers its 6-hourly reload.
# `cat` follows certbot's live/ symlinks into archive/.
cat "$SRC/fullchain.pem" > "$DEST/.fullchain.pem.new"
cat "$SRC/privkey.pem" > "$DEST/.privkey.pem.new"
chown "$OWNER:$CONTAINER_GID" "$DEST/.fullchain.pem.new" "$DEST/.privkey.pem.new"
chmod 0644 "$DEST/.fullchain.pem.new"
chmod 0640 "$DEST/.privkey.pem.new"
mv -f "$DEST/.privkey.pem.new" "$DEST/privkey.pem"
mv -f "$DEST/.fullchain.pem.new" "$DEST/fullchain.pem"

# Sanity: the pair must match, or the container would silently fall back to no STARTTLS.
pub_cert=$(openssl x509 -in "$DEST/fullchain.pem" -noout -pubkey | openssl sha256)
pub_key=$(openssl pkey -in "$DEST/privkey.pem" -pubout | openssl sha256)
if [ "$pub_cert" != "$pub_key" ]; then
  echo "inbound-mail-cert-hook: certificate and key do NOT match in $DEST" >&2
  exit 1
fi

echo "inbound-mail-cert-hook: $DEST updated for $LINEAGE_NAME ($(openssl x509 -in "$DEST/fullchain.pem" -noout -enddate))"
