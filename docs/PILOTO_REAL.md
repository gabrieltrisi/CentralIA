# CentralIA — Piloto Real Controlado

Guia para a primeira validação da CentralIA em ambiente vivo (Postgres, Redis,
ISPBOX real, Meta WhatsApp real e painel web), de forma **segura e controlada**.

> Princípios: começar em **sandbox**, ligar **PILOT_MODE** com telefones
> permitidos, validar leitura da ISPBOX **sem abrir OS**, enviar WhatsApp de teste
> **apenas com flag explícita**, e só então passar para **production**.

---

## 1. Checklist de ambiente real

- [ ] Docker ativo **ou** ambiente cloud pronto (Postgres + Redis gerenciados)
- [ ] Postgres criado e acessível (`DATABASE_URL`)
- [ ] Redis criado e acessível (`REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`)
- [ ] Migrations aplicadas (`npm run prisma:deploy`)
- [ ] Seed executado (usuário ADMIN existe)
- [ ] API rodando (`npm run start:prod`) — `GET /health` responde
- [ ] Web rodando (`npm run build && npm run start`), `NEXT_PUBLIC_API_URL` apontando para a API
- [ ] Webhook da Meta configurado (`GET/POST /meta-whatsapp/webhook`, `META_VERIFY_TOKEN`, `META_APP_SECRET`)
- [ ] Credenciais ISPBOX configuradas (`ISPBOX_BASE_URL`/`ISPBOX_CLIENT_ID`/`ISPBOX_CLIENT_SECRET`)
- [ ] `STORAGE_DRIVER` configurado (`s3` em produção; `mock`/`local` em sandbox)
- [ ] `APP_MODE=sandbox` **inicialmente**
- [ ] `APP_MODE=production` **somente após** validação completa

---

## 2. Variáveis do piloto

| Variável | Função |
|----------|--------|
| `PILOT_MODE` | `true` liga o piloto: só processa telefones permitidos |
| `PILOT_ALLOWED_PHONES` | Lista separada por vírgula (apenas dígitos) dos telefones liberados |
| `PILOT_CUSTOMER_QUERY` | Cliente usado no readonly da ISPBOX (telefone ou CPF/CNPJ) |
| `PILOT_ALLOW_PAYMENT_TEST` | `true` permite gerar PDF/QRCode no readonly (nunca abre OS) |
| `PILOT_ALLOW_META_SEND` | `true` habilita o teste de envio à Meta |
| `PILOT_TEST_PHONE` | Telefone de destino do teste de envio |
| `PILOT_FORCE_SANDBOX_SEND` | `true` permite o teste em sandbox (apenas **simula**) |

> 🔒 Nenhum segredo é exposto pela API. O diagnóstico (`/meta-whatsapp/diagnostics`
> e `/settings/diagnostics`) mostra **apenas booleanos** de configuração.

---

## 3. Scripts de piloto

```bash
cd api

# Prontidão do ambiente (não destrutivo) — registra AuditLog pilot.check
API_URL=http://localhost:3001 npm run pilot:check

# Leitura controlada da ISPBOX — NUNCA abre OS
PILOT_CUSTOMER_QUERY="5511999998888" npm run pilot:ispbox-readonly

# Envio de teste à Meta — só com as flags
PILOT_ALLOW_META_SEND=true PILOT_TEST_PHONE="5511999998888" npm run pilot:meta-send-test

# Smoke HTTP completo
npm run smoke
```

O que cada um valida:

- **pilot:check** — `DATABASE_URL`, Postgres, migrations, seed admin, Redis,
  filas BullMQ, storage (round-trip), token ISPBOX (fora do sandbox), envs Meta,
  `GET /health`, login admin, `GET /stats/overview`, handshake Socket.IO (JWT) e
  smoke HTTP. Não executa ações destrutivas.
- **pilot:ispbox-readonly** — autentica e **lê** cliente/serviços/status de
  internet/cobranças. Gera PDF/QRCode só com `PILOT_ALLOW_PAYMENT_TEST=true`.
  **Jamais** chama `createWorkOrder` (não abre OS).
- **pilot:meta-send-test** — bloqueado sem `PILOT_ALLOW_META_SEND`, sem
  `PILOT_TEST_PHONE`, e em sandbox (salvo `PILOT_FORCE_SANDBOX_SEND`, que apenas
  simula). Registra IntegrationLog + AuditLog.

---

## 4. Tela de diagnóstico (painel)

`/settings/diagnostics` (ADMIN/MANAGER): mostra Health, Meta, ISPBOX, Redis,
Database, Filas, Storage, Tempo real, `APP_MODE` e `PILOT_MODE`. Botões: **Rodar
health**, **Rodar stats**, **Copiar checklist**, **Abrir Swagger**, **Abrir filas**.

---

## 5. Ordem exata de operação

1. Subir **API** e **Web**.
2. Rodar **migrations** (`npm run prisma:deploy`).
3. Rodar **seed**.
4. Rodar **`npm run pilot:check`**.
5. Validar **`/settings/diagnostics`** no painel.
6. Configurar o **webhook da Meta**.
7. Rodar **`npm run pilot:ispbox-readonly`** (sem abrir OS).
8. Ativar **`PILOT_MODE=true`** com **`PILOT_ALLOWED_PHONES`** (telefone do piloto).
9. Enviar **WhatsApp de teste** (`npm run pilot:meta-send-test`).
10. Acompanhar **Conversas** e **Fila Humana** no painel.
11. Só depois ativar **`APP_MODE=production`** e desligar **`PILOT_MODE`**.

---

## 6. Auditoria do piloto

Ações registradas em `AuditLog` (consulte em `/audit-logs`):

`pilot.check` · `pilot.ispbox_readonly` · `pilot.meta_send_test` ·
`pilot.phone_not_allowed` · `pilot.started` · `pilot.finished`

> `pilot.phone_not_allowed` é registrado quando, em `PILOT_MODE`, chega uma
> mensagem de telefone fora da allowlist — o evento bruto é salvo
> (`WebhookEvent`), mas **não há resposta nem acionamento do FSM**.

---

## 7. Pendências para go-live

- Executar a sequência completa contra infra real (não havia Docker/infra no
  ambiente de desenvolvimento).
- Marcar `pilot.started` / `pilot.finished` na abertura/fechamento formal do piloto.
- Revisar limites de rate (HTTP e Socket.IO) sob carga real.
- Plano de rollback (voltar para `sandbox`/`PILOT_MODE`) documentado com a operação.
