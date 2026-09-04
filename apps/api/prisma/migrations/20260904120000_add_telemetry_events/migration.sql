-- CreateTable
CREATE TABLE "telemetry_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "screen" TEXT,
    "platform" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "props" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetry_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "telemetry_events_created_at_idx" ON "telemetry_events"("created_at");

-- CreateIndex
CREATE INDEX "telemetry_events_name_created_at_idx" ON "telemetry_events"("name", "created_at");

-- CreateIndex
CREATE INDEX "telemetry_events_user_id_session_id_idx" ON "telemetry_events"("user_id", "session_id");

-- AddForeignKey
ALTER TABLE "telemetry_events" ADD CONSTRAINT "telemetry_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

