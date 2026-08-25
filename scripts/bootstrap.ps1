# CentralIA - bootstrap local (Windows / PowerShell)
# Sobe Postgres + Redis, aplica migrations, roda seed e exibe as URLs.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$api = Join-Path $root 'api'

Write-Host '==> CentralIA bootstrap'

# 1) Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error 'Docker nao encontrado. Instale o Docker Desktop e tente novamente.'
}
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Error 'Docker nao esta rodando. Inicie o Docker Desktop e tente novamente.'
}

# 2) Sobe Postgres + Redis
Write-Host '==> Subindo PostgreSQL + Redis (docker compose)'
docker compose -f (Join-Path $root 'docker-compose.yml') up -d postgres redis

# 3) Aguarda servicos saudaveis
Write-Host '==> Aguardando PostgreSQL...'
for ($i = 0; $i -lt 30; $i++) {
  docker exec centralia-postgres pg_isready -U centralia *> $null
  if ($LASTEXITCODE -eq 0) { Write-Host '    PostgreSQL pronto.'; break }
  Start-Sleep -Seconds 2
  if ($i -eq 29) { Write-Error 'PostgreSQL nao respondeu.' }
}

Write-Host '==> Aguardando Redis...'
for ($i = 0; $i -lt 30; $i++) {
  $pong = docker exec centralia-redis redis-cli ping 2>$null
  if ($pong -eq 'PONG') { Write-Host '    Redis pronto.'; break }
  Start-Sleep -Seconds 2
  if ($i -eq 29) { Write-Error 'Redis nao respondeu.' }
}

# 4) Dependencias + .env
Set-Location $api
if (-not (Test-Path .env)) { Copy-Item .env.example .env; Write-Host '==> .env criado a partir de .env.example' }
if (-not (Test-Path node_modules)) { Write-Host '==> Instalando dependencias...'; npm install }

# 4.1) Valida se DATABASE_URL bate com a porta do docker-compose
$envText = Get-Content .env -Raw
$composePort = (Select-String -Path (Join-Path $root 'docker-compose.yml') -Pattern "'(\d+):5432'").Matches.Groups[1].Value
if ($composePort -and ($envText -notmatch "DATABASE_URL\s*=\s*`"?[^`"]*:$composePort/")) {
  Write-Error "DATABASE_URL no .env nao usa a porta do docker-compose ($composePort). Ajuste DATABASE_URL para localhost:$composePort."
}

# 5) Prisma
Write-Host '==> prisma generate'
npx prisma generate
if ($LASTEXITCODE -ne 0) { Write-Error 'Falha no prisma generate.' }

Write-Host '==> prisma migrate deploy'
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { Write-Error 'Falha ao aplicar migrations (prisma migrate deploy). Verifique DATABASE_URL e o Postgres.' }

# 6) Seed
Write-Host '==> seed'
npm run seed
if ($LASTEXITCODE -ne 0) { Write-Error 'Falha ao rodar o seed (npm run seed).' }

# 7) URLs (so chega aqui se migrations + seed funcionaram)
Write-Host @'

============================================================
 CentralIA pronto! Suba a API com:  cd api; npm run start:dev

 URLs:
   API        http://localhost:3001
   Swagger    http://localhost:3001/api
   Health     http://localhost:3001/health
   Filas      http://localhost:3001/admin/queues

 Demo E2E (sandbox):  npm run demo
 Login seed:          admin@centralia.local / CentralIA@123
============================================================
'@
