# Prisma schema changes and migrations

*Hub: [api](../api.md)*

## What this is

How a database schema change reaches production, and the one failure nothing in the pipeline catches.

## Entry points

- `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`
- `scripts/deploy.sh` (runs the `migrator` compose service)

## Invariants

**Database.** Prisma ORM. Schema at `apps/api/prisma/schema.prisma`. Uses `@map("snake_case")` for column names. Prod `DATABASE_URL` includes `connection_limit=10` (see `docker-compose.prod.yml`) to cap the connection pool. **A `schema.prisma` field change MUST land with its migration in the same commit — nothing in the pipeline catches a missing one (ABA-558)**: lint, typecheck, tests and the deploy all pass, `prisma generate` happily builds a client that selects the new column, `prisma migrate deploy` has nothing to apply, and the first query to touch it fails at runtime in production. ABA-556 added `ExpenseItem.lineDiscount` without a migration and broke `ExpensesService.findAll` — the whole transactions list, not just the receipt-split feature it shipped — for everyone. **Monitoring cannot see this**: `/health` runs `SELECT 1` and never touches the table, so the container reported `healthy` and `uptime-check.yml` stayed green throughout; Sentry was the only signal. To recover, author the migration and apply it through the **standard `migrator` service** (`docker compose -f docker-compose.prod.yml --env-file .env.production --profile migrate run --rm migrator`, the same command `scripts/deploy.sh` runs) after copying the migration folder to `/opt/ai-budget` — never by hand-editing the database, which leaves `_prisma_migrations` without the row and makes the next deploy re-apply it. To audit for drift without a shadow DB, diff the `@map`ped columns in `schema.prisma` against `information_schema.columns` on prod; note a `String[]` field has no `@db` column type of its own and will read as a false positive.

## History

ABA-556 (the missing migration) · ABA-558 (the rule).
