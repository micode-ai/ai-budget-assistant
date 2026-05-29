# Infra Fault Tolerance — Phase 2 Design

**Date**: 2026-05-29
**Owner agent**: `aba-devops-engineer`
**Status**: Approved
**Predecessor**: Phase 1 (`2026-05-29-postgres-backup-phase1-design.md`) — automated encrypted DB backups (done, live).

## Goal

Remove preventable downtime causes, surface problems early, and have a tested procedure to rebuild the whole server. Phase 1 made the data recoverable; Phase 2 makes the running system resilient and the recovery actually executable end-to-end.

## Findings (current state, verified)

- `restart: unless-stopped` on all services ✓. Healthchecks exist for all: postgres/redis in compose, api/admin via `HEALTHCHECK` in their Dockerfiles ✓.
- **No Docker log rotation** — default `json-file` driver with no limit; logs grow unbounded → disk-fill outage risk.
- **No disk-space / per-container monitoring** — a full disk stops Postgres writes (outage); `uptime-check.yml` only probes `/health` every 5 min (catches total API/DB outage, not disk pressure or a single unhealthy container).
- All critical state is in Postgres (Phase 1 covers it). Redis is pure cache (`allkeys-lru`; rate-limit counters, chat presence, UserContext cache) — its loss on restart is safe and by design.
- Receipt images are in-DB `Bytes` → no separate file volume to back up (the original "receipt volume backup" item is moot).
- `.env.production` (prod secrets) exists **only on the VPS** — a real gap for full-server recovery.

## Scope (approved)

A. **Docker log rotation** — cap container logs.
B. **Disk + container-health monitoring** — off-host cron, Telegram alert.
C. **"Rebuild from scratch" DR runbook** — full server-loss recovery, tying in Phase 1 restore.
Plus: document the deliberate decision **not** to persist Redis.

**Out of scope:** Redis AOF/persistence (decided against), DB replica/HA (Phase 3, likely YAGNI), mobile local backup (Phase 4), compose `admin → api service_healthy` gate (deferred — minor).

---

## A. Docker log rotation

Add to each long-running service in `docker-compose.prod.yml` (postgres, redis, api, admin):

```yaml
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

~30 MB cap per container. Changing the compose `logging` config causes the service to be recreated on the next `up -d` (deploy already force-recreates api/admin; postgres/redis recreate because their config changed — acceptable, brief). `migrator` is one-shot; logging config optional there.

## B. Disk + container-health monitoring

- **`scripts/infra-check.sh`** (new) — runs ON the VPS (piped via SSH `bash -s`, so it does not depend on a deploy having landed). Checks:
  1. Root filesystem usage: `df --output=pcent /` → fail if used > `DISK_THRESHOLD` (default **85**).
  2. Each expected container (`budget-db-prod`, `budget-redis-prod`, `budget-api-prod`, `budget-admin-prod`) is **running** and not in Docker health state `unhealthy`.
  Prints a human summary; exits non-zero with a reason if anything is wrong. `set -euo pipefail`; thresholds via env so it is testable.
- **`.github/workflows/infra-watch.yml`** (new) — `schedule` every 30 min (`*/30 * * * *`) + `workflow_dispatch`. SSHes to the VPS and runs the script via `ssh "$SSH_USER@$SSH_HOST" 'bash -s' < scripts/infra-check.sh`. On non-zero exit → Telegram alert (same pattern as `uptime-check.yml`/`backup-db.yml`), including the script's captured summary. Reuses `SSH_HOST`/`SSH_USER`/`SSH_PRIVATE_KEY`/`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`. No new secrets.
- Complements `uptime-check.yml` (5-min `/health` probe) with disk pressure + per-container granularity that the HTTP probe cannot see.

## C. "Rebuild from scratch" DR runbook

**`docs/ops/disaster-recovery-runbook.md`** (new) — total VPS loss recovery:

1. Provision a new VPS (Ubuntu). Install Docker **via apt, NOT snap** (snap is held/disabled after the 2026-04-27 socket-hijack incident).
2. `git clone` the repo into `/opt/ai-budget`. Recreate `.env.production` from the offline secrets copy. Repoint DNS (`api.ai-budget.pl`, `admin.ai-budget.pl`) + bring up the shared `accounting-nginx` stack.
3. `docker compose -f docker-compose.prod.yml --env-file .env.production up -d postgres redis`, then restore the DB from the latest Phase 1 backup (download the Release asset → `age -d` with the offline key → `pg_restore`). Cross-reference `docs/ops/restore-runbook.md` for the exact restore commands.
4. Run the migrator, then `up -d --force-recreate api admin`.
5. Verify `GET /api/v1/health` → 200; smoke-test login + one read.
6. Note: Redis needs no restore — it is cache and repopulates on its own. Redis persistence is intentionally **not** enabled (it contradicts the `allkeys-lru` cache role and adds disk I/O for disposable data).

**Critical DR prerequisite (documented in the runbook):** keep an **offline copy of `.env.production`** (prod secrets) in the password manager. It lives only on the VPS today; without it the stack cannot be rebuilt. This sits alongside the offline `age` private key from Phase 1.

## Files touched

- `docker-compose.prod.yml` — add `logging` to 4 services.
- `scripts/infra-check.sh` — new.
- `.github/workflows/infra-watch.yml` — new.
- `docs/ops/disaster-recovery-runbook.md` — new.
- `CLAUDE.md` (Observability) + `docs/en/SETUP.md` + `docs/ru/SETUP.md` — document monitoring + DR + log rotation.

No application code, no migration.

## Risks & edge cases

- **Log-rotation recreate**: pushing `docker-compose.prod.yml` triggers `deploy.yml` (it is in the path filter), which force-recreates api/admin (seconds of downtime) and recreates postgres/redis due to config change. Acceptable; postgres/redis keep their named volumes (data preserved). Call this out so it is not a surprise.
- **infra-check false positives**: a brief container restart during deploy could trip the 30-min check. Mitigation: the check tolerates `restarting`/`starting` health states (only `unhealthy` or `exited`/missing alerts); document the thresholds.
- **Disk threshold tuning**: 85% default; expose via env so it can be raised/lowered without code change.
- **SSH dependency**: if the VPS is fully down, the SSH step fails — that is itself an alert, and `uptime-check.yml` already covers total outage. No double-paging concern worth special handling at this scale.
- **Secrets handling** (new workflow uses existing SSH + Telegram secrets): flag for a quick `aba-security` glance, though no new secret or trust boundary is introduced.
