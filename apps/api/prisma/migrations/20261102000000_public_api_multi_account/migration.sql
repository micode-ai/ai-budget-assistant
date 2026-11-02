-- 1. The join table.
CREATE TABLE "oauth_grant_accounts" (
    "grant_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_grant_accounts_pkey" PRIMARY KEY ("grant_id","account_id")
);

CREATE INDEX "oauth_grant_accounts_account_id_idx" ON "oauth_grant_accounts"("account_id");

ALTER TABLE "oauth_grant_accounts" ADD CONSTRAINT "oauth_grant_accounts_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "oauth_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "oauth_grant_accounts" ADD CONSTRAINT "oauth_grant_accounts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Copy every grant's account (revoked ones too, to keep history) BEFORE the column is dropped.
INSERT INTO "oauth_grant_accounts" ("grant_id", "account_id", "created_at")
SELECT "id", "account_id", "created_at" FROM "oauth_grants";

-- 3. Merge active grants to one per (client, user). Survivor = earliest created_at, tie on id.
-- Production holds no grants on 2026-11-02; this only matters for dev/staging data.
CREATE TEMP TABLE "_grant_merge" AS
SELECT "id",
       first_value("id") OVER (PARTITION BY "client_id", "user_id" ORDER BY "created_at", "id") AS "survivor_id"
FROM "oauth_grants"
WHERE "revoked_at" IS NULL;

-- Keep only the losers.
DELETE FROM "_grant_merge" WHERE "id" = "survivor_id";

INSERT INTO "oauth_grant_accounts" ("grant_id", "account_id", "created_at")
SELECT m."survivor_id", a."account_id", a."created_at"
FROM "_grant_merge" m
JOIN "oauth_grant_accounts" a ON a."grant_id" = m."id"
ON CONFLICT DO NOTHING;

-- The survivor keeps ITS OWN scopes (no union): merging the scopes of two grants would give an account a
-- scope its user never approved for it. The losers' accounts join the survivor (above) and read with its scopes.

DELETE FROM "oauth_tokens" WHERE "grant_id" IN (SELECT "id" FROM "_grant_merge");

-- No dedicated enum value for "merged"; 'user' is the closest. Merged losers are never read again.
UPDATE "oauth_grants" SET "revoked_at" = now(), "revoked_by" = 'user'
WHERE "id" IN (SELECT "id" FROM "_grant_merge");

DROP TABLE "_grant_merge";

-- 4. One active grant per (client, user) now, not per account. Prisma cannot model a partial index; do not
-- let a later migrate dev drop it (schema-guard.spec.ts).
DROP INDEX oauth_grants_active_key;
CREATE UNIQUE INDEX oauth_grants_active_client_user_key ON oauth_grants (client_id, user_id) WHERE revoked_at IS NULL;

-- 5. Drop the single-account column.
ALTER TABLE "oauth_grants" DROP CONSTRAINT "oauth_grants_account_id_fkey";
DROP INDEX "oauth_grants_account_id_idx";
ALTER TABLE "oauth_grants" DROP COLUMN "account_id";
