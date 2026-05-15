---
title: 'API & Admin Deploy'
status: running
iterations: 0
---

# API & Admin Deploy

## Trigger
Push to `development` branch that touches `apps/api/**`, `apps/admin/**`, `packages/shared-types/**`, `packages/shared-utils/**`, `docker-compose.prod.yml`, or `scripts/deploy.sh`. Also triggerable manually via `workflow_dispatch`.

## Steps
1. GitHub Actions (`.github/workflows/deploy.yml`) SSHes into Hetzner VPS as `SSH_USER`.
2. `scripts/deploy.sh` runs on the server:
   a. `git fetch origin && git reset --hard origin/development` — pull latest code.
   b. `docker compose build api admin migrator` — rebuild images.
   c. Start / await healthy `postgres` and `redis` containers.
   d. Run `migrator` service (`prisma migrate deploy`) — apply pending DB migrations.
   e. `docker compose up -d --force-recreate api admin` — replace running containers.
   f. Reconnect `accounting-nginx` to the budget network and reload nginx.
3. CI verify step polls `https://api.ai-budget.pl/api/v1/health` every 3 s for up to 120 s. Fails the run if API never returns 200.

## Failure modes
- **Postgres not healthy** — check `docker compose logs postgres`; disk full, OOM, or missing env var are common causes.
- **Migration failure** — run `docker compose logs migrator`; conflicting migration or bad SQL. Fix migration, re-push.
- **API health timeout** — check `docker logs --tail 100 budget-api-prod`; startup crash usually means missing env var in `.env.production`.
- **`accounting-nginx` not found** — nginx isn't running; connect manually or restart the nginx stack.
- **`POSTGRES_PASSWORD` missing** — `deploy.sh` will abort early; add the var to `.env.production` on the server.

## Owner
Mihail Perevertkin (solo project)

## Where to look first when it breaks
- GitHub Actions run log (deploy + verify steps)
- `docker logs --tail 100 budget-api-prod` on the VPS
- `docker compose -f docker-compose.prod.yml ps` for container state
