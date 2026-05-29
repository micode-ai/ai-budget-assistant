# Phase 2 — Infra Fault Tolerance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add Docker log rotation, off-host disk + container-health monitoring with Telegram alerts, and a tested "rebuild from scratch" disaster-recovery runbook.

**Architecture:** Pure ops. Log rotation via `logging` blocks in `docker-compose.prod.yml`. Monitoring via a new GitHub Actions cron that pipes `scripts/infra-check.sh` over SSH to the VPS and alerts Telegram on non-zero exit. DR documented in `docs/ops/disaster-recovery-runbook.md`, tying in the Phase 1 restore.

**Tech Stack:** Docker Compose, Bash, GitHub Actions, SSH, Telegram Bot API.

**Owner:** `aba-devops-engineer`. **Spec:** `docs/superpowers/specs/2026-05-29-infra-fault-tolerance-phase2-design.md`.

**Host tooling note:** `shellcheck`/`actionlint` are not on the host but **docker is** — run them via `koalaman/shellcheck:stable` and `rhysd/actionlint:latest`. The VPS-side script (`infra-check.sh`) can be functionally tested inside a Linux container with the docker socket mounted.

---

## Task 1: Docker log rotation in `docker-compose.prod.yml`

**Files:** Modify `docker-compose.prod.yml`

- [ ] **Step 1:** Add the SAME `logging` block to each of the four long-running services — `postgres`, `redis`, `api`, `admin` — at the same indentation level as their existing `restart:`/`deploy:` keys:

```yaml
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

Do not add it to `migrator` (one-shot). Do not change any other key.

- [ ] **Step 2:** Validate compose syntax:
```bash
docker compose -f docker-compose.prod.yml config -q && echo "COMPOSE OK"
```
Expected: `COMPOSE OK` (no errors). If `docker compose` needs env vars, use `docker compose -f docker-compose.prod.yml --env-file .env.example config -q` or set dummy `POSTGRES_PASSWORD=x`.

- [ ] **Step 3:** Confirm exactly 4 logging blocks were added:
```bash
grep -c "max-size" docker-compose.prod.yml
```
Expected: `4`.

- [ ] **Step 4:** Commit:
```bash
git add docker-compose.prod.yml
git commit -m "feat(ops): add Docker log rotation (10m x3) to prod services"
```

---

## Task 2: `scripts/infra-check.sh` — disk + container probe

**Files:** Create `scripts/infra-check.sh`

- [ ] **Step 1:** Write the script verbatim:

```bash
#!/usr/bin/env bash
# Production VPS health probe: root-disk usage + container state.
# Designed to be piped over SSH:  ssh user@host 'bash -s' < scripts/infra-check.sh
# Prints a human summary; exits non-zero listing every problem found (so CI can alert).
#
# Optional env (prefix the remote command, e.g. ssh host "DISK_THRESHOLD=90 bash -s" < ...):
#   DISK_THRESHOLD (default 85)  - percent used on / that triggers an alert
#   CONTAINERS     (default the 4 prod containers)
set -uo pipefail

DISK_THRESHOLD="${DISK_THRESHOLD:-85}"
CONTAINERS="${CONTAINERS:-budget-db-prod budget-redis-prod budget-api-prod budget-admin-prod}"

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

if (( ${#problems[@]} > 0 )); then
  echo "INFRA CHECK FAILED:"
  for p in "${problems[@]}"; do echo "  - $p"; done
  exit 1
fi
echo "INFRA CHECK OK"
```

- [ ] **Step 2:** shellcheck via docker:
```bash
docker run --rm -v "$PWD:/mnt" -w /mnt koalaman/shellcheck:stable scripts/infra-check.sh
```
Expected: no errors.

- [ ] **Step 3:** Functional test inside a Linux container with the docker socket mounted (proves running/missing detection + disk read). Run:
```bash
docker run -d --name infra-test-ok alpine sleep 300
docker run --rm -v "$PWD:/w" -v //var/run/docker.sock:/var/run/docker.sock -w /w \
  docker:cli sh -c "apk add --no-cache bash coreutils >/dev/null && CONTAINERS='infra-test-ok ghost-xyz' bash scripts/infra-check.sh"; echo "exit=$?"
docker rm -f infra-test-ok
```
Expected: prints `running=true health=none` for `infra-test-ok`, `MISSING` for `ghost-xyz`, an `INFRA CHECK FAILED` block listing `container ghost-xyz does not exist`, and `exit=1`. (On Windows the socket path is `//var/run/docker.sock`; if the mount fails, fall back to verifying disk+threshold logic with `CONTAINERS=''` and report the container path as DONE_WITH_CONCERNS to be validated by the live workflow_dispatch in Task 5.)

- [ ] **Step 4:** Verify the OK path (threshold high, no containers):
```bash
docker run --rm -v "$PWD:/w" -w /w alpine sh -c "apk add --no-cache bash coreutils >/dev/null && DISK_THRESHOLD=99 CONTAINERS='' bash scripts/infra-check.sh"; echo "exit=$?"
```
Expected: prints disk line + `INFRA CHECK OK`, `exit=0`.

- [ ] **Step 5:** Commit:
```bash
git add scripts/infra-check.sh
git commit -m "feat(ops): add infra-check.sh (disk + container health probe)"
```

---

## Task 3: `.github/workflows/infra-watch.yml`

**Files:** Create `.github/workflows/infra-watch.yml`

- [ ] **Step 1:** Write the workflow verbatim:

```yaml
name: Infra Watch

on:
  schedule:
    - cron: '*/30 * * * *'
  workflow_dispatch:

concurrency:
  group: infra-watch
  cancel-in-progress: true

jobs:
  watch:
    name: Disk + container health
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Checkout (for script)
        uses: actions/checkout@v4

      - name: Configure SSH key
        run: |
          mkdir -p ~/.ssh && chmod 700 ~/.ssh
          printf '%s\n' "${{ secrets.SSH_PRIVATE_KEY }}" > ~/.ssh/id_infra
          chmod 600 ~/.ssh/id_infra

      - name: Run infra check over SSH
        id: check
        env:
          SSH_HOST: ${{ secrets.SSH_HOST }}
          SSH_USER: ${{ secrets.SSH_USER }}
        run: |
          set +e
          OUT=$(ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes -i ~/.ssh/id_infra \
            "$SSH_USER@$SSH_HOST" 'bash -s' < scripts/infra-check.sh 2>&1)
          CODE=$?
          echo "$OUT"
          {
            echo "code=$CODE"
            echo "summary<<EOF"
            echo "$OUT"
            echo "EOF"
          } >> "$GITHUB_OUTPUT"
          exit 0

      - name: Notify Telegram on problem
        if: steps.check.outputs.code != '0'
        env:
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
          SUMMARY: ${{ steps.check.outputs.summary }}
          RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
        run: |
          if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$TELEGRAM_CHAT_ID" ]; then
            echo "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID secret missing — cannot alert" >&2
            exit 1
          fi
          MESSAGE=$(printf '\xE2\x9A\xA0\xEF\xB8\x8F *PROD INFRA WARNING* \xE2\x9A\xA0\xEF\xB8\x8F\n\n```\n%s\n```\n\n[GitHub run](%s)' "$SUMMARY" "$RUN_URL")
          curl -sS -X POST \
            "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            -d "chat_id=${TELEGRAM_CHAT_ID}" \
            -d "parse_mode=Markdown" \
            -d "disable_web_page_preview=true" \
            --data-urlencode "text=${MESSAGE}"
```

- [ ] **Step 2:** Lint via docker actionlint:
```bash
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest -color .github/workflows/infra-watch.yml
```
Expected: no errors. (YAML fallback: `python -c "import yaml;yaml.safe_load(open('.github/workflows/infra-watch.yml'));print('YAML OK')"`.)

- [ ] **Step 3:** Confirm only existing secrets are referenced:
```bash
grep -oE "secrets\.[A-Z_]+" .github/workflows/infra-watch.yml | sort -u
```
Expected exactly: `secrets.SSH_HOST`, `secrets.SSH_PRIVATE_KEY`, `secrets.SSH_USER`, `secrets.TELEGRAM_BOT_TOKEN`, `secrets.TELEGRAM_CHAT_ID`. (No new secrets.)

- [ ] **Step 4:** Commit:
```bash
git add .github/workflows/infra-watch.yml
git commit -m "feat(ops): add infra-watch workflow (disk + container alerts)"
```

---

## Task 4: `docs/ops/disaster-recovery-runbook.md`

**Files:** Create `docs/ops/disaster-recovery-runbook.md`

- [ ] **Step 1:** Write the runbook verbatim:

````markdown
# Disaster Recovery Runbook — Full Server Rebuild

Use when the production VPS is lost entirely (hardware failure, account loss, destroyed
disk). For a DB-only restore onto a working server, use `restore-runbook.md` instead.

## Prerequisites you MUST have offline (not on the lost VPS)
- The **`age` private key** (`backup-key.txt`) — decrypts the DB backups (Phase 1).
- An **offline copy of `.env.production`** — the prod secrets (DB password, JWT, OpenAI,
  Stripe, Telegram, WhatsApp, CORS_ORIGIN, …). This file lives ONLY on the VPS in normal
  operation; keep a copy in the password manager. Without it the stack cannot be rebuilt.
- Access to the GitHub repos (`ai-budget-assistant`, `ai-budget-backups`) and DNS.

## 1. Provision a new VPS
- Ubuntu LTS. Install Docker **via apt** (`apt-get install docker-ce docker-compose-plugin`).
  Do NOT use snap Docker (held/disabled after the 2026-04-27 socket-hijack incident).
- Recreate the SSH access used by CI (`SSH_HOST` may change → update the GitHub Secret).

## 2. Restore the app directory
```bash
sudo mkdir -p /opt/ai-budget && cd /opt/ai-budget
git clone https://github.com/micode-ai/ai-budget-assistant.git .
git checkout development
# Recreate .env.production from the offline copy:
nano .env.production    # paste the saved secrets
```
Bring up (or repoint) the shared `accounting-nginx` stack and point DNS
`api.ai-budget.pl` / `admin.ai-budget.pl` at the new server.

## 3. Start datastores and restore the database
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d postgres redis
# wait for postgres healthy, then restore the latest backup — see restore-runbook.md:
#   download the newest Release asset from ai-budget-backups
#   age -d -i backup-key.txt ai_budget-YYYY-MM-DD.dump.age > ai_budget.dump
#   docker cp ai_budget.dump budget-db-prod:/tmp/ai_budget.dump
#   docker exec budget-db-prod pg_restore -U postgres -d ai_budget --clean --if-exists /tmp/ai_budget.dump
```

## 4. Run migrations and start the app
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production --profile migrate run --rm migrator
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate api admin
```

## 5. Verify
```bash
curl -sf https://api.ai-budget.pl/api/v1/health && echo OK
```
Smoke-test: log in, open one screen, confirm data is present.

## Notes
- **Redis needs no restore** — it is cache only (rate-limit counters, chat presence,
  UserContext cache, `allkeys-lru`). It repopulates automatically. Redis persistence is
  intentionally **not** enabled: it would contradict the cache role and add disk I/O for
  disposable data.
- After recovery, re-check the GitHub Secrets that may have changed (`SSH_HOST`), and
  confirm the nightly `backup-db.yml` and `infra-watch.yml` runs succeed against the new host.

## Rebuild rehearsal log
| Date | Scenario | Result | By |
|------|----------|--------|----|
| _not yet rehearsed_ | | | |
````

- [ ] **Step 2:** Verify references are real:
```bash
grep -n "restore-runbook.md\|budget-db-prod\|--profile migrate\|/opt/ai-budget\|allkeys-lru" docs/ops/disaster-recovery-runbook.md
```
Expected: all present.

- [ ] **Step 3:** Commit:
```bash
git add docs/ops/disaster-recovery-runbook.md
git commit -m "docs(ops): add full-server-rebuild disaster-recovery runbook"
```

---

## Task 5: Docs — CLAUDE.md + SETUP.md (en/ru)

**Files:** Modify `CLAUDE.md`, `docs/en/SETUP.md`, `docs/ru/SETUP.md`

- [ ] **Step 1:** In `CLAUDE.md` Observability section, add a bullet:
> **Infra watch (ABA-XXX)**: `infra-watch.yml` — cron every 30 min, SSHes to the VPS and runs `scripts/infra-check.sh` (root-disk usage > 85% or any prod container not running / `unhealthy`) → Telegram alert. Complements `uptime-check.yml` (5-min `/health`). Docker logs are rotated (`json-file` `max-size: 10m`, `max-file: 3`) in `docker-compose.prod.yml`. Full-server-loss recovery: `docs/ops/disaster-recovery-runbook.md` (needs the offline `age` key + an offline copy of `.env.production`).

(Replace `ABA-XXX` with the issue number assigned at finish time.)

- [ ] **Step 2:** In `docs/en/SETUP.md` and `docs/ru/SETUP.md`, extend the monitoring/ops area (near the Database Backups / Observability section added in the doc catch-up) with a short subsection covering: log rotation (10m×3), the `infra-watch.yml` disk+container monitor (every 30 min, Telegram alert, reuses SSH+Telegram secrets), and a pointer to `docs/ops/disaster-recovery-runbook.md` for full-server rebuild (English in en, Russian in ru; keep parity).

- [ ] **Step 3:** Commit:
```bash
git add CLAUDE.md docs/en/SETUP.md docs/ru/SETUP.md
git commit -m "docs: document infra watch, log rotation, and DR runbook"
```

---

## Task 6: Finish + live activation

- [ ] **Step 1:** `finish-aba-task` — create `ABA-{N}` (run `gh issue list --limit 1` first), backfill the `ABA-XXX` reference in CLAUDE.md.
- [ ] **Step 2:** Push `development` (this triggers `deploy.yml` because `docker-compose.prod.yml` is in its path filter — the deploy recreates containers with log rotation; expected, brief).
- [ ] **Step 3:** Live-test the monitor: `gh workflow run "Infra Watch" --ref development`, watch the run, confirm it reports `INFRA CHECK OK` (or alerts correctly). Optionally lower the threshold once (`workflow_dispatch` with a temporary low `DISK_THRESHOLD`) to confirm the Telegram alert path.

---

## Notes for the implementer
- No app code, no migration.
- `infra-check.sh` uses `set -uo pipefail` (NOT `-e`) on purpose — it must run all checks and collect every problem, not abort on the first.
- `df --output=pcent` is GNU coreutils (present on the Ubuntu VPS and in the `coreutils` apk used for tests).
- The monitor reuses only existing secrets — do not introduce new ones.
