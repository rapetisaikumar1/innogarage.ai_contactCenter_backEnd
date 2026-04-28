-- Strict owner-only voice routing and missed-call alert cleanup support.

ALTER TABLE "voice_sessions"
  ADD COLUMN IF NOT EXISTS "reservedAgentId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'voice_sessions_reservedAgentId_fkey'
  ) THEN
    ALTER TABLE "voice_sessions"
      ADD CONSTRAINT "voice_sessions_reservedAgentId_fkey"
      FOREIGN KEY ("reservedAgentId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "voice_sessions_reservedAgentId_status_idx"
  ON "voice_sessions"("reservedAgentId", "status");

ALTER TABLE "agent_notifications"
  ADD COLUMN IF NOT EXISTS "callId" TEXT,
  ADD COLUMN IF NOT EXISTS "clearedAt" TIMESTAMP(3);

DROP INDEX IF EXISTS "agent_notifications_userId_isRead_createdAt_idx";

CREATE INDEX IF NOT EXISTS "agent_notifications_userId_isRead_clearedAt_createdAt_idx"
  ON "agent_notifications"("userId", "isRead", "clearedAt", "createdAt");

CREATE INDEX IF NOT EXISTS "agent_notifications_callId_clearedAt_idx"
  ON "agent_notifications"("callId", "clearedAt");
