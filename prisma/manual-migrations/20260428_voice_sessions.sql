BEGIN;

CREATE TYPE "VoiceSessionStatus" AS ENUM ('RINGING', 'CLAIMED', 'IN_CALL', 'ENDED');
CREATE TYPE "VoicePresenceStatus" AS ENUM ('IDLE', 'IN_CALL');

CREATE TYPE "CallStatus_new" AS ENUM ('IN_CALL', 'MISSED', 'COMPLETED');

ALTER TABLE "calls"
  ALTER COLUMN "status" TYPE "CallStatus_new"
  USING (
    CASE
      WHEN "status"::text = 'FAILED' THEN 'MISSED'
      WHEN "status"::text = 'IN_PROGRESS' THEN 'IN_CALL'
      ELSE "status"::text
    END
  )::"CallStatus_new";

ALTER TYPE "CallStatus" RENAME TO "CallStatus_old";
ALTER TYPE "CallStatus_new" RENAME TO "CallStatus";
DROP TYPE "CallStatus_old";

ALTER TABLE "calls" DROP CONSTRAINT IF EXISTS "calls_loggedById_fkey";

ALTER TABLE "calls"
  ADD COLUMN "voiceSessionId" TEXT,
  ALTER COLUMN "loggedById" DROP NOT NULL;

ALTER TABLE "users"
  ADD COLUMN "voiceStatus" "VoicePresenceStatus" NOT NULL DEFAULT 'IDLE';

CREATE TABLE "voice_sessions" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "direction" "CallDirection" NOT NULL,
  "rootCallSid" TEXT NOT NULL,
  "bridgedCallSid" TEXT,
  "fromNumber" TEXT NOT NULL,
  "toNumber" TEXT NOT NULL,
  "isUnknownCaller" BOOLEAN NOT NULL DEFAULT false,
  "status" "VoiceSessionStatus" NOT NULL DEFAULT 'RINGING',
  "assignedAgentId" TEXT,
  "claimedAt" TIMESTAMP(3),
  "answeredAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "rawEndReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "voice_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "voice_sessions_rootCallSid_key" ON "voice_sessions"("rootCallSid");
CREATE UNIQUE INDEX "voice_sessions_bridgedCallSid_key" ON "voice_sessions"("bridgedCallSid");
CREATE INDEX "voice_sessions_status_assignedAgentId_idx" ON "voice_sessions"("status", "assignedAgentId");
CREATE INDEX "voice_sessions_candidateId_createdAt_idx" ON "voice_sessions"("candidateId", "createdAt");
CREATE INDEX "voice_sessions_assignedAgentId_status_idx" ON "voice_sessions"("assignedAgentId", "status");
CREATE UNIQUE INDEX "calls_voiceSessionId_key" ON "calls"("voiceSessionId");

ALTER TABLE "calls"
  ADD CONSTRAINT "calls_loggedById_fkey"
  FOREIGN KEY ("loggedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "calls"
  ADD CONSTRAINT "calls_voiceSessionId_fkey"
  FOREIGN KEY ("voiceSessionId") REFERENCES "voice_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "voice_sessions"
  ADD CONSTRAINT "voice_sessions_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voice_sessions"
  ADD CONSTRAINT "voice_sessions_assignedAgentId_fkey"
  FOREIGN KEY ("assignedAgentId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;