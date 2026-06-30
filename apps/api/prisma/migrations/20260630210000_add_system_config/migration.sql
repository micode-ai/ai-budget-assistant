CREATE TABLE "system_config" (
  "key"        TEXT NOT NULL,
  "value"      TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "system_config_pkey" PRIMARY KEY ("key")
);

-- Seed the family feed retention default (5 days)
INSERT INTO "system_config" ("key", "value", "updated_at")
VALUES ('familyFeedRetentionDays', '5', NOW())
ON CONFLICT ("key") DO NOTHING;
