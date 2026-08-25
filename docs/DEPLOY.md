# Deploy 1.0 — CentralIA (Vercel + Render + Neon + Upstash)

Arquitetura de apresentação ao cliente:

| Componente | Serviço | Pasta |
|---|---|---|
| Frontend (Next.js) | **Vercel** | `web/` |
| Backend (NestJS) | **Render** (Web Service) | `api/` |
| PostgreSQL | **Neon** | — |
| Redis | **Upstash** | — |
| Repositório | **GitHub** | raiz |

> **Nunca** commite `.env` / segredos. Eles entram apenas nos painéis de Render/Vercel.
> Mantenha `APP_MODE=sandbox` e `PILOT_MODE=true` para a apresentação controlada.

---

## Ordem recomendada
1. Criar **Neon** (PostgreSQL) → pegar `DATABASE_URL`.
2. Criar **Upstash** (Redis) → pegar `REDIS_URL`.
3. Criar **Render** (API) com as variáveis → roda `prisma migrate deploy` no build.
4. Rodar **seed** (manual, opcional): `npm run seed:prod` no Shell do Render.
5. Criar **Vercel** (Web) apontando para `web/` com `NEXT_PUBLIC_API_URL`.
6. Testar `GET /health` da API.
7. **Login** → **Dashboard** → **Piloto**.

---

## GitHub
1. Crie um repositório vazio no GitHub.
2. Na raiz do projeto:
   ```bash
   git init
   git add .
   git commit -m "chore: prepare CentralIA deploy for Vercel and Render"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/centralia.git
   git push -u origin main
   ```
   O `.gitignore` da raiz já exclui `.env`, `node_modules`, `.next`, `dist`, `storage/`, logs e `_sprint*`.

## Neon (PostgreSQL)
1. https://neon.tech → **New Project** (região `sa-east-1` / São Paulo).
2. Copie a **connection string** (com `?sslmode=require`):
   `postgresql://USER:PASS@ep-xxx.sa-east-1.aws.neon.tech/centralia?sslmode=require`
3. Esse valor será o `DATABASE_URL` no Render.

## Upstash (Redis)
1. https://upstash.com → **Create Database** (TLS habilitado, região próxima).
2. Copie a **`REDIS_URL`** no formato `rediss://default:SENHA@HOST:PORT`.
3. A app **prioriza `REDIS_URL`** (TLS detectado automaticamente); BullMQ e o client geral usam a mesma conexão.

## Render (API — `api/`)
Há um **`render.yaml`** na raiz (Blueprint). Ou configure manualmente um **Web Service**:
- **Root Directory:** `api`
- **Runtime:** Node
- **Build Command:** `npm install --include=dev && npx prisma generate && npm run build && npx prisma migrate deploy`
- **Start Command:** `npm run start:prod`
- **Health Check Path:** `/health`
- A app usa **`process.env.PORT`** (Render injeta) e escuta em `0.0.0.0`.

**Variáveis no Render** (Environment):
- Não-secretas (já no `render.yaml`): `NODE_ENV=production`, `APP_MODE=sandbox`, `PILOT_MODE=true`,
  `PILOT_ALLOWED_PHONES=5571991674248`, `ISPBOX_ENABLED=false`, `STORAGE_DRIVER=local`,
  `META_WEBHOOK_SIGNATURE_BYPASS=false`, `DEFAULT_COMPANY_NAME=CentralIA`.
- Secretas (definir no painel — `sync: false`):
  `FRONTEND_URL` (URL da Vercel), `DATABASE_URL` (Neon), `REDIS_URL` (Upstash),
  `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ATTACHMENT_SIGNING_SECRET`,
  `ANTHROPIC_API_KEY`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_PHONE_NUMBER_ID`, `META_ACCESS_TOKEN`,
  `BULL_BOARD_USER`, `BULL_BOARD_PASSWORD` (protegem `/admin/queues` em produção).

> Gere segredos: `openssl rand -base64 48`.

### Migrations / Seed
- `prisma migrate deploy` roda no **build** (idempotente).
- **Seed** é manual e opcional — no **Shell** do Render: `npm run seed:prod`
  (aplica migrations + cria a empresa padrão, usuários e a base de conhecimento/planos).

## Vercel (Web — `web/`)
1. https://vercel.com → **Add New Project** → importe o repositório.
2. **Root Directory:** `web`
3. **Framework:** Next.js · **Build Command:** `npm run build` · **Output:** `.next` (padrão).
4. **Environment Variables:**
   - `NEXT_PUBLIC_API_URL = https://SUA-API.onrender.com`
   - `NEXT_PUBLIC_APP_URL = https://SEU-FRONTEND.vercel.app`
5. Após o deploy, copie a URL da Vercel e defina-a como **`FRONTEND_URL`** no Render (CORS + Socket.IO).

## CORS
A API aceita **`FRONTEND_URL`** + `CORS_ORIGINS` (lista local). Nunca use `*` em produção.
Defina `FRONTEND_URL` no Render = URL da Vercel para liberar o painel e o tempo real (Socket.IO).

---

## Checklist de validação (pós-deploy)
1. `GET https://SUA-API.onrender.com/health` → `{ status: "ok" }`.
2. Abrir o frontend da Vercel → **Login** (`admin@centralia.local` / senha do seed).
3. **Dashboard** carrega métricas.
4. **Conversas / Human Queue / Knowledge** abrem sem erro.
5. (Opcional) `/admin/queues` na API — protegido por `BULL_BOARD_USER/PASSWORD` em produção.
6. **Piloto:** `PILOT_MODE=true` + `PILOT_ALLOWED_PHONES=5571991674248` — apenas o telefone autorizado é processado.

## Notas
- `APP_MODE=sandbox`: nenhuma escrita real em Meta/ISPBOX (tudo simulado) — seguro para apresentação.
- `STORAGE_DRIVER=local` no Render: o disco é efêmero (anexos não persistem entre deploys). Para
  persistência real, configure `STORAGE_DRIVER=s3` + credenciais S3.
- Render Free "dorme" após inatividade (cold start no primeiro acesso).
