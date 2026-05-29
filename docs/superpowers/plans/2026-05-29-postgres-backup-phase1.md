# Phase 1 — Automated Encrypted PostgreSQL Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a nightly GitHub Actions job that dumps the production PostgreSQL database over SSH, sanity-checks and `age`-encrypts the dump, publishes it as a Release asset in a private backup repo with GFS retention, and alerts Telegram on failure — plus a tested restore runbook.

**Architecture:** Off-host GitHub Actions cron runner SSHes into the Hetzner VPS, runs `pg_dump -Fc` inside the `budget-db-prod` container and streams the dump back. The runner verifies the archive, encrypts it with an `age` recipient public key (private key stays offline), and `gh release create`s it in a dedicated private repo. A separate prune script enforces 7 daily + 4 weekly + 6 monthly retention. All logic lives in two `scripts/*.sh` files so it is shellcheckable and testable offline; the workflow YAML only wires secrets and tools.

**Tech Stack:** Bash, GitHub Actions, `pg_dump`/`pg_restore` (postgresql-client 16), `age` encryption, `gh` CLI, Telegram Bot API.

**Owner of this work:** `aba-devops-engineer`.

**Source spec:** `docs/superpowers/specs/2026-05-29-postgres-backup-phase1-design.md`

---

## File structure

| File | Responsibility |
|---|---|
| `scripts/backup-db.sh` | Runs on the runner: dump-over-SSH → size guard → `pg_restore --list` sanity → `age` encrypt. Prints `ENCRYPTED_FILE=`, `DUMP_BYTES=`, `OBJECT_COUNT=`. Mockable via `LOCAL_DUMP`. |
| `scripts/prune-backups.sh` | GFS retention over backup releases. Mockable via `RELEASES_FILE` + `DRY_RUN`. |
| `.github/workflows/backup-db.yml` | Cron + `workflow_dispatch`; installs tools, configures SSH, runs the two scripts, publishes the release, alerts Telegram on failure. |
| `docs/ops/restore-runbook.md` | Disaster-recovery procedure: decrypt → scratch-restore → verify → production restore. |
| `.env.example` | Documents the names of the three new secrets. |

No application source code and no Prisma migration are touched.

---

## Pre-flight (owner manual steps — required before the LIVE run in Task 6, NOT before writing code)

These provision secrets the live workflow needs. The offline tests in Tasks 2–3 do **not** need them.

1. Create a **private** GitHub repo, e.g. `ai-budget-backups`.
2. Generate an `age` keypair locally:
   ```bash
   age-keygen -o backup-key.txt    # prints "Public key: age1..." to stderr
   ```
   - Put the `age1...` **public** key into repo secret `AGE_PUBLIC_KEY`.
   - Store `backup-key.txt` (the **private** key) OFFLINE (password manager) **plus a second independent copy**. Never commit it, never add it to CI.
3. Create a fine-grained PAT with **`contents: write`** on the backup repo only → repo secret `BACKUP_REPO_TOKEN`.
4. Add repo secret `BACKUP_REPO` = `owner/ai-budget-backups`.
5. Confirm existing secrets are present: `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

---

## Task 1: Document new secrets in `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Read the current secrets section**

Run: `grep -n "TELEGRAM_CHAT_ID\|SSH_\|# Backup" .env.example`
Expected: shows where ops/CI-related vars are documented (or confirms they are not yet there).

- [ ] **Step 2: Append the backup secret documentation**

Add this block to `.env.example` (these are GitHub Actions secrets, documented here for discoverability — values are never committed):

```bash
# --- Database backup (Phase 1, GitHub Actions: .github/workflows/backup-db.yml) ---
# These are configured as GitHub repository secrets, not in this .env. Listed here for reference.
# AGE_PUBLIC_KEY      - age recipient public key (age1...); the runner encrypts dumps with it.
#                       The matching PRIVATE key is kept OFFLINE by the owner (+ a second copy)
#                       and is the only thing that can decrypt backups.
# BACKUP_REPO         - owner/repo of the private repo that stores backup Releases (e.g. owner/ai-budget-backups)
# BACKUP_REPO_TOKEN   - fine-grained PAT with `contents: write` on BACKUP_REPO
# Reused existing secrets: SSH_HOST, SSH_USER, SSH_PRIVATE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
```

- [ ] **Step 3: Verify**

Run: `grep -c "AGE_PUBLIC_KEY\|BACKUP_REPO\|BACKUP_REPO_TOKEN" .env.example`
Expected: `3` (or more if mentioned twice in the comment).

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "docs: document database backup secrets in .env.example"
```

---

## Task 2: `scripts/backup-db.sh` — dump, sanity-check, encrypt

**Files:**
- Create: `scripts/backup-db.sh`

- [ ] **Step 1: Write the script**

Create `scripts/backup-db.sh` with exactly this content:

```bash
#!/usr/bin/env bash
# Dump the production PostgreSQL DB over SSH, sanity-check it, and encrypt with age.
# Runs ON the GitHub Actions runner (not the VPS).
#
# Required env:
#   SSH_HOST, SSH_USER   - VPS connection (unless LOCAL_DUMP is set)
#   AGE_PUBLIC_KEY       - age recipient public key (age1...)
# Optional env:
#   SSH_KEY_FILE         - path to the private SSH key (else ssh default identities)
#   PG_CONTAINER (budget-db-prod), PG_USER (postgres), PG_DB (ai_budget)
#   OUT_DIR (.), MIN_DUMP_BYTES (10240), MIN_OBJECTS (10)
#   LOCAL_DUMP           - path to an existing plaintext custom-format dump; skips SSH (for testing)
#
# Output (stdout, machine-readable KEY=VALUE lines; human logs go to stderr):
#   ENCRYPTED_FILE=<path>
#   DUMP_BYTES=<n>
#   OBJECT_COUNT=<n>
set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:-budget-db-prod}"
PG_USER="${PG_USER:-postgres}"
PG_DB="${PG_DB:-ai_budget}"
OUT_DIR="${OUT_DIR:-.}"
MIN_DUMP_BYTES="${MIN_DUMP_BYTES:-10240}"
MIN_OBJECTS="${MIN_OBJECTS:-10}"

STAMP="$(date -u +%Y-%m-%d)"
DUMP_FILE="${OUT_DIR}/${PG_DB}-${STAMP}.dump"
ENC_FILE="${DUMP_FILE}.age"

if [[ -n "${LOCAL_DUMP:-}" ]]; then
  echo "Using LOCAL_DUMP=${LOCAL_DUMP} (skipping SSH dump)" >&2
  cp "${LOCAL_DUMP}" "${DUMP_FILE}"
else
  : "${SSH_HOST:?SSH_HOST required}"
  : "${SSH_USER:?SSH_USER required}"
  echo "Dumping ${PG_DB} from container ${PG_CONTAINER} on ${SSH_HOST}..." >&2
  SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o BatchMode=yes)
  [[ -n "${SSH_KEY_FILE:-}" ]] && SSH_OPTS+=(-i "${SSH_KEY_FILE}")
  ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SSH_HOST}" \
    "docker exec -i ${PG_CONTAINER} pg_dump -U ${PG_USER} -d ${PG_DB} -Fc" \
    > "${DUMP_FILE}"
fi

DUMP_BYTES="$(wc -c < "${DUMP_FILE}" | tr -d '[:space:]')"
echo "Dump size: ${DUMP_BYTES} bytes" >&2
if (( DUMP_BYTES < MIN_DUMP_BYTES )); then
  echo "ERROR: dump is only ${DUMP_BYTES} bytes (< ${MIN_DUMP_BYTES}); aborting." >&2
  exit 1
fi

# Sanity: a valid custom-format archive lists its objects; entries start with a numeric dumpId.
OBJECT_COUNT="$(pg_restore --list "${DUMP_FILE}" | grep -c '^[0-9]' || true)"
echo "Archive object count: ${OBJECT_COUNT}" >&2
if (( OBJECT_COUNT < MIN_OBJECTS )); then
  echo "ERROR: archive lists only ${OBJECT_COUNT} objects (< ${MIN_OBJECTS}); suspect a bad dump." >&2
  exit 1
fi

: "${AGE_PUBLIC_KEY:?AGE_PUBLIC_KEY required}"
echo "Encrypting with age..." >&2
age -r "${AGE_PUBLIC_KEY}" -o "${ENC_FILE}" "${DUMP_FILE}"
rm -f "${DUMP_FILE}"
echo "Wrote ${ENC_FILE}" >&2

echo "ENCRYPTED_FILE=${ENC_FILE}"
echo "DUMP_BYTES=${DUMP_BYTES}"
echo "OBJECT_COUNT=${OBJECT_COUNT}"
```

- [ ] **Step 2: Make it executable and shellcheck it**

Run:
```bash
chmod +x scripts/backup-db.sh
shellcheck scripts/backup-db.sh
```
Expected: no errors. (If `shellcheck` is not installed: `sudo apt-get install -y shellcheck`.)

- [ ] **Step 3: Build an offline round-trip test (no VPS, no real secrets)**

This proves the size-guard, sanity-check, and encryption work, and that the result decrypts back to a byte-identical dump. Run:
```bash
set -e
# Need a real custom-format archive to exercise pg_restore --list. Make a throwaway DB locally.
TESTDIR=$(mktemp -d)
docker run -d --name pg-bkp-test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=ai_budget postgres:16-alpine
sleep 5
docker exec pg-bkp-test psql -U postgres -d ai_budget -c "create table t(id serial primary key, v text); insert into t(v) select 'x' from generate_series(1,50);"
docker exec -i pg-bkp-test pg_dump -U postgres -d ai_budget -Fc > "$TESTDIR/sample.dump"

# Generate a throwaway age key.
age-keygen -o "$TESTDIR/test-key.txt" 2> "$TESTDIR/pub.txt"
PUB=$(grep -oE 'age1[0-9a-z]+' "$TESTDIR/pub.txt")

# Run the script in LOCAL_DUMP mode.
OUT_DIR="$TESTDIR" LOCAL_DUMP="$TESTDIR/sample.dump" AGE_PUBLIC_KEY="$PUB" \
  bash scripts/backup-db.sh | tee "$TESTDIR/out.txt"

# Decrypt and confirm it is a valid archive again.
ENC=$(grep '^ENCRYPTED_FILE=' "$TESTDIR/out.txt" | cut -d= -f2)
age -d -i "$TESTDIR/test-key.txt" "$ENC" > "$TESTDIR/roundtrip.dump"
pg_restore --list "$TESTDIR/roundtrip.dump" | grep -c '^[0-9]'

# Cleanup
docker rm -f pg-bkp-test
echo "ROUND-TRIP OK"
```
Expected: the script prints `ENCRYPTED_FILE=`, `DUMP_BYTES=`, `OBJECT_COUNT=` (object count > 10); the decrypt step succeeds; final line `ROUND-TRIP OK`.

- [ ] **Step 4: Verify the size guard fails fast**

Run:
```bash
TESTDIR=$(mktemp -d); echo "tiny" > "$TESTDIR/tiny.dump"
OUT_DIR="$TESTDIR" LOCAL_DUMP="$TESTDIR/tiny.dump" AGE_PUBLIC_KEY="age1dummy" \
  bash scripts/backup-db.sh; echo "exit=$?"
```
Expected: prints `ERROR: dump is only 5 bytes ...` and `exit=1` (non-zero before reaching encryption).

- [ ] **Step 5: Commit**

```bash
git add scripts/backup-db.sh
git commit -m "feat(ops): add backup-db.sh (dump over SSH, sanity-check, age-encrypt)"
```

---

## Task 3: `scripts/prune-backups.sh` — GFS retention

**Files:**
- Create: `scripts/prune-backups.sh`

- [ ] **Step 1: Write the script**

Create `scripts/prune-backups.sh` with exactly this content:

```bash
#!/usr/bin/env bash
# GFS retention for backup releases: keep the most recent N daily, plus the most recent
# weekly anchors (Sunday-dated) and monthly anchors (1st-of-month). Delete everything else.
# Backup release tags are expected as: backup-YYYY-MM-DD
#
# Required env (live mode):
#   BACKUP_REPO   - owner/repo of the private backup repo
#   GH_TOKEN      - PAT with contents:write on BACKUP_REPO (gh reads GH_TOKEN automatically)
# Optional env:
#   KEEP_DAILY (7), KEEP_WEEKLY (4), KEEP_MONTHLY (6)
#   DRY_RUN=1       - print KEEP/DELETE decisions but do not delete
#   RELEASES_FILE   - newline-separated tags to use INSTEAD of querying gh (for testing)
set -euo pipefail

KEEP_DAILY="${KEEP_DAILY:-7}"
KEEP_WEEKLY="${KEEP_WEEKLY:-4}"
KEEP_MONTHLY="${KEEP_MONTHLY:-6}"

list_tags() {
  if [[ -n "${RELEASES_FILE:-}" ]]; then
    grep -E '^backup-[0-9]{4}-[0-9]{2}-[0-9]{2}$' "${RELEASES_FILE}" || true
  else
    : "${BACKUP_REPO:?BACKUP_REPO required}"
    gh release list --repo "${BACKUP_REPO}" --limit 1000 \
      | awk '{print $1}' | grep -E '^backup-[0-9]{4}-[0-9]{2}-[0-9]{2}$' || true
  fi
}

# YYYY-MM-DD sorts correctly lexically; newest first.
mapfile -t ALL < <(list_tags | sort -ru)

declare -A KEEP=()

# Daily: the most recent KEEP_DAILY overall.
for t in "${ALL[@]:0:KEEP_DAILY}"; do KEEP["$t"]=1; done

# Weekly: most recent KEEP_WEEKLY whose date is a Sunday (date +%u == 7).
c=0
for t in "${ALL[@]}"; do
  d="${t#backup-}"
  if [[ "$(date -u -d "$d" +%u)" == "7" ]]; then
    KEEP["$t"]=1; c=$((c+1)); (( c >= KEEP_WEEKLY )) && break
  fi
done

# Monthly: most recent KEEP_MONTHLY whose day-of-month is 01.
c=0
for t in "${ALL[@]}"; do
  d="${t#backup-}"
  if [[ "$(date -u -d "$d" +%d)" == "01" ]]; then
    KEEP["$t"]=1; c=$((c+1)); (( c >= KEEP_MONTHLY )) && break
  fi
done

rc=0
for t in "${ALL[@]}"; do
  if [[ -n "${KEEP[$t]:-}" ]]; then
    echo "KEEP   $t"
  else
    echo "DELETE $t"
    if [[ "${DRY_RUN:-}" != "1" ]]; then
      gh release delete "$t" --repo "${BACKUP_REPO}" --yes --cleanup-tag || rc=1
    fi
  fi
done
exit "$rc"
```

- [ ] **Step 2: Make executable and shellcheck**

Run:
```bash
chmod +x scripts/prune-backups.sh
shellcheck scripts/prune-backups.sh
```
Expected: no errors.

- [ ] **Step 3: Seed a fixture covering daily/weekly/monthly cases**

Create `/tmp/relfix.txt` with a known set. These dates are chosen so the expected KEEP set is unambiguous (2026; 2026-01-04 and 2026-05-24 are Sundays; 2026-xx-01 are month firsts):
```bash
cat > /tmp/relfix.txt <<'EOF'
backup-2026-05-29
backup-2026-05-28
backup-2026-05-27
backup-2026-05-26
backup-2026-05-25
backup-2026-05-24
backup-2026-05-23
backup-2026-05-22
backup-2026-05-17
backup-2026-05-10
backup-2026-05-01
backup-2026-04-01
backup-2026-03-01
EOF
```

- [ ] **Step 4: Run the GFS logic in dry-run and check the decisions**

Run:
```bash
RELEASES_FILE=/tmp/relfix.txt DRY_RUN=1 KEEP_DAILY=7 KEEP_WEEKLY=4 KEEP_MONTHLY=6 \
  bash scripts/prune-backups.sh
```
Expected output (order: newest→oldest; KEEP for the 7 most recent + Sundays + month-firsts, DELETE otherwise):
```
KEEP   backup-2026-05-29
KEEP   backup-2026-05-28
KEEP   backup-2026-05-27
KEEP   backup-2026-05-26
KEEP   backup-2026-05-25
KEEP   backup-2026-05-24
KEEP   backup-2026-05-23
DELETE backup-2026-05-22
KEEP   backup-2026-05-17
KEEP   backup-2026-05-10
KEEP   backup-2026-05-01
KEEP   backup-2026-04-01
KEEP   backup-2026-03-01
```
Notes confirming correctness: `05-24` is a Sunday (kept as both daily and weekly); `05-17` and `05-10` are Sundays (weekly); `05-22` is the only non-anchor outside the 7 most recent → the single DELETE; `05-01/04-01/03-01` are month-firsts (monthly).

- [ ] **Step 5: Verify it would actually delete (DRY_RUN off, still no gh because deletion is gated)**

Run the same without `DRY_RUN` but keep `RELEASES_FILE` (so `gh release delete` runs against a non-existent repo and the script must surface a non-zero rc without crashing the loop):
```bash
RELEASES_FILE=/tmp/relfix.txt BACKUP_REPO=does/not-exist GH_TOKEN=x \
  bash scripts/prune-backups.sh; echo "exit=$?"
```
Expected: prints the same KEEP/DELETE lines; the one DELETE attempts `gh release delete` which fails → `exit=1` (proves failures are surfaced, not swallowed). This is acceptable for the test; in CI the prune step is `continue-on-error: true`.

- [ ] **Step 6: Commit**

```bash
git add scripts/prune-backups.sh
git commit -m "feat(ops): add prune-backups.sh GFS retention (7 daily/4 weekly/6 monthly)"
```

---

## Task 4: `.github/workflows/backup-db.yml` — wire it together

**Files:**
- Create: `.github/workflows/backup-db.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/backup-db.yml` with exactly this content:

```yaml
name: Backup Database

on:
  schedule:
    - cron: '0 2 * * *'   # 02:00 UTC nightly
  workflow_dispatch:

concurrency:
  group: backup-db
  cancel-in-progress: false

jobs:
  backup:
    name: Dump, encrypt, publish
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Checkout (for scripts)
        uses: actions/checkout@v4

      - name: Install tools (age, postgresql-client)
        run: |
          sudo apt-get update
          sudo apt-get install -y age postgresql-client

      - name: Configure SSH key
        run: |
          mkdir -p ~/.ssh && chmod 700 ~/.ssh
          printf '%s\n' "${{ secrets.SSH_PRIVATE_KEY }}" > ~/.ssh/id_backup
          chmod 600 ~/.ssh/id_backup

      - name: Create encrypted dump
        id: dump
        env:
          SSH_HOST: ${{ secrets.SSH_HOST }}
          SSH_USER: ${{ secrets.SSH_USER }}
          SSH_KEY_FILE: /home/runner/.ssh/id_backup
          AGE_PUBLIC_KEY: ${{ secrets.AGE_PUBLIC_KEY }}
        run: |
          bash scripts/backup-db.sh | tee out.txt
          grep '^ENCRYPTED_FILE=' out.txt >> "$GITHUB_OUTPUT"
          grep '^DUMP_BYTES='     out.txt >> "$GITHUB_OUTPUT"
          grep '^OBJECT_COUNT='   out.txt >> "$GITHUB_OUTPUT"

      - name: Publish backup release
        env:
          GH_TOKEN: ${{ secrets.BACKUP_REPO_TOKEN }}
          BACKUP_REPO: ${{ secrets.BACKUP_REPO }}
          ENCRYPTED_FILE: ${{ steps.dump.outputs.ENCRYPTED_FILE }}
          DUMP_BYTES: ${{ steps.dump.outputs.DUMP_BYTES }}
          OBJECT_COUNT: ${{ steps.dump.outputs.OBJECT_COUNT }}
          RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
        run: |
          TAG="backup-$(date -u +%Y-%m-%d)"
          NOTES="Encrypted pg_dump (custom format). Size: ${DUMP_BYTES} bytes, objects: ${OBJECT_COUNT}. Run: ${RUN_URL}"
          if gh release view "$TAG" --repo "$BACKUP_REPO" >/dev/null 2>&1; then
            gh release upload "$TAG" "$ENCRYPTED_FILE" --repo "$BACKUP_REPO" --clobber
          else
            gh release create "$TAG" "$ENCRYPTED_FILE" --repo "$BACKUP_REPO" --title "$TAG" --notes "$NOTES"
          fi

      - name: Prune old backups
        continue-on-error: true
        env:
          GH_TOKEN: ${{ secrets.BACKUP_REPO_TOKEN }}
          BACKUP_REPO: ${{ secrets.BACKUP_REPO }}
        run: bash scripts/prune-backups.sh

      - name: Notify Telegram on failure
        if: failure()
        env:
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
          RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
        run: |
          if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$TELEGRAM_CHAT_ID" ]; then
            echo "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID secret missing — cannot alert" >&2
            exit 1
          fi
          MESSAGE=$(printf '\xF0\x9F\x92\xBE *PROD DB BACKUP FAILED* \xF0\x9F\x92\xBE\n\nNightly PostgreSQL backup workflow failed.\n\n[GitHub run](%s)' "$RUN_URL")
          curl -sS -X POST \
            "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            -d "chat_id=${TELEGRAM_CHAT_ID}" \
            -d "parse_mode=Markdown" \
            -d "disable_web_page_preview=true" \
            --data-urlencode "text=${MESSAGE}"
```

- [ ] **Step 2: Lint the workflow**

Run:
```bash
# actionlint catches YAML + GitHub Actions expression errors. Install if missing:
#   go install github.com/rhysd/actionlint/cmd/actionlint@latest   (or: brew install actionlint)
actionlint .github/workflows/backup-db.yml
```
Expected: no errors. If `actionlint` is unavailable, at minimum validate YAML:
```bash
python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/backup-db.yml')); print('YAML OK')"
```
Expected: `YAML OK`.

- [ ] **Step 3: Confirm all referenced secrets are accounted for**

Run:
```bash
grep -oE "secrets\.[A-Z_]+" .github/workflows/backup-db.yml | sort -u
```
Expected exactly: `secrets.AGE_PUBLIC_KEY`, `secrets.BACKUP_REPO`, `secrets.BACKUP_REPO_TOKEN`, `secrets.SSH_HOST`, `secrets.SSH_PRIVATE_KEY`, `secrets.SSH_USER`, `secrets.TELEGRAM_BOT_TOKEN`, `secrets.TELEGRAM_CHAT_ID`. Cross-check these against the Pre-flight checklist.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/backup-db.yml
git commit -m "feat(ops): add nightly encrypted DB backup workflow"
```

---

## Task 5: `docs/ops/restore-runbook.md` — disaster-recovery procedure

**Files:**
- Create: `docs/ops/restore-runbook.md`

- [ ] **Step 1: Write the runbook**

Create `docs/ops/restore-runbook.md` with exactly this content:

````markdown
# Disaster Recovery Runbook — PostgreSQL Restore

Backups are nightly, `age`-encrypted `pg_dump` custom-format archives published as Release
assets in the private repo `$BACKUP_REPO` (tag `backup-YYYY-MM-DD`). See
`.github/workflows/backup-db.yml`.

**You need the OFFLINE age private key (`backup-key.txt`).** Without it, no backup can be
decrypted. It is NOT in CI — retrieve it from the password manager / offline copy.

## 0. Prerequisites
- `age`, `gh`, and `postgresql-client` (v16) installed locally or on the VPS.
- `gh auth login` (or `GH_TOKEN`) with read access to `$BACKUP_REPO`.
- The offline `backup-key.txt`.

## 1. Download the chosen backup
```bash
export BACKUP_REPO=owner/ai-budget-backups
gh release list --repo "$BACKUP_REPO"                 # pick a tag, e.g. backup-2026-05-29
TAG=backup-2026-05-29
gh release download "$TAG" --repo "$BACKUP_REPO" --dir .
```

## 2. Decrypt
```bash
age -d -i backup-key.txt ai_budget-${TAG#backup-}.dump.age > ai_budget.dump
```

## 3. Verify into a SCRATCH database first (never against live data)
```bash
docker run -d --name pg-restore-test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=ai_budget postgres:16-alpine
sleep 5
docker cp ai_budget.dump pg-restore-test:/tmp/ai_budget.dump
docker exec pg-restore-test pg_restore -U postgres -d ai_budget --clean --if-exists /tmp/ai_budget.dump
# Sanity: row counts of key tables
docker exec pg-restore-test psql -U postgres -d ai_budget -c \
  "select 'users', count(*) from users union all select 'expenses', count(*) from expenses union all select 'incomes', count(*) from incomes;"
docker rm -f pg-restore-test
```
Confirm the counts are in the expected range before touching production.

## 4. Restore into PRODUCTION
> Causes downtime. Announce it. The API must not write during restore.
```bash
cd /opt/ai-budget
docker compose -f docker-compose.prod.yml stop api admin
docker cp ai_budget.dump budget-db-prod:/tmp/ai_budget.dump
docker exec budget-db-prod pg_restore -U postgres -d ai_budget --clean --if-exists /tmp/ai_budget.dump
docker exec budget-db-prod rm -f /tmp/ai_budget.dump
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate api admin
```

## 5. Confirm recovery
```bash
curl -sf https://api.ai-budget.pl/api/v1/health && echo OK
```

## Integrity checklist
- [ ] Decrypt succeeded (step 2 produced a non-empty `.dump`).
- [ ] Scratch restore succeeded and `pg_restore --list ai_budget.dump | grep -c '^[0-9]'` > 10.
- [ ] Key-table row counts are sane.
- [ ] `/health` returns 200 after production restore.

## Test-restore log
Record each rehearsal so we know the procedure actually works:

| Date | Tag restored | Scratch row counts OK? | By |
|------|--------------|------------------------|----|
| _not yet test-restored_ | | | |
````

- [ ] **Step 2: Verify the runbook references match reality**

Run:
```bash
grep -n "budget-db-prod\|docker-compose.prod.yml\|/opt/ai-budget\|--env-file .env.production" docs/ops/restore-runbook.md
```
Expected: the container name, compose file, app dir, and env-file flag all appear and match `docker-compose.prod.yml` / `scripts/deploy.sh`.

- [ ] **Step 3: Commit**

```bash
git add docs/ops/restore-runbook.md
git commit -m "docs(ops): add PostgreSQL disaster-recovery restore runbook"
```

---

## Task 6: Live acceptance (requires owner Pre-flight secrets)

**No files.** This validates the real pipeline end-to-end. Gated on the Pre-flight checklist being done.

- [ ] **Step 1: Confirm Pre-flight is complete**

Verify the 5 Pre-flight items (private repo, age key, PAT, `BACKUP_REPO`, existing secrets) are in place. If any secret is missing, the workflow will fail at that step.

- [ ] **Step 2: Trigger a manual run**

Run:
```bash
gh workflow run "Backup Database" --ref development
gh run watch "$(gh run list --workflow 'Backup Database' --limit 1 --json databaseId -q '.[0].databaseId')"
```
Expected: the run succeeds; the "Create encrypted dump" step logs a plausible `DUMP_BYTES` and `OBJECT_COUNT`.

- [ ] **Step 3: Confirm the release + asset exist**

Run:
```bash
gh release list --repo "$BACKUP_REPO"
gh release view "backup-$(date -u +%Y-%m-%d)" --repo "$BACKUP_REPO"
```
Expected: a release tagged with today's date, with one `ai_budget-YYYY-MM-DD.dump.age` asset.

- [ ] **Step 4: Test-restore the real backup into a scratch DB**

Follow `docs/ops/restore-runbook.md` steps 1–3 against the just-created backup. Confirm key-table counts are sane.

- [ ] **Step 5: Mark the runbook as test-restored**

Edit `docs/ops/restore-runbook.md` — replace the `_not yet test-restored_` row with today's date, the tag restored, `yes`, and your name. Commit:
```bash
git add docs/ops/restore-runbook.md
git commit -m "docs(ops): record first successful test-restore of DB backup"
```

- [ ] **Step 6: Verify the failure alert path (optional but recommended)**

Temporarily set `BACKUP_REPO` secret to an invalid value (or rename it), run the workflow, confirm a Telegram message arrives, then restore the correct value.

---

## Task 7: Finish per project convention

- [ ] **Step 1: Update `CLAUDE.md` Production/Observability section**

Add a bullet under **Production** documenting the backup: nightly `backup-db.yml` → encrypted `pg_dump` → Release asset in the private backup repo, GFS retention (7/4/6), restore via `docs/ops/restore-runbook.md`, and that the offline `age` private key is the sole decryption secret.

- [ ] **Step 2: Create the ABA issue and finalize docs**

REQUIRED SUB-SKILL: Use `finish-aba-task` to create the `ABA-{N}` GitHub issue (English) and complete any remaining CLAUDE.md / user-docs updates. Run `gh issue list --limit 1` first to determine N.

- [ ] **Step 3: Commit any remaining doc changes**

```bash
git add CLAUDE.md
git commit -m "docs: document Phase 1 DB backup in CLAUDE.md"
```

---

## Notes for the implementer

- **No app code, no migration.** If you find yourself editing `apps/`, stop — that is out of scope.
- The two scripts are deliberately mockable (`LOCAL_DUMP`, `RELEASES_FILE`, `DRY_RUN`) so Tasks 2–3 are fully testable offline without the VPS or real secrets. Do not skip those tests.
- `gh` is preinstalled on `ubuntu-latest`; `age` and `postgresql-client` are installed by the workflow. The `pg_restore --list` sanity check needs client v16 to read a v16 custom-format archive.
- Cron is **UTC**. GFS "weekly = Sunday", "monthly = 1st" are computed in UTC; keep that in mind when reading retention.
- The age **private key never enters CI.** If a future need arises to auto-verify decryption in CI, do it with a *separate* test key on a *test* dump — never put the production private key in a secret.
```
