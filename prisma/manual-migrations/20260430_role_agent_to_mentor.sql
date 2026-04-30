DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'Role'
      AND e.enumlabel = 'AGENT'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'Role'
      AND e.enumlabel = 'MENTOR'
  ) THEN
    ALTER TYPE "Role" RENAME VALUE 'AGENT' TO 'MENTOR';
  END IF;
END $$;

UPDATE "users"
SET "role" = 'MENTOR'
WHERE "role"::text = 'AGENT';

ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'MENTOR';