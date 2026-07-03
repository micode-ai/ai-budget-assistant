-- AlterTable
ALTER TABLE "account_invitations" ADD COLUMN     "invited_user_id" TEXT;

-- CreateIndex
CREATE INDEX "account_invitations_invited_user_id_idx" ON "account_invitations"("invited_user_id");
