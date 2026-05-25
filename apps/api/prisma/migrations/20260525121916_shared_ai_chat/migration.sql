-- ChatConversation: account scoping + shared flag
ALTER TABLE "chat_conversations" ADD COLUMN "account_id" TEXT;
ALTER TABLE "chat_conversations" ADD COLUMN "is_shared" BOOLEAN NOT NULL DEFAULT false;

-- ChatMessage: author + mentions
ALTER TABLE "chat_messages" ADD COLUMN "sender_user_id" TEXT;
ALTER TABLE "chat_messages" ADD COLUMN "mentioned_user_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill: existing private conversations -> creator's personal account
UPDATE "chat_conversations" c
SET "account_id" = (
  SELECT a."id" FROM "accounts" a
  WHERE a."owner_id" = c."user_id" AND a."type"::text = 'personal'
  ORDER BY a."created_at" ASC
  LIMIT 1
)
WHERE c."account_id" IS NULL;

-- Backfill: existing user messages -> sender = conversation creator
UPDATE "chat_messages" m
SET "sender_user_id" = c."user_id"
FROM "chat_conversations" c
WHERE m."conversation_id" = c."id" AND m."role" = 'user' AND m."sender_user_id" IS NULL;

-- Index + FK
CREATE INDEX "chat_conversations_account_id_updated_at_idx" ON "chat_conversations"("account_id", "updated_at");
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "chat_conversations" VALIDATE CONSTRAINT "chat_conversations_account_id_fkey";
