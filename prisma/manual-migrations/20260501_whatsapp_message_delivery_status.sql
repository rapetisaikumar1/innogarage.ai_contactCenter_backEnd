ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "deliveryStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryStatusUpdatedAt" TIMESTAMP(3);

UPDATE "messages"
SET
  "deliveryStatus" = 'SENT',
  "deliveryStatusUpdatedAt" = COALESCE("deliveryStatusUpdatedAt", "createdAt")
WHERE "direction" = 'OUTBOUND'
  AND "channel" = 'WHATSAPP'
  AND "deliveryStatus" IS NULL;