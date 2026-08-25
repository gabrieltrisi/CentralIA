<h1 align="center">🤖 CentralIA</h1>

<p align="center"><strong>Atendimento omnichannel com IA para provedores de internet (ISP).</strong><br/>Classifica a intenção da conversa, responde com IA e <strong>escala para um humano</strong> quando necessário.</p>

<p align="center">
  <a href="https://central-ia-lac.vercel.app/login"><img src="https://img.shields.io/badge/demo-ao%20vivo-2ea44f?style=for-the-badge&logo=vercel&logoColor=white" alt="Demo ao vivo" /></a>
  <img src="https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" />
  <img src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white" />
  <img src="https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/Redis%20%2F%20BullMQ-DC382D?style=for-the-badge&logo=redis&logoColor=white" />
  <img src="https://img.shields.io/badge/WhatsApp%20Cloud%20API-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" />
  <img src="https://img.shields.io/badge/IA%20Claude-D97757?style=for-the-badge&logo=anthropic&logoColor=white" />
</p>

<p align="center">🔗 <strong>Ao vivo:</strong> https://central-ia-lac.vercel.app/login</p>

---


Plataforma de atendimento omnichannel para provedores de internet (ISP), com IA.

- **Backend** (`api/`) — NestJS 11 + Prisma (PostgreSQL) + Redis/BullMQ
- **Painel** (`web/`) — Next.js 14 (App Router)
- **Integrações** — ISPBOX V2, WhatsApp Cloud API (Meta) e IA (Claude/Anthropic)

## Fluxo de atendimento (MVP)

```
WhatsApp (Meta) ─► webhook ─► fila whatsapp-inbound
   └► Conversation + Message(CUSTOMER)
       └► Supervisor IA (classifica intenção + confiança)
           ├─ confiança < 0.7 ou HUMAN ─► HumanQueue (+ resumo)
           └─ COMMERCIAL / SUPPORT / FINANCIAL ─► Agente
                 └► resposta ─► fila whatsapp-outbound ─► Meta
```

## Arquitetura de módulos (backend)

```
api/src/
├── common/
│   ├── company/            # tenant padrão (companyId)
│   └── integration-log/    # IntegrationLog estruturado
├── queue/                  # BullMQ: filas, scheduler (cron), DLQ, bull-board
├── jobs/                   # processors (workers) das filas
└── modules/
    ├── ispbox/             # ISPBOX V2 oficial (OAuth + refresh + HTTP Bearer + filtro de erros)
    ├── conversations/      # conversas e mensagens
    ├── customers/          # clientes + serviços (espelho ISPBOX)
    ├── tickets/            # tickets + work orders (OS ISPBOX)
    ├── ai/                 # supervisor + agentes (comercial/suporte/financeiro) + cobertura
    ├── human-queue/        # escalonamento humano + gerador de resumo
    └── meta-whatsapp/      # webhook + envio WhatsApp Cloud API
```

## Início rápido (bootstrap em < 10 min)

Pré-requisitos: **Node.js 20+** e **Docker** rodando.

```bash
# Linux/macOS/WSL/Git Bash
npm run bootstrap

# Windows (PowerShell)
npm run bootstrap:win
```

O bootstrap: verifica o Docker → sobe PostgreSQL + Redis → aguarda ficarem
saudáveis → `prisma generate` → `prisma migrate deploy` → `seed` → exibe as URLs.

Depois:

```bash
cd api && npm run start:dev   # sobe a API
npm run demo                  # (na raiz) demo simples (Financeiro) em sandbox
npm run demo:all              # (na raiz) demo completo: Comercial + Suporte + Financeiro
```

### Demo simples × Demo completo

| Comando | O que faz |
|---------|-----------|
| `npm run demo` | Executa **um** fluxo (Financeiro) ponta a ponta em sandbox — ideal para um smoke test rápido. |
| `npm run demo:all` | Executa os **três** fluxos (Comercial, Suporte, Financeiro), imprimindo etapa, mensagem do cliente, resposta da IA, **estado da FSM**, chamadas ISPBOX mockadas, ticket/OS e handoff humano, além do resumo final de cada atendimento. |

Ambos rodam com `APP_MODE=sandbox` e **não dependem de `ANTHROPIC_API_KEY`** (a
classificação e as respostas usam fallback determinístico quando a IA não está
configurada). Nenhuma chamada real à Meta ou à ISPBOX é feita, e nenhuma OS real
é aberta.

URLs locais:

| Serviço | URL |
|---------|-----|
| API | http://localhost:3001 |
| Swagger | http://localhost:3001/api |
| Health | http://localhost:3001/health |
| Filas (Bull Board) | http://localhost:3001/admin/queues |

Usuários do seed (senha `CentralIA@123`): `admin@`, `manager@`, `support@`,
`financial@`, `commercial@` `centralia.local`. Faça login em `POST /auth/login`
e use o `accessToken` como `Authorization: Bearer <token>`.

## Modos de execução

- `APP_MODE=sandbox` — **não** executa efeitos externos reais: ISPBOX é mockada
  (não abre OS, não altera dados) e o WhatsApp não envia mensagens reais; apenas
  logs simulados são gravados. Ideal para demonstração/validação local.
- `APP_MODE=live` — integrações reais (requer credenciais).
- `USE_FSM=true` — liga a **máquina de estado persistente** com coleta
  estruturada (`ConversationState` + `collectedData`): extrai e valida dados por
  etapa (CEP, CPF, e-mail, telefone, nome), **não repete perguntas já
  respondidas**, consulta planos na base de conhecimento e abre OS/handoff
  conforme o fluxo. Com `false` (padrão), mantém o fluxo anterior por prompt.
  Extrações/validações são determinísticas (sem IA).

## WhatsApp real, mídia e segurança

- **Webhook assinado**: `POST /meta-whatsapp/webhook` valida o header
  `x-hub-signature-256` (HMAC-SHA256 com `META_APP_SECRET`) e rejeita inválidos
  com **401**. Em sandbox, `META_WEBHOOK_SIGNATURE_BYPASS=true` permite pular.
- **Inbound completo**: texto, imagem, documento, vídeo, áudio e respostas
  interativas (botão/lista) — normalizados por `MetaWhatsappMessageParser`.
- **Mídia**: baixada (ou simulada em sandbox), validada (tamanho/MIME, bloqueio
  de executáveis, nome UUID) e salva via `StorageProvider`
  (`MockStorageProvider` em sandbox, `LocalStorageProvider` caso contrário),
  gerando `Attachment`.
- **Comercial** exige RG/CNH + CPF + comprovante (classificados por legenda);
  **Suporte** anexa o vídeo dos LEDs ao ticket antes de abrir a OS (mock em
  sandbox).
- **Outbound** (`MetaWhatsappSenderService`): em sandbox nunca envia à Meta —
  registra em `IntegrationLog` e no log JSON.
- **/admin/queues** exige basic auth (`BULL_BOARD_USER`/`BULL_BOARD_PASSWORD`);
  em produção sem credenciais, o dashboard não é montado.

## Autenticação, RBAC e multi-tenant

- **JWT** (`/auth/login`, `/auth/me`, `/auth/refresh`, `/auth/logout`). Guards
  globais: `JwtAuthGuard` (rotas `@Public()` para webhook/health/login) +
  `RolesGuard` (`@Roles(...)`).
- **Roles**: `ADMIN` (tudo), `MANAGER` (dashboard/conversas/tickets/fila/anexos/auditoria),
  `AGENT`, `FINANCIAL`, `SUPPORT`, `COMMERCIAL`.
- **Tenant isolation**: toda consulta interna respeita `companyId`
  (conversations, tickets, customers, human-queue, knowledge, audit-log,
  attachments). O usuário só acessa dados da própria empresa.
- **Anexos**: `GET /attachments/:id` e `/download` aceitam **JWT (mesma empresa)
  OU share-link** (`?token=`); downloads geram `AuditLog` (`actorType` `user` ou
  `public_link`). `POST /attachments/:id/share-link` exige usuário autenticado.
- **/admin/queues**: basic auth **ou** JWT de `ADMIN`; em produção sem
  credenciais, não é montado.
- **Auditoria consultável**: `GET /audit-logs` (ADMIN/MANAGER) com filtros
  `action`, `entityType`, `entityId`, `actorType`, `startDate`, `endDate`,
  `page`, `limit`.
- **Operação**: `PATCH /conversations/:id/{assign,close,reopen}` e
  `PATCH /human-queue/:id/{assign,resolve,reopen}` (auditados, com guarda de
  empresa).

## Produção controlada (idempotência, anexos seguros, auditoria)

- **Idempotência**: `Message.externalId` (id da Meta) é único; reenvios do
  webhook não criam conversa/ticket/OS/mensagem duplicada (`duplicate_webhook_ignored`).
- **Anexos seguros**: `GET /attachments/:id` (metadados) e
  `GET /attachments/:id/download` exigem **share-link** assinado (HMAC, 15 min,
  validado por `companyId`); `POST /attachments/:id/share-link` é operação
  interna (`x-internal-key`). Nunca expõe `file://`.
- **Magic bytes**: a mídia é validada pela assinatura binária (JPEG/PNG/PDF/MP4);
  divergência → `MEDIA_REJECTED`.
- **Storage**: `STORAGE_DRIVER=local|mock|s3`. `local` em produção exige
  `ALLOW_LOCAL_STORAGE_IN_PRODUCTION=true`; produção real usa `s3`.
- **Outbound rico**: comercial envia botões (Fibra/Móvel, Sim/Atendente);
  financeiro envia resumo + boleto (documento) + PIX. Em sandbox, só
  `IntegrationLog` (nunca Meta real).
- **Rate limit**: `@nestjs/throttler` (`THROTTLE_TTL`/`THROTTLE_LIMIT`).
- **Auditoria** (`AuditLog`): acesso a anexo, share-link, download, handoff,
  envio outbound real, webhook duplicado e mídia rejeitada.

## Subindo a infraestrutura manualmente

```bash
docker compose up -d        # PostgreSQL + Redis
```

## Backend

```bash
cd api
cp .env.example .env        # preencha as credenciais (NÃO commitar .env)
npm install
npm run prisma:generate
npm run prisma:deploy       # aplica as migrations (requer DB no ar)
npm run start:dev           # http://localhost:3001
```

- Swagger: `http://localhost:3001/api`
- Dashboard das filas (Bull Board): `http://localhost:3001/admin/queues`

### Testes

```bash
npm test                    # unitários (agentes/supervisor) + integração ISPBOX
```

### Variáveis de ambiente (resumo)

| Grupo    | Variáveis |
|----------|-----------|
| App      | `PORT`, `CORS_ORIGINS`, `FRONTEND_URL`, `APP_MODE`, `USE_FSM`, `DEFAULT_COMPANY_NAME` |
| Postgres | `DATABASE_URL` |
| Redis    | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` |
| ISPBOX   | `ISPBOX_BASE_URL`, `ISPBOX_CLIENT_ID`, `ISPBOX_CLIENT_SECRET`, `ISPBOX_SCOPES`, `ISPBOX_REQUEST_ID`, `ISPBOX_DEFAULT_OS_TYPE` |
| IA       | `ANTHROPIC_API_KEY`, `AI_MODEL`, `AI_CONFIDENCE_THRESHOLD` |
| Meta     | `META_VERIFY_TOKEN`, `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`, `META_GRAPH_VERSION`, `META_APP_SECRET` |
| Auth     | `JWT_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL` |
| Storage  | `STORAGE_DRIVER` (`local`/`mock`/`s3`), `STORAGE_DIR`, `ALLOW_LOCAL_STORAGE_IN_PRODUCTION`, `S3_*` |
| Anexos   | `ATTACHMENT_SIGNING_SECRET`, `ATTACHMENT_SHARE_TTL` |
| Rate lim | `THROTTLE_TTL`, `THROTTLE_LIMIT` |
| Tempo real | `REALTIME_CONN_WINDOW_MS`, `REALTIME_CONN_MAX`, `REALTIME_AUDIT_CONNECTIONS`, `REALTIME_AWAY_AFTER_MIN` |
| Bull Board | `BULL_BOARD_USER`, `BULL_BOARD_PASSWORD` |
| Piloto   | `PILOT_MODE`, `PILOT_ALLOWED_PHONES`, `PILOT_CUSTOMER_QUERY`, `PILOT_ALLOW_PAYMENT_TEST`, `PILOT_ALLOW_META_SEND`, `PILOT_TEST_PHONE`, `PILOT_FORCE_SANDBOX_SEND` |

> ⚠️ **Credenciais nunca são commitadas.** `.env` está no `.gitignore`; use `.env.example`.

## ISPBOX V2 — endpoints internos (rotas oficiais)

Prefixo `/ispbox` (encapsulam `ISPBOX_BASE_URL` + `/api/v2/...`):

| Método | Rota interna |
|--------|--------------|
| GET   | `/ispbox/clientes` |
| GET   | `/ispbox/clientes/:clientesId` |
| GET   | `/ispbox/clientes/:clientesId/servicos` |
| GET   | `/ispbox/clientes/:clientesId/servicos/:servicosId` |
| GET   | `/ispbox/clientes/:clientesId/servicos/:servicosId/internet/status` |
| POST  | `/ispbox/clientes/:clientesId/servicos/:servicosId/internet/desconectar/:desconectarId` |
| PATCH | `/ispbox/clientes/:clientesId/servicos/:servicosId/desbloqueio-temporario` |
| GET   | `/ispbox/clientes/:clientesId/servicos/:servicosId/cobrancas` |
| GET   | `/ispbox/clientes/:clientesId/servicos/:servicosId/cobrancas/:cobrancasId` |
| GET   | `/ispbox/clientes/:clientesId/servicos/:servicosId/cobrancas/:cobrancasId/pagamento/pdf` |
| POST  | `/ispbox/clientes/:clientesId/servicos/:servicosId/cobrancas/:cobrancasId/pagamento/qrcode/gerar` |
| GET   | `/ispbox/ordens-servicos` |
| POST  | `/ispbox/ordens-servicos` |
| GET   | `/ispbox/ordens-servicos/tipos` |
| GET   | `/ispbox/ordens-servicos/:ordensServicosId` |
| POST  | `/ispbox/ordens-servicos/:ordensServicosId/anotacoes` |

Rotas centralizadas em [`api/src/modules/ispbox/ispbox.endpoints.ts`](api/src/modules/ispbox/ispbox.endpoints.ts).

## Filas (BullMQ)

| Fila | Função |
|------|--------|
| `ispbox-sync` | jobs agendados (clientes/serviços/cobranças/OS) |
| `whatsapp-inbound` | pipeline de entrada (conversa → supervisor → agente) |
| `whatsapp-outbound` | envio de mensagens |
| `ai-processing` | tarefas de IA assíncronas |
| `ticket-processing` | abertura de OS na ISPBOX |
| `dead-letter` | jobs que esgotaram retentativas |

Agendamentos (cron): clientes 30min · serviços 15min · cobranças 15min · OS 5min.

## Painel (web)

Painel operacional Next.js 14 com **login JWT**, RBAC e telas consumindo a API.

```bash
cd web
cp .env.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:3001
npm install
npm run dev                  # http://localhost:3000  → redireciona para /login
```

Login demo: `admin@centralia.local` / `CentralIA@123` (ou manager/support/
financial/commercial). Telas: Dashboard, Conversas (workspace de 3 colunas com
chat, envio manual do atendente, painel do cliente/ticket/FSM), Tickets, Fila
Humana (com atribuição a outro atendente e abertura da conversa), Clientes,
Auditoria (ADMIN/MANAGER) e Configurações. Identidade visual **ChipNews**. O
token fica no navegador e é enviado como `Authorization: Bearer`
automaticamente (refresh em 401 e redirect para `/login` quando a sessão
expira). Em `APP_MODE=sandbox`, mensagens/anexos enviados pelo atendente aparecem com
a tag **“simulado”** (não vão à Meta real). O painel atualiza em **tempo real** via
**cliente Socket.IO** (`useRealtimeEvents()` em `web/src/lib/realtime`) conectado a
`/realtime` com JWT, reconexão automática e dedupe por `messageId`/`ticketId`;
o **polling** continua como **fallback** (com backpressure: pausa em aba inativa e
usa intervalo longo quando o socket está saudável). Mostra **presença** dos
atendentes (online/away/offline no Header e no seletor de atribuição), **não lidas**,
**miniatura inline** de imagem, **upload com barra de progresso e cancelar**,
**baixar anexos** por share-link, **paginação server-side** nas listas, **Dashboard
com métricas reais** (`/stats/overview` + `/stats/sla`) e a Fila Humana com **SLA**
(no prazo/vencendo/atrasado), **tempo de 1ª resposta** e filtros por prioridade.

## Produção — checklist e deploy

**Checklist de produção (piloto com cliente):**

- [ ] `APP_MODE=production` (ou `sandbox` para piloto seguro sem Meta/ISPBOX real).
- [ ] `DATABASE_URL` apontando para Postgres gerenciado; `npm run prisma:deploy`.
- [ ] `REDIS_*` para Redis gerenciado (filas + BullMQ).
- [ ] `JWT_SECRET` forte e único; `JWT_ACCESS_TTL`/`JWT_REFRESH_TTL` revisados.
- [ ] `FRONTEND_URL` = URL do painel (restringe CORS HTTP **e** o handshake Socket.IO).
- [ ] `ATTACHMENT_SIGNING_SECRET` forte; `STORAGE_DRIVER=s3` + `S3_*` (não usar `local` em produção sem `ALLOW_LOCAL_STORAGE_IN_PRODUCTION`).
- [ ] `META_APP_SECRET` definido (validação de assinatura do webhook); `META_*` completos.
- [ ] `BULL_BOARD_USER`/`BULL_BOARD_PASSWORD` definidos (dashboard de filas protegido).
- [ ] `REALTIME_AUDIT_CONNECTIONS=true` se quiser auditar conexões do socket.
- [ ] `THROTTLE_*` e `REALTIME_CONN_*` ajustados ao volume esperado.
- [ ] `ANTHROPIC_API_KEY` é **opcional** — sem ela, a IA usa fallback determinístico (keyword + FSM).

**Sandbox × Production:**

- `APP_MODE=sandbox`: nada externo é executado — `MockIspboxService`, storage mock,
  WhatsApp simulado (tag “simulado”), webhook pode pular assinatura. Ideal para demo/piloto.
- `APP_MODE=production`: efeitos reais. Exige `META_*` (com `META_APP_SECRET`),
  `ISPBOX_*` e storage real (`s3`).

**Configurar Meta (WhatsApp Cloud API):** defina `META_VERIFY_TOKEN` (verificação do
webhook), `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`, `META_GRAPH_VERSION` e
`META_APP_SECRET` (assinatura HMAC). Aponte o webhook do app para
`POST /meta-whatsapp/webhook` e a verificação para `GET /meta-whatsapp/webhook`.

**Configurar ISPBOX:** `ISPBOX_BASE_URL`, `ISPBOX_CLIENT_ID`, `ISPBOX_CLIENT_SECRET`,
`ISPBOX_SCOPES`, `ISPBOX_REQUEST_ID` e `ISPBOX_DEFAULT_OS_TYPE` (tipo de OS padrão).

**Configurar storage:** `STORAGE_DRIVER=s3` com `S3_ENDPOINT`, `S3_REGION`,
`S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` e `S3_PUBLIC_BASE_URL`.
Anexos nunca expõem caminho `file://`; o download é sempre por **share-link HMAC**
(`ATTACHMENT_SIGNING_SECRET`, TTL `ATTACHMENT_SHARE_TTL`).

**Smoke test (runtime, sem Playwright):**

```bash
cd api
API_URL=http://localhost:3001 \
SMOKE_EMAIL=admin@centralia.local SMOKE_PASSWORD=CentralIA@123 \
npm run smoke
```

Valida: `health` → `login` → `stats/overview` + `stats/sla` → `conversations`
(paginado) → `human-queue` (paginado+SLA) → `presence` + `heartbeat` → **envio
sandbox** (`POST /conversations/:id/messages`) + `read`. Sai com código ≠ 0 em falha.

**Ordem recomendada de deploy:**

1. Provisionar Postgres + Redis; definir o `.env` (checklist acima).
2. `cd api && npm ci && npm run prisma:deploy && npm run build`.
3. Seed inicial (`prisma db seed`) ou criar empresa/usuários reais.
4. Subir a API (`npm run start:prod`); validar `GET /health` e `npm run smoke`.
5. `cd web && npm ci && npm run build && npm run start` com `NEXT_PUBLIC_API_URL` apontando para a API.
6. Configurar o webhook da Meta e validar uma conversa ponta a ponta.

## Piloto Real Controlado (Sprint 11)

Validação segura em ambiente vivo — começando em **sandbox** e com **PILOT_MODE**.
Guia completo em [docs/PILOTO_REAL.md](docs/PILOTO_REAL.md).

```bash
cd api
npm run pilot:check                                   # prontidão do ambiente (não destrutivo)
PILOT_CUSTOMER_QUERY="5511999998888" \
  npm run pilot:ispbox-readonly                       # ISPBOX só leitura (NUNCA abre OS)
PILOT_ALLOW_META_SEND=true PILOT_TEST_PHONE="5511999998888" \
  npm run pilot:meta-send-test                        # envio Meta de teste (com flags)
```

- **PILOT_MODE** (`PILOT_ALLOWED_PHONES`): só processa telefones permitidos; os
  demais salvam `WebhookEvent`, **não respondem** e **não acionam o FSM** (audit
  `pilot.phone_not_allowed`).
- **Diagnóstico**: `GET /meta-whatsapp/diagnostics` (ADMIN) e a tela
  **`/settings/diagnostics`** (ADMIN/MANAGER) — só **booleanos**, **nunca segredos**.
- **Guardas**: ISPBOX readonly nunca abre OS; envio à Meta exige
  `PILOT_ALLOW_META_SEND=true` e é bloqueado em sandbox (salvo
  `PILOT_FORCE_SANDBOX_SEND=true`, que apenas simula).
- **Ordem de operação**: subir API/Web → migrations → seed → `pilot:check` →
  `/settings/diagnostics` → webhook Meta → `pilot:ispbox-readonly` → ligar
  `PILOT_MODE` → `pilot:meta-send-test` → acompanhar Conversas/Fila Humana → só
  então `production` sem `PILOT_MODE`.
