# Data Backup & Fault Tolerance — Design

**Date**: 2026-05-29
**Owner agent**: `aba-devops-engineer` (created in this session)
**Status**: Phase 1 approved; phases 2–4 deferred

## Goal

Today the production database is a single point of failure: PostgreSQL lives in one
Docker named volume (`postgres_data`) on a single Hetzner VPS, with **no automated
backups, no off-site copy, no PITR, and no replica**. Loss of the disk, volume, or
server means irreversible loss of every user's financial data. This work removes that
catastrophic risk and improves recovery time, in phases.

The application-level per-account JSON export/restore (`modules/backups/`, ABA-163) is a
*product* feature for data portability — it is **distinct** from the *infrastructure*
disaster-recovery backups designed here and is out of scope.

## Phased roadmap

| Phase | Scope | Owner | Status |
|---|---|---|---|
| **1** | Automated encrypted PostgreSQL backup → off-site (GitHub Releases) | devops | **This spec — approved** |
| 2 | Infra fault tolerance: Redis persistence, restart/healthcheck review, DR runbook | devops | Deferred (next spec) |
| 3 | DB replica / HA (streaming replica or failover) | devops | Deferred — likely YAGNI for a single VPS |
| 4 | Mobile local-data auto-backup (SQLite → user cloud, extends ABA-163) | mobile | Deferred — separate product feature |

Each phase gets its own spec → plan → implementation cycle. **This document specifies
Phase 1 only.**

---

# Phase 1 — Automated encrypted PostgreSQL backup → GitHub Releases

## Decisions (from brainstorming)

- **Destination**: a dedicated **private GitHub repository**, dumps attached as **Release
  assets** (free, off-host, off-provider relative to Hetzner, up to 2 GB/asset, easy
  retention, does not bloat the main repo).
- **Scheduler & runner**: a **GitHub Actions cron workflow** (off-host — survives a VPS
  reboot/outage), consistent with `deploy.yml` and `uptime-check.yml`.
- **Frequency / RPO**: **nightly**, RPO ≤ 24 h. **GFS retention**: 7 daily + 4 weekly
  (Sunday) + 6 monthly (1st of month).
- **Encryption**: **`age` asymmetric** — the runner holds only the public (recipient)
  key and cannot decrypt; the private key is kept **offline by the owner** plus a second
  copy. A CI/GitHub/Secrets compromise leaks ciphertext only.

## Key facts about the system (verified)

- All critical state is in PostgreSQL. Receipt images are `Expense.receiptImage` **`Bytes`
  blobs in the DB**, not a separate file store — there is **no on-disk upload volume** to
  back up separately. A single `pg_dump` therefore captures essentially everything.
- Redis (`redis_data`) is cache only: rate-limit counters, chat presence, UserContext
  cache — `maxmemory 256mb allkeys-lru`. Its loss is acceptable. **Out of scope for
  Phase 1.**
- Prod app dir on the VPS is `/opt/ai-budget`. DB container is `budget-db-prod`,
  database `ai_budget`, user `postgres`.
- Existing GitHub Secrets reused: `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`,
  `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

## Architecture / data flow

```
GitHub Actions cron (0 2 * * * UTC, off-host) + workflow_dispatch
  │
  ├─ SSH to VPS ──> docker exec budget-db-prod pg_dump -U postgres -d ai_budget -Fc
  │                   └─ stream custom-format dump back to the runner (temp file)
  │
  ├─ Sanity check ── pg_restore --list <dump>   (valid archive? object count > threshold?)
  ├─ Size guard ──── fail if dump < 10 KB        (catches empty/failed dump on exit 0)
  │
  ├─ Encrypt ─────── age -r "$AGE_PUBLIC_KEY"  ai_budget-YYYY-MM-DD.dump  > *.dump.age
  │
  ├─ Publish ─────── gh release create backup-YYYY-MM-DD \
  │                     --repo "$BACKUP_REPO" --notes "<size, object count, run url>" \
  │                     <asset>.dump.age          (auth: BACKUP_REPO_TOKEN PAT)
  │
  ├─ Prune ───────── GFS policy over releases in $BACKUP_REPO (non-fatal on error)
  │
  └─ on failure() ── Telegram alert (pattern reused from uptime-check.yml)
```

The dump is produced **inside** the running container and streamed out; it does not lock
tables and does not inflate VPS heap (avoids the ABA-163 OOM class of problem).

## Components / files

| File | Purpose |
|---|---|
| `.github/workflows/backup-db.yml` | New workflow: cron + `workflow_dispatch`; dump → sanity → encrypt → publish → prune → alert. |
| `scripts/backup-db.sh` | Optional helper invoked over SSH for the dump+stream step, mirroring `scripts/deploy.sh` style (`set -euo pipefail`, absolute paths, idempotent). Keeps the YAML thin. |
| `docs/ops/restore-runbook.md` | Disaster-recovery runbook: decrypt → scratch-restore → verify → production restore, with copy-paste commands + integrity checklist. |
| `.env.example` | Document new secret **names** (no values): `AGE_PUBLIC_KEY`, `BACKUP_REPO`, `BACKUP_REPO_TOKEN`. |

No application source code (services/controllers/screens) and **no Prisma migration** are
required for Phase 1 — this is pure infra.

## Secrets (names only; provisioned manually by the owner)

| Secret | Use |
|---|---|
| `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY` | (existing) SSH to VPS to run `pg_dump`. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | (existing) failure alerts to ops chat. |
| `AGE_PUBLIC_KEY` | (new) `age` recipient public key; runner encrypts with this. |
| `BACKUP_REPO` | (new) `owner/ai-budget-backups` — dedicated private repo. |
| `BACKUP_REPO_TOKEN` | (new) PAT with `contents:write` on `BACKUP_REPO` (default `GITHUB_TOKEN` cannot write to another repo). |

The `age` **private key** is **never** stored in CI — kept offline by the owner (password
manager) + one independent copy. It is the single artifact that makes backups
recoverable; losing it makes every backup useless.

## Error handling

- `set -euo pipefail` in all script steps; `script_stop: true` on the SSH action.
- `pg_dump` non-zero / container down → job fails → Telegram alert.
- Sanity (`pg_restore --list`) failure or object count below a small threshold → fail.
- Size guard: dump `< 10 KB` → fail explicitly (empty/corrupt dump even on exit 0).
- Upload failure (network / bad PAT) → fail → Telegram alert.
- Prune failure → **non-fatal** (warn + log) so it never voids a good backup.

## Restore procedure (summary; full in runbook)

1. Download the chosen `*.dump.age` release asset from `BACKUP_REPO`.
2. Decrypt offline: `age -d -i backup-key.txt ai_budget-DATE.dump.age > ai_budget.dump`.
3. **Verify into a scratch DB first**: start a throwaway postgres, `pg_restore` into it,
   compare row counts of key tables against expectations. Never verify against live data.
4. Production recovery: stop `api`, `pg_restore --clean --if-exists -U postgres -d ai_budget
   ai_budget.dump`, restart `api`, confirm `GET /api/v1/health` returns 200.

## Testing / acceptance

- `workflow_dispatch` manual run produces a Release with a `*.dump.age` asset in
  `BACKUP_REPO`, and the run log shows object count + dump size.
- A failure path (e.g. temporarily wrong DB name) produces a Telegram alert.
- **Test-restore** the decrypted dump into a scratch DB; confirm key-table row counts
  match production; mark the runbook **"test-restored ✓"** with the date.
- GFS prune leaves exactly the expected set after seeding several dated releases.

## Risks & edge cases

- **Dump size growth from receipt blobs.** Receipt images live in the DB; dumps will grow
  with usage. `-Fc` compression + GFS mitigates; Release assets allow up to 2 GB. Revisit
  → object storage (B2/R2) if a single dump exceeds a few hundred MB. The workflow's
  destination step is kept isolated so the backend can be swapped without redesign.
- **Offline private key loss** = unrecoverable backups. Mitigated by documenting two
  independent copies in the runbook; this is the top operational risk.
- **PAT scope / expiry.** A short-lived or over-broad PAT is a risk; document a
  fine-grained PAT limited to `contents:write` on `BACKUP_REPO`, with a renewal reminder.
- **Clock/timezone.** Cron is UTC; GFS "weekly = Sunday", "monthly = 1st" computed in UTC.
  Document so retention is predictable.
- **Secret hygiene** — `BACKUP_REPO_TOKEN` and SSH key already exist as the deploy path's
  trust boundary; no new VPS-side secret is introduced. Flag for `aba-security` review of
  the new workflow's secret handling before merge.

## Out of scope (Phase 1)

- Redis persistence/backup; restart-policy & healthcheck review; DR runbook for non-DB
  state (→ Phase 2).
- PITR / WAL archiving (→ if RPO < 24 h ever required).
- DB replica / HA (→ Phase 3, likely YAGNI).
- Mobile local-data auto-backup (→ Phase 4, mobile feature).
- The product-level per-account export/restore (`modules/backups/`, ABA-163) — already
  exists, unrelated.

## Manual ops prerequisites (owner, before first run)

1. Create the private backup repo (`ai-budget-backups`).
2. `age-keygen -o backup-key.txt` → put the **public** line in `AGE_PUBLIC_KEY` secret;
   store `backup-key.txt` (private) offline + a second copy.
3. Create a fine-grained PAT (`contents:write` on the backup repo) → `BACKUP_REPO_TOKEN`;
   set `BACKUP_REPO`.
