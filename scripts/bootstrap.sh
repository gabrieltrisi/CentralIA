#!/usr/bin/env bash
# CentralIA — bootstrap local (Linux/macOS/WSL/Git Bash)
# Sobe Postgres + Redis, aplica migrations, roda seed e exibe as URLs.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="$ROOT/api"

echo "==> CentralIA bootstrap"

# 1) Docker
if ! command -v docker >/dev/null 2>&1; then
  echo "ERRO: Docker não encontrado. Instale o Docker Desktop e tente novamente." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "ERRO: Docker não está rodando. Inicie o Docker e tente novamente." >&2
  exit 1
fi

# 2) Sobe Postgres + Redis
echo "==> Subindo PostgreSQL + Redis (docker compose)"
docker compose -f "$ROOT/docker-compose.yml" up -d postgres redis

# 3) Aguarda serviços saudáveis
echo "==> Aguardando PostgreSQL..."
for i in $(seq 1 30); do
  if docker exec centralia-postgres pg_isready -U centralia >/dev/null 2>&1; then
    echo "    PostgreSQL pronto."; break
  fi
  sleep 2
  [ "$i" -eq 30 ] && { echo "ERRO: PostgreSQL não respondeu." >&2; exit 1; }
done

echo "==> Aguardando Redis..."
for i in $(seq 1 30); do
  if [ "$(docker exec centralia-redis redis-cli ping 2>/dev/null)" = "PONG" ]; then
    echo "    Redis pronto."; break
  fi
  sleep 2
  [ "$i" -eq 30 ] && { echo "ERRO: Redis não respondeu." >&2; exit 1; }
done

# 4) Dependências + .env
cd "$API"
[ -f .env ] || { cp .env.example .env; echo "==> .env criado a partir de .env.example"; }
[ -d node_modules ] || { echo "==> Instalando dependências..."; npm install; }

# 4.1) Valida se DATABASE_URL bate com a porta do docker-compose
COMPOSE_PORT="$(grep -oE "'[0-9]+:5432'" "$ROOT/docker-compose.yml" | grep -oE '^[0-9]+' | head -1 || true)"
COMPOSE_PORT="${COMPOSE_PORT#\'}"
if [ -n "$COMPOSE_PORT" ] && ! grep -qE "DATABASE_URL\s*=\s*\"?[^\"]*:${COMPOSE_PORT}/" .env; then
  echo "ERRO: DATABASE_URL no .env não usa a porta do docker-compose (${COMPOSE_PORT}). Ajuste para localhost:${COMPOSE_PORT}." >&2
  exit 1
fi

# 5) Prisma
echo "==> prisma generate"
npx prisma generate || { echo "ERRO: falha no prisma generate." >&2; exit 1; }
echo "==> prisma migrate deploy"
npx prisma migrate deploy || { echo "ERRO: falha ao aplicar migrations. Verifique DATABASE_URL e o Postgres." >&2; exit 1; }

# 6) Seed
echo "==> seed"
npm run seed || { echo "ERRO: falha ao rodar o seed (npm run seed)." >&2; exit 1; }

# 7) URLs (só chega aqui se migrations + seed funcionaram)
cat <<'EOF'

============================================================
 CentralIA pronto! Suba a API com:  cd api && npm run start:dev

 URLs:
   API        http://localhost:3001
   Swagger    http://localhost:3001/api
   Health     http://localhost:3001/health
   Filas      http://localhost:3001/admin/queues

 Demo E2E (sandbox):  npm run demo
 Login seed:          admin@centralia.local / CentralIA@123
============================================================
EOF
