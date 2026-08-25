-- Novas roles
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'MANAGER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'FINANCIAL';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPPORT';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'COMMERCIAL';

-- Tenant isolation
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "assignedUserId" TEXT;
ALTER TABLE "KnowledgeArticle" ADD COLUMN IF NOT EXISTS "companyId" TEXT;

CREATE INDEX IF NOT EXISTS "KnowledgeArticle_companyId_idx" ON "KnowledgeArticle"("companyId");

-- Backfill best-effort a partir do cliente
UPDATE "Conversation" c SET "companyId" = cu."companyId"
  FROM "Customer" cu WHERE c."customerId" = cu."id" AND c."companyId" IS NULL;
UPDATE "Ticket" t SET "companyId" = cu."companyId"
  FROM "Customer" cu WHERE t."customerId" = cu."id" AND t."companyId" IS NULL;
