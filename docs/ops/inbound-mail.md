# Inbound e-mail receiving (e-receipts by forwarding, ABA-644)

Runbook for the receive-only SMTP container `budget-inbound-mail-prod`. Design:
`docs/superpowers/specs/2026-10-09-inbound-e-receipts-design.md`. Product side (API module
`apps/api/src/modules/inbound-mail/`, the app's "E-mail receipts" inbox) is owned by backend/mobile.

**Status: built, hardened after the ABA-644 security audit (see the table in section 1), NOT yet activated,
NOT yet tested against the internet.** Nothing in this file has
been run on the VPS. The container is behind a compose profile, so a normal deploy does not open
port 25. Every command below is for the operator to run by hand, in the order given.

## 1. Architecture and the "no outbound, no relay" guarantee

```
Gmail / Outlook / shop MTA
   | SMTP :25 (STARTTLS)    MX in.ai-budget.pl -> mail-in.ai-budget.pl (A 46.225.23.232)
   v
budget-inbound-mail-prod   Node 22 LTS, 384M, non-root, read-only rootfs, cap_drop ALL, listens 2525, host 0.0.0.0:25 (IPv4 only)
   |  network: inbound-mail-net ONLY
   |  RCPT TO  -> POST http://api:3000/api/v1/internal/inbound-mail/rcpt
   |  DATA     -> auth (SPF/DKIM/DMARC/ARC) -> pick ONE document -> POST .../internal/inbound-mail/messages
   v
budget-api-prod            (on budget-network AND inbound-mail-net) -> persists, 202, processes async
```

Guarantees, and where each one is enforced:

| Guarantee | Enforced by |
|---|---|
| Cannot send mail | The package has no outbound SMTP code; ESLint forbids `nodemailer`/`smtp-connection` imports. Hetzner also blocks outbound 25 on new projects. |
| Cannot relay | RCPT for any domain other than `INBOUND_MAIL_DOMAIN` is `550 5.7.1` before the API is even asked. AUTH is disabled. Covered by `server.integration.spec.ts` (real sockets). |
| Cannot reach Postgres or Redis | It joins only `inbound-mail-net`, which only `api` also joins. It has no `env_file`: its only secret is `INBOUND_MAIL_SHARED_SECRET`. |
| Internal API is not public | nginx `404` on `/api/v1/internal/` (section 2, step 5) AND the API answers `403` to any request carrying `X-Forwarded-For`/`X-Real-IP`, which the container never sends. |
| Hostile MIME cannot hang or exhaust it | Raw DATA bytes across all sessions are capped at 64 MB (`452 4.3.1` beyond it); an over-size or too-slow (60 s total) upload is answered and the socket dropped, never drained; authenticate + parse has a 25 s deadline (`451`); mailparser/html-to-text run in a worker thread (64 MB heap cap, 20 s timeout, terminated on expiry); at most 20 connections, 2 per IP. Covered by `dataReader.spec.ts`, `server.integration.spec.ts`, `extractInWorker.spec.ts`, `handlers.spec.ts`. |
| Gmail forwarding verification cannot be spoofed | A code is only trusted when ALL hold: exactly one From/Subject/Date header; mailauth saw exactly one header From and it equals the parsed one; a DKIM pass for `d=google.com` that mailauth reports as aligned with that From; the mail is addressed (To / Delivered-To / body) to the very RCPT token address it arrived on; Date within 30 minutes of now. Anything else is handled as an ordinary message. See `extract.security.spec.ts`. |
| Container compromise stays contained | `cap_drop: ALL`, `no-new-privileges`, read-only rootfs (tmpfs `/tmp` only), 128 pids, only the mail-in cert pair mounted (section 2 step 6), and an egress rule that allows DNS and the API only (section 2 step 7b). |
| Never opens an archive | Attachments are classified by magic bytes; only PDF/JPEG/PNG/WebP/HEIC are kept. zip/rar/docx/exe are counted and dropped. |
| No bodies in logs | Logs carry an 8-char token hash, sender domain, sizes, status codes. Never address, subject or content. |

Compose: service `inbound-mail` in `docker-compose.prod.yml`, profile `inbound-mail`, network
`inbound-mail-net` (created on every `up`, even while the profile is off). Image:
`docker/Dockerfile.inbound-mail`.

## 2. First activation

Do the steps in order. Steps 1-6 are all reversible and open nothing; step 8 is the one that opens
port 25. **Do not skip step 1**: if something else listens on :25 this design needs a re-plan.

### 0. Pre-flight on the VPS (read-only)

```bash
ssh -i ~/.ssh/id_ed25519 root@46.225.23.232
ss -ltnp 'sport = :25'            # MUST print nothing. If another project's MTA is there: STOP.
free -m                            # the box runs ~2.2 GB of our own limits; 384M more must fit
docker ps --format '{{.Names}}' | grep -i -E 'mail|postfix|smtp'   # look for a sibling MTA
dig +short in.ai-budget.pl ANY; dig +short mail-in.ai-budget.pl;  dig +short TXT in.ai-budget.pl
dig +short '*.ai-budget.pl'        # a wildcard record would shadow/confuse the new names
```

### 1. Ship the code (inactive)

Merge to `development`. `deploy.yml` now also triggers on `apps/inbound-mail/**`. The deploy:
creates `inbound-mail-net`, recreates `api` attached to both networks, and does **not** build or
start the SMTP container (`INBOUND_MAIL_CONTAINER` is unset). Confirm:

```bash
docker network ls | grep inbound-mail-net
docker inspect budget-api-prod --format '{{json .NetworkSettings.Networks}}' | grep -o 'inbound-mail-net'
ss -ltnp 'sport = :25'            # still nothing
```

### 2. Generate the shared secret

```bash
cd /opt/ai-budget
cp .env.production .env.production.bak.$(date +%F)
printf 'INBOUND_MAIL_SHARED_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env.production
grep -c '^INBOUND_MAIL_SHARED_SECRET=.' .env.production          # 1
```

Copy the same line into the **offline copy of `.env.production`** now (disaster recovery needs it;
see `disaster-recovery-runbook.md`). The API reads it from the same file, so recreate it:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate api
```

Leave `INBOUND_MAIL_ENABLED` at `false`/unset for now.

### 3. DNS at microhost.pl (dns1/dns2.microhost.pl)

There is **no change to the apex `ai-budget.pl`** and no apex MX. Add:

| Name | Type | Value |
|---|---|---|
| `mail-in.ai-budget.pl.` | A | `46.225.23.232` (no AAAA: Docker does not publish :25 on IPv6 here) |
| `in.ai-budget.pl.` | MX | `10 mail-in.ai-budget.pl.` |
| `in.ai-budget.pl.` | TXT | `"v=spf1 -all"` (we never send from this subdomain) |
| `_dmarc.in.ai-budget.pl.` | TXT | `"v=DMARC1; p=reject; adkim=s; aspf=s"` |

Verify from any machine once propagated:

```bash
dig +short MX in.ai-budget.pl            # 10 mail-in.ai-budget.pl.
dig +short A mail-in.ai-budget.pl        # 46.225.23.232
dig +short TXT in.ai-budget.pl           # "v=spf1 -all"
dig +short TXT _dmarc.in.ai-budget.pl
```

Optional but recommended: ask whoever controls the Hetzner IP's rDNS to set the PTR of
`46.225.23.232` to `mail-in.ai-budget.pl` (some senders score a mismatch; it is not required to
receive). Check what it is today before changing it: `dig +short -x 46.225.23.232`. The IP also
serves other sites, so only change it if nothing else depends on the current PTR.

### 4. Hetzner Cloud Firewall

Docker-published ports **bypass ufw**; only a Hetzner Cloud Firewall gates them. If one is attached
to the server (Cloud Console -> Firewalls), add an inbound rule: TCP 25 from `0.0.0.0/0`. If none is
attached, port 25 is reachable as soon as the container starts. Outbound 25 stays blocked; irrelevant
because nothing here sends.

### 5. nginx: hide the internal API from the internet

The config lives on the VPS, not in the repo. The snippet and the exact apply procedure are in
`docker/nginx/api-internal-block.conf`. Summary:

```bash
cp /opt/shared-nginx/conf.d/ai-budget.conf /opt/shared-nginx/conf.d/ai-budget.conf.bak.$(date +%F)
# add inside the api.ai-budget.pl server block:
#   location ~* ^/api/v1/internal/ { return 404; }     # case-INSENSITIVE on purpose (see below)
docker exec shared-nginx nginx -t && docker exec shared-nginx nginx -s reload   # graceful, never recreate
```

The block is a case-insensitive regex because nginx prefix locations are case-sensitive while the API's
router is not: `/api/v1/INTERNAL/...` reaches the same handlers, so a `^~ /api/v1/internal/` block is
bypassed by changing one letter. Verify **from outside the VPS** (your laptop, over the public
internet), all of these:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://api.ai-budget.pl/api/v1/internal/inbound-mail/rcpt   # 404
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://api.ai-budget.pl/api/v1/INTERNAL/inbound-mail/rcpt   # 404
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://api.ai-budget.pl/api/v1/Internal/inbound-mail/messages # 404
curl -s -o /dev/null -w '%{http_code}\n' https://api.ai-budget.pl/api/v1/health                               # 200
```

A `401`/`403` on any of the first three means the block is not active and the request reached the API
(which still refuses it, but defence in depth is gone): fix before continuing.

### 6. Certificate: a dedicated cert for `mail-in.ai-budget.pl`, in its own directory

The container must never see `/etc/letsencrypt`: that would hand the private keys of `api.`, `admin.`
and the apex to an internet-facing parser. Instead it mounts `/opt/ai-budget/inbound-mail-tls`
read-only (compose: `/opt/ai-budget/inbound-mail-tls:/tls:ro`), which holds **only** the mail-in
pair (`fullchain.pem`, `privkey.pem`), copied there by a certbot deploy hook. The cert is its own
lineage, so the shared `ai-budget.pl` certificate is not expanded or touched.

First find out how the existing certificates were issued (same method for the new one):

```bash
certbot certificates
grep -E 'authenticator|webroot_path|installer|server' /etc/letsencrypt/renewal/*.conf
```

Issue the dedicated certificate (the A record from step 3 must already resolve; example assumes
webroot through `shared-nginx`, adjust `-w` to the real webroot):

```bash
certbot certonly --cert-name mail-in.ai-budget.pl --webroot -w <real-webroot> -d mail-in.ai-budget.pl
```

Install the hook, run it once by hand, and check what the container will see:

```bash
install -m 0755 /opt/ai-budget/scripts/inbound-mail-cert-hook.sh \
  /etc/letsencrypt/renewal-hooks/deploy/inbound-mail.sh
RENEWED_LINEAGE=/etc/letsencrypt/live/mail-in.ai-budget.pl /opt/ai-budget/scripts/inbound-mail-cert-hook.sh
ls -ln /opt/ai-budget/inbound-mail-tls          # fullchain.pem 0644, privkey.pem 0640 root:1000, nothing else
```

`scripts/inbound-mail-cert-hook.sh` is idempotent, ignores every other lineage (certbot runs deploy
hooks after renewing ANY certificate), writes via temp file + rename, chowns the key to `root:1000`
(the image's `node` user), and refuses to publish a certificate/key pair that do not match. Dry-run the
renewal path: `certbot renew --cert-name mail-in.ai-budget.pl --dry-run` (deploy hooks do not run on
`--dry-run`; to exercise the hook run the manual command above after a real renewal).

Without a readable pair the container still starts but serves **without STARTTLS** (logs a warning);
`infra-check.sh` then alerts. **This hook has been syntax-checked and its lineage filter and key-match
check exercised locally, but not yet run as root on the VPS.**

### 7. Start the profile (first and only time you flip the toggle)

Prerequisite: `/opt/ai-budget/inbound-mail-tls` must exist with the mail-in pair (step 6), or the
bind mount is an empty directory and the container serves without STARTTLS.

Still with `INBOUND_MAIL_ENABLED` off, so mail is refused with `550` and nothing is processed:

```bash
cd /opt/ai-budget
printf 'INBOUND_MAIL_CONTAINER=true\n' >> .env.production
docker compose -f docker-compose.prod.yml --env-file .env.production --profile inbound-mail up -d --build inbound-mail
docker ps --filter name=budget-inbound-mail-prod --format '{{.Status}}'      # (healthy) after ~20 s
docker logs --tail 20 budget-inbound-mail-prod                               # "listening", no TLS warning
ss -ltnp 'sport = :25'                                                       # docker-proxy now owns it
```

From then on `scripts/deploy.sh` builds and (re)starts it on every deploy and
`scripts/infra-check.sh` watches the container and its certificate.

Isolation spot checks:

```bash
docker exec budget-inbound-mail-prod node -e "require('dns').lookup('postgres',(e)=>console.log(e&&e.code))"   # ENOTFOUND
docker exec budget-inbound-mail-prod node -e "require('dns').lookup('redis',(e)=>console.log(e&&e.code))"      # ENOTFOUND
docker exec budget-inbound-mail-prod node -e "fetch('http://api:3000/api/v1/health').then(r=>console.log(r.status))"  # 200
```

### 7b. Egress allow-list (DOCKER-USER), DNS and the API only

Defence in depth for a compromised parser: the container needs exactly two outbound things, DNS
(SPF/DKIM/DMARC lookups) and the API on `:3000`. Everything else it initiates is dropped. The rule
only matches traffic SOURCED from the `inbound-mail-net` subnet, so inbound mail (internet to
container, replies are `ESTABLISHED`) and every other project on the shared daemon are unaffected.
Apply it by hand as root, **after** step 7 (the network must exist) and re-check step 8 afterwards:

```bash
SUBNET=$(docker network inspect inbound-mail-net -f '{{(index .IPAM.Config 0).Subnet}}')
# resolvers the container actually uses (Docker's embedded DNS forwards to the host's):
grep '^nameserver' /etc/resolv.conf /run/systemd/resolve/resolv.conf 2>/dev/null
RESOLVERS="<ip1> <ip2>"                       # fill in from the line above, NOT 127.0.0.x

iptables -N INBOUND-MAIL-EGRESS 2>/dev/null || iptables -F INBOUND-MAIL-EGRESS
iptables -A INBOUND-MAIL-EGRESS -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
iptables -A INBOUND-MAIL-EGRESS -d "$SUBNET" -p tcp --dport 3000 -j RETURN     # the API (same bridge)
for r in $RESOLVERS; do
  iptables -A INBOUND-MAIL-EGRESS -d "$r" -p udp --dport 53 -j RETURN
  iptables -A INBOUND-MAIL-EGRESS -d "$r" -p tcp --dport 53 -j RETURN
done
iptables -A INBOUND-MAIL-EGRESS -j DROP
iptables -C DOCKER-USER -s "$SUBNET" -j INBOUND-MAIL-EGRESS 2>/dev/null \
  || iptables -I DOCKER-USER -s "$SUBNET" -j INBOUND-MAIL-EGRESS
```

Verify (the first two must still work, the last two must fail or time out):

```bash
docker exec budget-inbound-mail-prod node -e "fetch('http://api:3000/api/v1/health').then(r=>console.log(r.status))"        # 200
docker exec budget-inbound-mail-prod node -e "require('dns').resolve4('gmail.com',(e,a)=>console.log(e?e.code:a))"          # addresses
docker exec budget-inbound-mail-prod node -e "fetch('https://example.com',{signal:AbortSignal.timeout(5000)}).then(r=>console.log(r.status),e=>console.log('blocked',e.cause&&e.cause.code||e.name))"
docker exec budget-inbound-mail-prod node -e "require('net').connect(25,'gmail-smtp-in.l.google.com').on('connect',()=>console.log('OPEN')).on('error',e=>console.log('blocked',e.code)).setTimeout(5000,function(){console.log('blocked timeout');this.destroy()})"
```

`DOCKER-USER` rules survive `docker restart` but **not a reboot**: persist them
(`apt install iptables-persistent && netfilter-persistent save`, or re-run this block from a
systemd unit ordered after `docker.service`). The subnet is stable as long as `inbound-mail-net` is
not deleted; if it is recreated, re-run the block (the `-C`/`-F` guards make it idempotent). To
remove: `iptables -D DOCKER-USER -s "$SUBNET" -j INBOUND-MAIL-EGRESS && iptables -F INBOUND-MAIL-EGRESS && iptables -X INBOUND-MAIL-EGRESS`.
**Not yet applied or tested on the VPS.**

### 8. Tests with swaks (run from your laptop or any host that is NOT the VPS)

`apt install swaks` (or `brew install swaks`). `mail-in` below is `mail-in.ai-budget.pl`.

```bash
# a) Not an open relay: both must end in 550 5.7.1, the second one for the apex too
swaks --server mail-in.ai-budget.pl --tls --from probe@example.com --to someone@gmail.com
swaks --server mail-in.ai-budget.pl --tls --from probe@example.com --to abcdefghijklmnop@ai-budget.pl

# b) Unknown token on our domain: 550 5.1.1 (also what EVERY token returns while INBOUND_MAIL_ENABLED is off)
swaks --server mail-in.ai-budget.pl --tls --from probe@example.com --to aaaaaaaaaaaaaaaa@in.ai-budget.pl

# c) STARTTLS and certificate chain
openssl s_client -starttls smtp -connect mail-in.ai-budget.pl:25 -servername mail-in.ai-budget.pl </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates -ext subjectAltName
```

**External open-relay test:** run the SMTP diagnostics at <https://mxtoolbox.com/diagnostic.aspx>
(`smtp:mail-in.ai-budget.pl`) and confirm "Open Relay: OK". Do this once before announcing the
feature, and again after any change to `server.ts`/`policy.ts`.

**Real client IP check** (important, see Risks): after test (a), `docker logs --tail 5
budget-inbound-mail-prod` must show your public IP as `remoteIp`, not `172.x.x.x`. If every
connection shows the bridge gateway, per-IP limits and the penalty box collapse into one bucket and
one scanner blocks every sender: disable the userland proxy or publish via host networking before
going further.

### 9. Turn the feature on

Only after step 8 passes. This is the point where mail starts being accepted and processed.

```bash
cd /opt/ai-budget
sed -i 's/^INBOUND_MAIL_ENABLED=.*/INBOUND_MAIL_ENABLED=true/' .env.production   # or append it if absent
grep '^INBOUND_MAIL_ENABLED=' .env.production
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate api   # .env is NOT reloaded by `restart`
```

Then, from a real account: open Settings -> E-mail receipts, copy the address, and

```bash
swaks --server mail-in.ai-budget.pl --tls --from probe@example.com --to <token>@in.ai-budget.pl \
      --attach @receipt.pdf --header 'Subject: test receipt'
```

Expect `250`, a push, and a pending item in the app. Note the swaks sender will usually fail the
SPF/DKIM requirement (`550 5.7.1`) because it is unauthenticated; that is the policy working. For a
true end-to-end test use a real Gmail forwarding rule (Gmail's verification code shows up in the app)
and one manual forward from a phone. Also do one Outlook rule before announcing.

## 3. Certificate renewal

Certbot renews the `mail-in.ai-budget.pl` lineage in `/etc/letsencrypt`; its deploy hook
(`/etc/letsencrypt/renewal-hooks/deploy/inbound-mail.sh`, from `scripts/inbound-mail-cert-hook.sh`)
then copies the new pair into `/opt/ai-budget/inbound-mail-tls`. The container compares the mounted
certificate file's mtime every 6 hours and calls `updateSecureContext()`, so no restart is needed. Check:

```bash
docker logs budget-inbound-mail-prod | grep "TLS certificate reloaded"          # appears within 6 h of a renewal
echo QUIT | openssl s_client -starttls smtp -connect 127.0.0.1:25 -servername mail-in.ai-budget.pl 2>/dev/null \
  | openssl x509 -noout -enddate
```

`infra-check.sh` (every 30 min through `infra-watch.yml`) alerts if STARTTLS is missing or the
certificate expires within 14 days. Two limits: a container that started **without** a certificate
does not pick one up later (restart it: `docker restart budget-inbound-mail-prod`), and certbot's
the hook for the shared `ai-budget.pl` certificate must still reload `shared-nginx` as before; nothing
here changes it (our hook ignores every lineage but its own). If renewal succeeded but the mounted copy is
stale, run the hook by hand (step 6) and check `ls -l /opt/ai-budget/inbound-mail-tls`.

## 4. "My e-mail did not arrive"

1. Is the feature on? `grep INBOUND_MAIL .env.production`. Off means every RCPT is `550`.
2. Container up and healthy? `docker ps --filter name=budget-inbound-mail-prod`.
3. Logs (JSON, one line per event; tokens appear only as an 8-char hash):
   ```bash
   docker logs --since 2h budget-inbound-mail-prod | grep -E '"msg":"(rcpt|handoff|data refused|rcpt refused)'
   docker logs --since 2h budget-inbound-mail-prod | grep '"level":"error"'
   ```
4. The row in Postgres (run on the VPS):
   ```bash
   docker exec budget-db-prod psql -U postgres -d ai_budget -c \
     "SELECT status, kind, error_code, created_at FROM inbound_receipts WHERE user_id='<user id>' ORDER BY created_at DESC LIMIT 10;"
   ```
5. Reply codes and what they mean:

| Code | Meaning | Action |
|---|---|---|
| `250` | API persisted it (also for a duplicate Message-ID and for "no usable content") | Look at the row's `status`; `not_a_receipt`/`unsupported` are normal outcomes |
| `550 5.1.1` | Unknown token, disabled, tier-2 account, or user no longer an editor | Wrong address, or the flag is off |
| `550 5.7.1 Relaying denied` | Recipient is not on `in.ai-budget.pl` | Sender mistyped the domain |
| `550 5.7.1 ... authentication` | DMARC fail without trusted ARC, or neither SPF nor DKIM passed | Spoofed or badly forwarded mail; expected |
| `552 5.3.4` | Over 15 MB | Sender must send a smaller file |
| `452 4.2.2` | Per-token cap (20/h, 60/day) | Sender retries later |
| `451 4.3.0` | API down, Redis down, timeout, or **bad shared secret (401/403)** | Check `"level":"error"` lines: "check INBOUND_MAIL_SHARED_SECRET / API" means the secret in `.env.production` differs between api and the container; fix and recreate both |
| `421 4.7.0` | Per-IP connection limit or penalty box | Wait, or section 5 |

Gmail shows "delivery delayed" for 4xx and bounces only after days, so a `451` during a deploy is
harmless: the sender retries, and duplicates are absorbed by the Message-ID hash.

## 5. Abuse response

- **Rotate or disable a user's address:** in the app (Settings -> E-mail receipts), or set
  `disabled_at`/rotate the row in `inbound_mail_addresses` (backend-owned table; ask backend).
- **Block an IP now.** Two layers. The container has an in-memory penalty box (10 bad recipients in
  10 min -> 1 h; resets on restart). The API has a durable one in Redis. To ban an IP by hand:
  ```bash
  docker exec budget-redis-prod redis-cli SET inmail:penalty:<ip> 1 EX 86400
  ```
  An IP in the API penalty box gets `550` on every recipient. To inspect:
  `docker exec budget-redis-prod redis-cli --scan --pattern 'inmail:*'`.
  For a hard block use the Hetzner Cloud Firewall (inbound TCP 25 can only allow, so prefer the
  `iptables -I DOCKER-USER -s <ip> -p tcp --dport 2525 -j DROP` rule on the host; it does not survive
  a reboot unless persisted).
- **Lower the caps:** the per-token caps (20/h, 60/day) and the penalty-box thresholds are **code
  constants** in `apps/api/src/modules/inbound-mail/inbound-mail.config.ts`, not env vars. Changing them
  is a backend change and a deploy.
- **Stop everything:** section 6.

## 6. Disable switch

Fastest to slowest, all lossless on our side (senders retry or bounce):

1. **Feature flag:** `INBOUND_MAIL_ENABLED=false` in `.env.production`, then
   `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate api`.
   Every RCPT now answers `550 5.1.1`; the app hides the surface.
2. **Stop the container:** `docker stop budget-inbound-mail-prod`. Port 25 is closed; senders see
   connection refused and retry. Note `deploy.sh` restarts it on the next deploy while
   `INBOUND_MAIL_CONTAINER=true`, so also set that to `false` if the stop is meant to last.
3. **Close the port at the edge:** remove the Hetzner Firewall rule for TCP 25.

## 7. Disk and memory

- The container itself stores nothing. Logs are rotated (10 MB x 3).
- Documents are `Bytes` rows in `inbound_receipts`, nulled on confirm/dismiss and by the 30-day
  (7-day for tier 1) expiry cron. They ride along in the nightly `pg_dump`. Watch the size:
  ```bash
  docker exec budget-db-prod psql -U postgres -d ai_budget -c \
    "SELECT status, count(*), pg_size_pretty(coalesce(sum(octet_length(document)),0)) FROM inbound_receipts GROUP BY status ORDER BY 2 DESC;"
  ```
- Memory: limit **384M**, main-thread V8 heap capped at **256M** (`NODE_OPTIONS=--max-old-space-size=256`;
  heap + ~128M non-heap fits under the limit). Worst case is bounded in code rather than hoped for: raw DATA
  bytes held across ALL sessions are capped at 64 MB (`MAX_INFLIGHT_BYTES`, beyond it `452 4.3.1`), at most
  2 messages are authenticated/parsed at once (`new Semaphore(2)` in `main.ts`), parsing happens in worker
  threads with a 64 MB heap cap each, and at most 20 connections (2 per IP) are open. Check with
  `docker stats --no-stream budget-inbound-mail-prod`. `OOMKilled` in `docker inspect` is the signal to
  lower those numbers or raise the limit and heap together.
- Hardening flags to know when debugging: read-only rootfs (only a 16 MB tmpfs on `/tmp` is writable, so
  `docker exec ... touch /x` failing is expected), `cap_drop: ALL`, `no-new-privileges`, 128 pids. A
  `pthread_create`/`EAGAIN` error in the logs means the pids limit is too low for the worker threads.

## 8. Rollback

1. Section 6, step 1 (flag off) and `INBOUND_MAIL_CONTAINER=false`.
2. `docker compose -f docker-compose.prod.yml --env-file .env.production --profile inbound-mail rm -sf inbound-mail`
   (removes the container only; no volume is involved. Never `down -v`.)
3. Remove the Hetzner Firewall rule for TCP 25.
4. The DNS records may stay: senders then get connection refused and bounce after their retry window
   (typically 2-5 days). Remove the MX to make that immediate.
5. `inbound-mail-net` and the `api` attachment are harmless and can stay.

## 9. Disaster recovery notes

- `INBOUND_MAIL_SHARED_SECRET` and the `INBOUND_MAIL_*` toggles live in `.env.production`: they must be
  in the offline copy (`disaster-recovery-runbook.md`).
- After a full server rebuild the order is: restore the stack, re-issue the certificate with the
  dedicated `mail-in.ai-budget.pl` certificate and install the deploy hook (step 6), re-apply the nginx block
  (case-insensitive form, step 5), re-create the Hetzner Firewall rule, then step 7 and the egress rules (7b).
  DNS stays as long as the server keeps `46.225.23.232`; a new IP means changing the `mail-in` A record
  (the MX can stay).
- Queued mail at the senders survives a short outage (retry for days). The container has no queue of its
  own: that is deliberate, "250 only after the API persisted".

## 10. Known limits and risks

- **Untested on the internet** until section 2 step 8 has been done and signed off.
- **Source IP visibility** behind Docker's port publishing (see the check in step 8).
- **The container's penalty box is in memory** and resets on restart; the API's Redis one is the durable layer.
- **Opportunistic TLS only.** A sender that insists on verified TLS (MTA-STS) is not supported: no
  `_mta-sts` policy is published for `in.ai-budget.pl`.
- **One document per message.** An e-receipt that is only a link is recorded as `not_a_receipt`.
- **`smtp-server`, `mailparser`, `mailauth` and `html-to-text` are internet-facing dependencies.** Versions are
  pinned exactly in `apps/inbound-mail/package.json` and the image installs with `npm ci` from the standalone
  `apps/inbound-mail/package-lock.json`. `.github/workflows/inbound-mail-audit.yml` runs
  `npm audit --omit=dev --audit-level=high` against that lock on every change to it and every Monday (a
  scheduled failure alerts the ops bot). Run `npm audit --workspace=@budget/inbound-mail` at the repo root only
  for a rough local look: it audits the ROOT lock, which includes every other app, and reports unrelated
  advisories.
- **Dependency updates:** change the version in `apps/inbound-mail/package.json`, then regenerate BOTH locks:
  `npm install --package-lock-only --workspace=@budget/inbound-mail` at the repo root, and for the standalone
  lock copy `package.json` to an empty directory and run `npm install --package-lock-only --ignore-scripts`
  there, copying the resulting `package-lock.json` back to `apps/inbound-mail/`. Bump the Node base image by
  changing tag AND digest together in `docker/Dockerfile.inbound-mail` (`ARG NODE_IMAGE`).
- **An in-process authentication check cannot be aborted.** The 25 s deadline frees the SMTP slot and answers
  `451`, but a pathological message can leave its `mailauth` DKIM/SPF work running on the main thread until it
  finishes; only the mailparser/html-to-text half runs in a terminable worker. The 2-message gate, the
  byte budget and the 60 s DATA cap bound the damage. Moving `mailauth` into the worker too is the next step
  if this ever shows up in practice.
- **No test-restore applies**: nothing here is state.
