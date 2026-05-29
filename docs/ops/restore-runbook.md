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
| 2026-05-29 | backup-2026-05-29 | yes — scratch restore into throwaway postgres:16, row counts verified | Mihail Perevertkin |
