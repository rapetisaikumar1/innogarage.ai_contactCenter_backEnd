CREATE TABLE IF NOT EXISTS "bgc_records" (
  "id" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "dob" TIMESTAMP(3),
  "usEmployerName" TEXT,
  "usJobTitle" TEXT,
  "usFromDate" TIMESTAMP(3),
  "usToDate" TIMESTAMP(3),
  "usReference1" TEXT,
  "usReference2" TEXT,
  "usReference3" TEXT,
  "indiaEmployerName" TEXT,
  "indiaJobTitle" TEXT,
  "indiaFromDate" TIMESTAMP(3),
  "indiaToDate" TIMESTAMP(3),
  "indiaReference1" TEXT,
  "indiaReference2" TEXT,
  "indiaReference3" TEXT,
  "resumeFiles" JSONB NOT NULL DEFAULT '[]',
  "usCanadaBgcFiles" JSONB NOT NULL DEFAULT '[]',
  "indiaBgcFiles" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "bgc_records_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  ALTER TABLE "bgc_records"
  ADD CONSTRAINT "bgc_records_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "bgc_records_createdAt_idx" ON "bgc_records"("createdAt");
CREATE INDEX IF NOT EXISTS "bgc_records_fullName_idx" ON "bgc_records"("fullName");