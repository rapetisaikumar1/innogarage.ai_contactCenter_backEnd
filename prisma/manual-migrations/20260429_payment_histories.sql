DO $$
BEGIN
  CREATE TYPE "PaymentHistoryStatus" AS ENUM (
    'PAID_ON_TIME',
    'ASKED_FOR_EXTENSION',
    'FULLY_PAID',
    'NOT_RESPONDING',
    'ABSCONDED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "payment_histories" (
  "id" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "placedCompany" TEXT NOT NULL,
  "placedJobTitle" TEXT NOT NULL,
  "status" "PaymentHistoryStatus" NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_histories_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  ALTER TABLE "payment_histories"
  ADD CONSTRAINT "payment_histories_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "payment_histories_createdAt_idx" ON "payment_histories"("createdAt");
CREATE INDEX IF NOT EXISTS "payment_histories_name_idx" ON "payment_histories"("name");
CREATE INDEX IF NOT EXISTS "payment_histories_placedCompany_idx" ON "payment_histories"("placedCompany");
CREATE INDEX IF NOT EXISTS "payment_histories_status_idx" ON "payment_histories"("status");