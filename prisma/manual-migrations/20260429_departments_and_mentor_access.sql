CREATE TABLE "departments" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

ALTER TABLE "users"
  ADD COLUMN "departmentId" TEXT,
  ADD COLUMN "canAccessBgc" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canAccessPaymentHistory" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "users_departmentId_idx" ON "users"("departmentId");

ALTER TABLE "users"
  ADD CONSTRAINT "users_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
