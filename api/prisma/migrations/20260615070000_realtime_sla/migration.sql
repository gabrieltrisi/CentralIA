-- Priority enum
DO $$ BEGIN
  CREATE TYPE "Priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Conversation: realtime + intent
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "intent" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "lastMessageAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Conversation_companyId_lastMessageAt_idx" ON "Conversation"("companyId", "lastMessageAt");

-- ConversationRead
CREATE TABLE IF NOT EXISTS "ConversationRead" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConversationRead_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ConversationRead_conversationId_userId_key" ON "ConversationRead"("conversationId", "userId");
CREATE INDEX IF NOT EXISTS "ConversationRead_userId_idx" ON "ConversationRead"("userId");
ALTER TABLE "ConversationRead"
  ADD CONSTRAINT "ConversationRead_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- HumanQueue SLA
ALTER TABLE "HumanQueue" ADD COLUMN IF NOT EXISTS "priority" "Priority" NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "HumanQueue" ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP(3);
ALTER TABLE "HumanQueue" ADD COLUMN IF NOT EXISTS "firstResponseAt" TIMESTAMP(3);
ALTER TABLE "HumanQueue" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "HumanQueue_dueAt_idx" ON "HumanQueue"("dueAt");
