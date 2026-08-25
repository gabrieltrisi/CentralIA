/**
 * Smoke test de runtime (HTTP) — valida o caminho crítico contra uma API viva.
 * Não depende de Playwright nem do painel web.
 *
 * Uso:
 *   API_URL=http://localhost:3001 \
 *   SMOKE_EMAIL=admin@centralia.local SMOKE_PASSWORD=CentralIA@123 \
 *   npm run smoke
 *
 * Em sandbox (APP_MODE=sandbox), o envio de mensagem é simulado (sem Meta real).
 */
import axios, { AxiosInstance } from 'axios';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const EMAIL = process.env.SMOKE_EMAIL ?? 'admin@centralia.local';
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'CentralIA@123';

let passed = 0;
let failed = 0;

function ok(name: string, detail = '') {
  passed += 1;
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name: string, err: unknown) {
  failed += 1;
  const msg = axios.isAxiosError(err)
    ? `${err.response?.status ?? ''} ${JSON.stringify(err.response?.data ?? err.message)}`
    : (err as Error).message;
  console.error(`  ✗ ${name} — ${msg}`);
}

async function step<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    const res = await fn();
    ok(name);
    return res;
  } catch (err) {
    fail(name, err);
    return undefined;
  }
}

async function main() {
  console.log(`\n🔥 CentralIA smoke test → ${API_URL}\n`);

  // 1) Health (público)
  await step('GET /health', async () => {
    const { data } = await axios.get(`${API_URL}/health`);
    if (!data?.status) throw new Error('sem status no health');
    console.log(`     modo=${data.appMode} db=${data.checks?.database} redis=${data.checks?.redis}`);
  });

  // 2) Login
  let token: string | undefined;
  await step('POST /auth/login', async () => {
    const { data } = await axios.post(`${API_URL}/auth/login`, { email: EMAIL, password: PASSWORD });
    token = data?.accessToken;
    if (!token) throw new Error('sem accessToken');
  });

  if (!token) {
    console.error('\n⛔ Sem token — abortando os passos autenticados.');
    return finish();
  }

  const api: AxiosInstance = axios.create({
    baseURL: API_URL,
    headers: { Authorization: `Bearer ${token}` },
  });

  // 3) Stats
  await step('GET /stats/overview', async () => {
    const { data } = await api.get('/stats/overview');
    if (typeof data?.conversasAbertas !== 'number') throw new Error('overview inválido');
    console.log(`     abertas=${data.conversasAbertas} fila=${data.aguardandoHumano} 1aResp=${data.mediaPrimeiraRespostaMin}min`);
  });
  await step('GET /stats/sla', async () => {
    const { data } = await api.get('/stats/sla');
    if (typeof data?.total !== 'number') throw new Error('sla inválido');
  });

  // 4) Listas paginadas
  let firstConversationId: string | undefined;
  await step('GET /conversations (paginado)', async () => {
    const { data } = await api.get('/conversations?limit=5');
    if (!Array.isArray(data?.data)) throw new Error('esperado envelope { data, total }');
    firstConversationId = data.data[0]?.id;
    console.log(`     total=${data.total} página=${data.page}`);
  });
  await step('GET /human-queue (paginado + SLA)', async () => {
    const { data } = await api.get('/human-queue?limit=5');
    if (!Array.isArray(data?.data)) throw new Error('esperado envelope { data, total }');
  });
  await step('GET /presence', async () => {
    const { data } = await api.get('/presence');
    if (!Array.isArray(data)) throw new Error('presença deve ser uma lista');
  });

  // 5) Presença (heartbeat)
  await step('POST /presence/heartbeat', async () => {
    const { data } = await api.post('/presence/heartbeat', { status: 'ONLINE' });
    if (data?.status !== 'ONLINE') throw new Error('heartbeat não confirmou ONLINE');
  });

  // 6) Envio sandbox (somente se houver conversa)
  if (firstConversationId) {
    await step('POST /conversations/:id/messages (sandbox)', async () => {
      const { data } = await api.post(`/conversations/${firstConversationId}/messages`, {
        content: `smoke-test ${new Date().toISOString()}`,
      });
      if (!data?.message?.id) throw new Error('sem mensagem na resposta');
      const simulated = data?.delivery?.simulated;
      console.log(`     enviado (simulado=${simulated ?? 'n/d'})`);
    });
    await step('POST /conversations/:id/read', async () => {
      await api.post(`/conversations/${firstConversationId}/read`, {});
    });
  } else {
    console.log('  ⚠ Sem conversa para testar envio — rode o seed/demo antes (pulado).');
  }

  finish();
}

function finish() {
  console.log(`\n${failed === 0 ? '✅' : '❌'} Smoke: ${passed} ok, ${failed} falhas\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Erro inesperado no smoke:', err);
  process.exit(1);
});
