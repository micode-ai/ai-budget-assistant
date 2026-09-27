-- Voice digest (plan 2026-09-27-voice-digest-api)
ALTER TABLE "users" ADD COLUMN "voice_digest_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "voice_digest_day" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "users" ADD COLUMN "voice_digest_hour" INTEGER NOT NULL DEFAULT 8;
ALTER TABLE "users" ADD COLUMN "voice_digest_channel" TEXT;
ALTER TABLE "users" ADD COLUMN "voice_digest_last_sent_at" TIMESTAMP(3);
CREATE INDEX "users_voice_digest_enabled_idx" ON "users"("voice_digest_enabled");
