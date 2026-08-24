# Disk pressure on the prod VPS

What to do when `infra-watch` reports `disk NN% > 85% on /`, and why the disk fills
up in the first place.

The box is a 38 GB Hetzner VPS shared by several MiCode projects on **one Docker
daemon** — `ai-budget`, `marketing-ai`, `accounting-ai-agent`, `legalka-bot` and the
`shared-nginx` reverse proxy. That sharing is what makes most of the obvious cleanup
commands unsafe, so read the safety section before typing anything.

## Diagnose first

```bash
ssh root@46.225.23.232
df -h /
docker system df
du -xh --max-depth=1 / 2>/dev/null | sort -h | tail -10
find / -xdev -type f -size +200M -printf '%s\t%p\n' 2>/dev/null | sort -rn | head
```

`docker system df` is the one that usually answers it. **Build Cache with 0 active
and 100% reclaimable is the normal culprit** (2026-08-24: 3.35 GB of cache plus a
1.8 GB `buildkit/metadata_v2.db`, which together came to 5.6 GB once pruned).

## Fix

```bash
ssh root@46.225.23.232 'bash -s' < scripts/docker-gc.sh
```

Or trigger the **Docker GC** workflow (`workflow_dispatch`). It runs weekly on
Sunday at 01:00 UTC, an hour before `backup-db.yml`, so the nightly dump is written
to a disk that has just been cleaned. It no-ops below 70% and alerts only when the
disk is *still* above 85% after cleaning.

## Safety — what must never be run here

| Command | Why not |
|---|---|
| `docker volume prune` | `ai-budget_postgres_data` and `ai-budget_redis_data` live there, and so do other projects' volumes. **Never**, with or without filters, on this box. |
| `docker image prune -a` | Removes unused-but-**tagged** images. On a shared box those are another project's rollback target. Plain `docker image prune -f` (dangling only) is fine. |
| `docker system prune -a` | Both of the above at once. |
| `rm -rf /var/log/journal/*` | Use `journalctl --vacuum-size=200M`, which keeps the journal working. |
| `systemctl restart docker` | Restarts **every** project's containers. It does compact `metadata_v2.db`, but `docker builder prune -af` already removes it; only reach for a restart if the file survives a prune. |

Snap-installed Docker is held and disabled after the 2026-04-27 socket-hijack
incident — see CLAUDE.md. Do not re-enable it.

## Why it keeps happening

`docker image prune -f` and `docker builder prune -af` have been in
`scripts/deploy.sh:76,79` since ABA-165. But `deploy.yml` is path-filtered to
`apps/api/**`, `apps/admin/**`, `packages/**`, `docker/**`,
`docker-compose.prod.yml` and `scripts/deploy.sh` — so a stretch of mobile,
marketing or docs work means `deploy.sh` never runs and the cache grows untouched.
That is exactly how ABA-165 recurred as ABA-432 a week after the last API deploy.
`scripts/docker-gc.sh` on a schedule is the fix; the prune inside `deploy.sh` stays
as-is.

## Container logs — only four of sixteen are capped

`docker-compose.prod.yml` sets `max-size: 10m` / `max-file: 3`, which covers
`budget-db-prod`, `budget-redis-prod`, `budget-api-prod` and `budget-admin-prod`.
Nothing else on the box has a limit, including **our own** `ai-budget-web-prod` and
`ai-budget-app-prod` — they were created by hand on the VPS (ABA-213 / ABA-269),
not through compose. `shared-nginx` had reached a 244 MB json.log by 2026-08-24.

To check:

```bash
for c in $(docker ps --format '{{.Names}}'); do
  printf "%-28s max-size=%s\n" "$c" \
    "$(docker inspect -f '{{index .HostConfig.LogConfig.Config "max-size"}}' $c)"
done
du -h /var/lib/docker/containers/*/*-json.log | sort -h | tail
```

The fix is to recreate the container with
`--log-opt max-size=10m --log-opt max-file=3`. For our two static-site containers
that is a couple of seconds of downtime; for `shared-nginx` it briefly interrupts
every site on the box, so it needs a window. **Not yet done** — tracked in ABA-432.

## Known space that is deliberately left alone

- **`/root/.gradle` (4.3 GB) and `/opt/android-sdk` (2.9 GB)** — Android toolchain
  on a server that only runs API, admin and nginx. Mobile builds happen on EAS and
  GitHub runners, so this is almost certainly a leftover from a one-off local
  build, but it may belong to another project on the box. 7.2 GB, the largest
  remaining win, needs a human decision.
- **`/swapfile` (4.0 GB)** — legitimate, leave it.
- **~1.8 GB of unused-but-tagged Docker images** — see the safety table.
