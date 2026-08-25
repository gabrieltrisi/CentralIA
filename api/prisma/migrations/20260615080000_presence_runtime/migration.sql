-- Sprint 10 — Presença de atendentes (UserPresence)

-- Enum de presença (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PresenceStatus') THEN
    CREATE TYPE "PresenceStatus" AS ENUM ('ONLINE', 'AWAY', 'OFFLINE');
  END IF;
END$$;

-- Tabela de presença (1:1 com User)
CREATE TABLE IF NOT EXISTS "UserPresence" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "companyId"  TEXT NOT NULL,
  "status"     "PresenceStatus" NOT NULL DEFAULT 'OFFLINE',
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserPresence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserPresence_userId_key" ON "UserPresence"("userId");
CREATE INDEX IF NOT EXISTS "UserPresence_companyId_idx" ON "UserPresence"("companyId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserPresence_userId_fkey'
  ) THEN
    ALTER TABLE "UserPresence"
      ADD CONSTRAINT "UserPresence_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;
