-- CreateEnum
CREATE TYPE "ExpenseGroupJoinVia" AS ENUM ('owner', 'placeholder', 'app_link', 'guest', 'guest_linked');

-- AlterTable
ALTER TABLE "expense_group_members" ADD COLUMN     "joined_via" "ExpenseGroupJoinVia",
ADD COLUMN     "linked_at" TIMESTAMP(3);

