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
