-- ABA-809: a per-user version carried in every JWT; bumping it revokes all issued tokens.
ALTER TABLE "users" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
