-- CreateEnum
CREATE TYPE "GroupMemberEventKind" AS ENUM ('owner_transferred', 'member_merged', 'claim_reset');

-- DropForeignKey
ALTER TABLE "expense_groups" DROP CONSTRAINT "expense_groups_owner_user_id_fkey";

-- AlterTable
ALTER TABLE "expense_groups" ALTER COLUMN "owner_user_id" DROP NOT NULL,
ADD COLUMN     "orphaned_at" TIMESTAMP(3);

-- The SetNull FK backstop orphans a group without any application code running, so the timestamp is
-- stamped by the database whenever an owner becomes NULL.
CREATE FUNCTION "expense_groups_set_orphaned_at"() RETURNS trigger AS $$
BEGIN
  IF NEW."owner_user_id" IS NULL AND OLD."owner_user_id" IS NOT NULL AND NEW."orphaned_at" IS NULL THEN
    NEW."orphaned_at" := CURRENT_TIMESTAMP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "expense_groups_orphaned_at" BEFORE UPDATE ON "expense_groups"
FOR EACH ROW EXECUTE FUNCTION "expense_groups_set_orphaned_at"();

-- CreateTable
CREATE TABLE "group_member_events" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "kind" "GroupMemberEventKind" NOT NULL,
    "actor_member_id" TEXT,
    "subject_member_id" TEXT NOT NULL,
    "target_member_id" TEXT,
    "subject_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_member_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_member_events_group_id_created_at_idx" ON "group_member_events"("group_id", "created_at");

-- AddForeignKey
ALTER TABLE "expense_groups" ADD CONSTRAINT "expense_groups_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_member_events" ADD CONSTRAINT "group_member_events_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "expense_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Data step (ABA-650): groups that are already headless because their owner deactivated the account
-- (DELETE /users/me is a soft delete, so nothing cascaded). Successor = the earliest-joined live
-- member whose account is active; none = NULL (orphaned, adoptable by the next app-user member).
-- An event row records it for the group's activity, exactly as GroupOwnershipService does at runtime.
CREATE TEMP TABLE "_aba650_headless" AS
SELECT g."id" AS group_id,
       om."id" AS old_member_id,
       om."display_name" AS old_name,
       s."id" AS new_member_id,
       s."user_id" AS new_user_id
FROM "expense_groups" g
JOIN "users" o ON o."id" = g."owner_user_id" AND o."is_active" = false
LEFT JOIN LATERAL (
  SELECT m."id", m."display_name"
  FROM "expense_group_members" m
  WHERE m."group_id" = g."id" AND m."user_id" = g."owner_user_id"
  LIMIT 1
) om ON true
LEFT JOIN LATERAL (
  SELECT m."id", m."user_id"
  FROM "expense_group_members" m
  JOIN "users" u ON u."id" = m."user_id"
  WHERE m."group_id" = g."id" AND m."removed_at" IS NULL AND u."is_active" = true
  ORDER BY m."created_at" ASC, m."id" ASC
  LIMIT 1
) s ON true;

INSERT INTO "group_member_events" ("id", "group_id", "kind", "actor_member_id", "subject_member_id", "target_member_id", "subject_name", "created_at")
SELECT gen_random_uuid()::text, h.group_id, 'owner_transferred'::"GroupMemberEventKind", NULL::text, h.old_member_id, h.new_member_id, h.old_name, CURRENT_TIMESTAMP
FROM "_aba650_headless" h
WHERE h.old_member_id IS NOT NULL;

UPDATE "expense_groups" g
SET "owner_user_id" = h.new_user_id,
    "orphaned_at" = CASE WHEN h.new_user_id IS NULL THEN CURRENT_TIMESTAMP ELSE NULL END
FROM "_aba650_headless" h
WHERE g."id" = h.group_id;

DROP TABLE "_aba650_headless";
