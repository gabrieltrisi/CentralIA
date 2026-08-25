-- CreateEnum
CREATE TYPE "ConversationStateValue" AS ENUM (
  'START',
  'COMMERCIAL_SERVICE_SELECTION',
  'COMMERCIAL_CEP',
  'COMMERCIAL_DATA_COLLECTION',
  'COMMERCIAL_DOCUMENT_UPLOAD',
  'COMMERCIAL_SUMMARY',
  'SUPPORT_IDENTIFICATION',
  'SUPPORT_DIAGNOSIS',
  'SUPPORT_OS_CREATION',
  'FINANCIAL_IDENTIFICATION',
  'FINANCIAL_BILLING',
  'HUMAN_HANDOFF',
  'FINISHED'
);

-- CreateTable
CREATE TABLE "ConversationState" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "state" "ConversationStateValue" NOT NULL DEFAULT 'START',
  "data" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ConversationState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConversationState_conversationId_key" ON "ConversationState"("conversationId");

-- AddForeignKey
ALTER TABLE "ConversationState"
  ADD CONSTRAINT "ConversationState_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
