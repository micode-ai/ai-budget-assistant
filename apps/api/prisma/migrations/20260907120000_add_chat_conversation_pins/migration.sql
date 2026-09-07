-- CreateTable
CREATE TABLE "chat_conversation_pins" (
    "user_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "pinned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_conversation_pins_pkey" PRIMARY KEY ("user_id","conversation_id")
);

-- CreateIndex
CREATE INDEX "chat_conversation_pins_user_id_idx" ON "chat_conversation_pins"("user_id");

-- AddForeignKey
ALTER TABLE "chat_conversation_pins" ADD CONSTRAINT "chat_conversation_pins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_conversation_pins" ADD CONSTRAINT "chat_conversation_pins_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

