-- CreateTable
CREATE TABLE "slack_installations" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "team_name" TEXT,
    "bot_token" TEXT NOT NULL,
    "bot_user_id" TEXT NOT NULL,
    "app_id" TEXT,
    "enterprise_id" TEXT,
    "scope" TEXT,
    "installed_by_slack_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slack_installations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "slack_installations_team_id_key" ON "slack_installations"("team_id");
