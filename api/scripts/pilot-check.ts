/**
 * pilot:check — Validação de prontidão do ambiente real (Sprint 11).
 *
 * Sobe o AppModule em modo "application context" (sem listener HTTP) para checar
 * infraestrutura (DB, migrations, seed, Redis, filas, storage, ISPBOX) e faz
 * chamadas HTTP/Socket.IO contra uma API JÁ RODANDO (API_URL) para validar
 * login, /health, /stats e o handshake de tempo real. NÃO executa ações
 * destrutivas. Registra AuditLog `pilot.check`.
 *
 * Uso: API_URL=http://localhost:3001 npm run pilot:check
 */
import { NestFactory } from '@nestjs/core';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { io } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditLogService } from '../src/common/audit/audit-log.service';
import { IspboxAuthService } from '../src/modules/ispbox/auth/ispbox-auth.service';
import { STORAGE_PROVIDER, StorageProvider } from '../src/common/storage/storage.provider';
import { REDIS_CLIENT } from '../src/redis/redis.module';
import { QUEUES } from '../src/queue/queues.constants';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const EMAIL = process.env.SMOKE_EMAIL ?? 'admin@centralia.local';
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'CentralIA@123';

let passed = 0;
let failed = 0;
let skipped = 0;

function ok(name: string, detail = '') { passed += 1; console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`); }
function bad(name: string, msg: string) { failed += 1; console.error(`  ✗ ${name} — ${msg}`); }
function skip(name: string, why: string) { skipped += 1; console.log(`  ↷ ${name} — ${why}`); }

async function check(name: string, fn: () => Promise<string | void>) {
  try { ok(name, (await fn()) || ''); }
  catch (err) { bad(name, (err as Error).message); }
}

function socketHandshake(token: string): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = io(`${API_URL}/realtime`, { transports: ['websocket'], auth: { token }, timeout: 5000, reconnection: false });
    const done = (v: boolean) => { sock.close(); resolve(v); };
    sock.on('connect', () => done(true));
    sock.on('connect_error', () => done(false));
    setTimeout(() => done(false), 6000);
  });
}

async function run() {
  console.log(`\n🧪 CentralIA pilot:check → ${API_URL}\n`);

  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>;
  try {
    app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  } catch (err) {
    const msg = (err as Error).message;
    console.error('❌ Falha ao inicializar a aplicação (configuração/infra ausente).');
    if (/DATABASE_URL|Environment variable not found|prisma/i.test(msg)) {
      console.error('   • Defina DATABASE_URL e garanta o Postgres no ar (e rode as migrations).');
    }
    if (/ECONNREFUSED|connect|redis|ENOTFOUND|getaddrinfo/i.test(msg)) {
      console.error('   • Verifique REDIS_HOST/REDIS_PORT e o Redis no ar.');
    }
    if (/storage|STORAGE_DRIVER|Local storage/i.test(msg)) {
      console.error('   • Configure STORAGE_DRIVER (s3 em produção) ou use APP_MODE=sandbox.');
    }
    console.error(`   Detalhe: ${msg}\n`);
    process.exit(1);
  }
  const get = <T>(t: any): T => app.get(t, { strict: false });

  const config = get<ConfigService>(ConfigService);
  const prisma = get<PrismaService>(PrismaService);
  const audit = get<AuditLogService>(AuditLogService);
  const sandbox = config.get<string>('appMode') === 'sandbox';

  console.log(`Modo: ${config.get<string>('appMode')} | PILOT_MODE=${config.get<boolean>('pilot.enabled')}\n`);

  // ---- Infraestrutura (via app context) ----
  await check('DATABASE_URL presente', async () => {
    if (!process.env.DATABASE_URL) throw new Error('ausente');
    return 'definida';
  });
  await check('Postgres acessível', async () => { await prisma.$queryRaw`SELECT 1`; });
  await check('Migrations aplicadas', async () => {
    await prisma.userPresence.count(); // tabela da última migration
    return 'schema atualizado';
  });
  await check('Seed admin existe', async () => {
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!admin) throw new Error('nenhum usuário ADMIN — rode o seed');
    return admin.email;
  });
  await check('Redis (PING)', async () => {
    const redis = get<any>(REDIS_CLIENT);
    const pong = await redis.ping();
    if (pong !== 'PONG') throw new Error('sem PONG');
  });
  await check('Filas BullMQ ativas', async () => {
    const queue = get<any>(getQueueToken(QUEUES.WHATSAPP_INBOUND));
    const counts = await queue.getJobCounts();
    return `inbound: ${Object.keys(counts).length} estados`;
  });
  await check('Storage (round-trip)', async () => {
    const storage = get<StorageProvider>(STORAGE_PROVIDER);
    const storedName = 'pilot-check.txt';
    const saved = await storage.save({ buffer: Buffer.from('pilot'), storedName, mimeType: 'text/plain' });
    const back = await storage.read(saved.storedName);
    if (back.toString() !== 'pilot') throw new Error('conteúdo divergente');
    return saved.provider;
  });

  // ISPBOX só faz sentido fora do sandbox e com credenciais
  if (sandbox) {
    skip('ISPBOX auth token', 'APP_MODE=sandbox (usa mock)');
  } else if (!config.get<string>('ispbox.baseUrl')) {
    skip('ISPBOX auth token', 'ISPBOX_BASE_URL não configurado');
  } else {
    await check('ISPBOX auth token', async () => {
      const ispboxAuth = get<IspboxAuthService>(IspboxAuthService);
      const token = await ispboxAuth.getAccessToken();
      if (!token) throw new Error('sem token');
      return 'autenticado';
    });
  }

  // Meta envs (booleanos)
  await check('Meta envs presentes', async () => {
    const missing = ['meta.verifyToken', 'meta.accessToken', 'meta.phoneNumberId', 'meta.appSecret']
      .filter((k) => !config.get<string>(k));
    if (missing.length && !sandbox) throw new Error(`faltando: ${missing.join(', ')}`);
    return missing.length ? `sandbox — faltando ${missing.length} (ok p/ piloto)` : 'completas';
  });

  // ---- HTTP / Socket (API precisa estar rodando) ----
  let token: string | undefined;
  let apiUp = true;
  await check('GET /health (API rodando)', async () => {
    try {
      const { data } = await axios.get(`${API_URL}/health`, { timeout: 4000 });
      return `status=${data.status}`;
    } catch (err) {
      apiUp = false;
      throw new Error('API não acessível — suba a API e rode de novo os passos HTTP');
    }
  });

  if (apiUp) {
    await check('POST /auth/login (admin)', async () => {
      const { data } = await axios.post(`${API_URL}/auth/login`, { email: EMAIL, password: PASSWORD });
      token = data?.accessToken;
      if (!token) throw new Error('sem accessToken');
    });
    if (token) {
      const authed = axios.create({ baseURL: API_URL, headers: { Authorization: `Bearer ${token}` } });
      await check('GET /stats/overview', async () => { await authed.get('/stats/overview'); });
      await check('Socket.IO handshake (JWT)', async () => {
        if (!(await socketHandshake(token!))) throw new Error('handshake falhou');
        return 'conectado';
      });
      await check('Smoke HTTP (conversations/human-queue/presence)', async () => {
        await authed.get('/conversations?limit=1');
        await authed.get('/human-queue?limit=1');
        await authed.get('/presence');
      });
    }
  } else {
    skip('Login/Stats/Socket/Smoke', 'API offline');
  }

  await audit.record({
    actorType: 'system',
    action: 'pilot.check',
    entityType: 'pilot',
    metadata: { passed, failed, skipped, appMode: config.get<string>('appMode') },
  });

  console.log(`\n${failed === 0 ? '✅' : '❌'} pilot:check — ${passed} ok, ${failed} falhas, ${skipped} pulados\n`);
  await app.close();
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((e) => { console.error('Erro inesperado no pilot:check:', e); process.exit(1); });
