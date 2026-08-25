/**
 * Centralized, typed configuration loaded from environment variables.
 * Registered via `ConfigModule.forRoot({ load: [configuration] })`.
 */
export default () => ({
  port: parseInt(process.env.PORT ?? '3001', 10),
  // CORS aceita FRONTEND_URL (deploy) + CORS_ORIGINS (lista local). Nunca aberto.
  corsOrigins: (() => {
    const list = [process.env.FRONTEND_URL, ...(process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',')]
      .map((s) => s?.trim())
      .filter((s): s is string => !!s);
    return list.length ? Array.from(new Set(list)) : ['http://localhost:3000'];
  })(),
  // URL do painel web — usada para restringir o CORS do gateway de tempo real.
  frontendUrl: process.env.FRONTEND_URL ?? '',

  realtime: {
    // Origens aceitas no handshake Socket.IO (FRONTEND_URL tem prioridade; cai para CORS_ORIGINS).
    corsOrigins: (process.env.FRONTEND_URL ?? process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(','),
    // Janela e limite de conexões por IP (anti-abuso do handshake).
    connWindowMs: parseInt(process.env.REALTIME_CONN_WINDOW_MS ?? '10000', 10),
    connMaxPerWindow: parseInt(process.env.REALTIME_CONN_MAX ?? '30', 10),
    // Auditar conexões/desconexões do socket (recomendado em produção).
    auditConnections:
      (process.env.REALTIME_AUDIT_CONNECTIONS ?? (process.env.APP_MODE === 'production' ? 'true' : 'false')).toLowerCase() === 'true',
    // Minutos sem heartbeat para considerar o atendente AWAY.
    awayAfterMinutes: parseInt(process.env.REALTIME_AWAY_AFTER_MIN ?? '5', 10),
  },

  // 'sandbox' = não executa efeitos externos reais (ISPBOX/WhatsApp); apenas simula.
  appMode: (process.env.APP_MODE ?? 'live').toLowerCase(),
  // Liga a máquina de estado persistente da conversa (mantém o fluxo atual quando false).
  useFsm: (process.env.USE_FSM ?? 'false').toLowerCase() === 'true',

  redis: {
    // REDIS_URL tem prioridade (Upstash/Render). Senão usa host/port/password.
    url: process.env.REDIS_URL ?? '',
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  ispbox: {
    baseUrl: process.env.ISPBOX_BASE_URL ?? '',
    clientId: process.env.ISPBOX_CLIENT_ID ?? '',
    clientSecret: process.env.ISPBOX_CLIENT_SECRET ?? '',
    scopes: process.env.ISPBOX_SCOPES ?? '',
    requestId: process.env.ISPBOX_REQUEST_ID ?? 'ispbox',
    // Tipo de OS padrão usado pelo agente de suporte ao abrir chamados.
    defaultOsTypeId: process.env.ISPBOX_DEFAULT_OS_TYPE ?? '',
    // Liga as LEITURAS reais da ISPBOX (em sandbox sempre usa o mock).
    enabled: (process.env.ISPBOX_ENABLED ?? 'true').toLowerCase() === 'true',
  },

  // Ações sensíveis (escritas reais) — exigem flag explícita fora do sandbox.
  financial: {
    allowPaymentActions:
      (process.env.FINANCIAL_ALLOW_PAYMENT_ACTIONS ?? 'false').toLowerCase() === 'true',
  },
  support: {
    allowOsCreation:
      (process.env.SUPPORT_ALLOW_OS_CREATION ?? 'false').toLowerCase() === 'true',
  },

  ai: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    model: process.env.AI_MODEL ?? 'claude-opus-4-8',
  },

  meta: {
    verifyToken: process.env.META_VERIFY_TOKEN ?? '',
    accessToken: process.env.META_ACCESS_TOKEN ?? '',
    phoneNumberId: process.env.META_PHONE_NUMBER_ID ?? '',
    graphVersion: process.env.META_GRAPH_VERSION ?? 'v21.0',
    appSecret: process.env.META_APP_SECRET ?? '',
    // Em sandbox, permite pular a validação de assinatura do webhook.
    webhookSignatureBypass:
      (process.env.META_WEBHOOK_SIGNATURE_BYPASS ?? 'false').toLowerCase() === 'true',
  },

  bullBoard: {
    user: process.env.BULL_BOARD_USER ?? '',
    password: process.env.BULL_BOARD_PASSWORD ?? '',
  },

  storage: {
    // local | mock | s3  (vazio = automático: mock em sandbox, local fora)
    driver: (process.env.STORAGE_DRIVER ?? '').toLowerCase(),
    dir: process.env.STORAGE_DIR ?? './storage',
    allowLocalInProduction:
      (process.env.ALLOW_LOCAL_STORAGE_IN_PRODUCTION ?? 'false').toLowerCase() === 'true',
    s3: {
      endpoint: process.env.S3_ENDPOINT || undefined,
      region: process.env.S3_REGION ?? 'us-east-1',
      bucket: process.env.S3_BUCKET ?? '',
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
      publicBaseUrl: process.env.S3_PUBLIC_BASE_URL ?? '',
    },
  },

  attachments: {
    // Segredo para assinar share-links temporários.
    signingSecret: process.env.ATTACHMENT_SIGNING_SECRET ?? 'centralia-dev-secret',
    shareTtlSeconds: parseInt(process.env.ATTACHMENT_SHARE_TTL ?? '900', 10), // 15 min
  },

  internal: {
    // Chave para operações internas sensíveis (ex.: criar share-link).
    apiKey: process.env.INTERNAL_API_KEY ?? '',
  },

  jwt: {
    secret: process.env.JWT_SECRET ?? 'centralia-jwt-dev-secret',
    // Segredo separado para o refresh token (cai para JWT_SECRET se ausente — compatível).
    refreshSecret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'centralia-jwt-dev-secret',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  },

  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '120', 10),
  },

  company: {
    defaultName: process.env.DEFAULT_COMPANY_NAME ?? 'CentralIA',
  },

  supervisor: {
    // Limiar mínimo de confiança para a IA conduzir; abaixo disso, escala humano.
    confidenceThreshold: parseFloat(
      process.env.AI_CONFIDENCE_THRESHOLD ?? '0.7',
    ),
  },

  // Piloto real controlado (Sprint 11). Quando ligado, só processa mensagens de
  // telefones permitidos; envios reais à Meta exigem flags explícitas.
  pilot: {
    enabled: (process.env.PILOT_MODE ?? 'false').toLowerCase() === 'true',
    allowedPhones: (process.env.PILOT_ALLOWED_PHONES ?? '')
      .split(',')
      .map((p) => p.replace(/\D/g, ''))
      .filter(Boolean),
    // Envio de teste à Meta — só ocorre com a flag explícita.
    allowMetaSend: (process.env.PILOT_ALLOW_META_SEND ?? 'false').toLowerCase() === 'true',
    // Permite o teste mesmo em sandbox (apenas simula — não vai à Meta real).
    forceSandboxSend: (process.env.PILOT_FORCE_SANDBOX_SEND ?? 'false').toLowerCase() === 'true',
    testPhone: (process.env.PILOT_TEST_PHONE ?? '').replace(/\D/g, ''),
    // Consulta de cliente usada no readonly da ISPBOX (telefone ou CPF/CNPJ).
    customerQuery: process.env.PILOT_CUSTOMER_QUERY ?? '',
    // Permite gerar PDF/QRCode de pagamento no readonly (não abre OS).
    allowPaymentTest: (process.env.PILOT_ALLOW_PAYMENT_TEST ?? 'false').toLowerCase() === 'true',
    // Em PILOT_MODE, libera escritas reais na ISPBOX (PIX/PDF/OS) p/ telefones permitidos.
    allowIspboxWrite: (process.env.PILOT_ALLOW_ISPBOX_WRITE ?? 'false').toLowerCase() === 'true',
  },
});

export type AppConfig = ReturnType<typeof import('./configuration').default>;
