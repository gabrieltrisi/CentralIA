-- AlterTable: metadados de mídia nos anexos
ALTER TABLE "Attachment"
  ADD COLUMN IF NOT EXISTS "messageId" TEXT,
  ADD COLUMN IF NOT EXISTS "mimeType" TEXT,
  ADD COLUMN IF NOT EXISTS "filename" TEXT,
  ADD COLUMN IF NOT EXISTS "sizeBytes" INTEGER,
  ADD COLUMN IF NOT EXISTS "provider" TEXT,
  ADD COLUMN IF NOT EXISTS "providerMediaId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Attachment_messageId_idx" ON "Attachment"("messageId");
