ALTER TABLE "users" ADD COLUMN "quiet_hours_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "quiet_hours_start" INTEGER NOT NULL DEFAULT 1320,
ADD COLUMN "quiet_hours_end" INTEGER NOT NULL DEFAULT 480;

CREATE TABLE "held_pushes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "type" TEXT,
    "release_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "held_pushes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "held_pushes_release_at_idx" ON "held_pushes"("release_at");
CREATE INDEX "held_pushes_user_id_idx" ON "held_pushes"("user_id");
ALTER TABLE "held_pushes" ADD CONSTRAINT "held_pushes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
