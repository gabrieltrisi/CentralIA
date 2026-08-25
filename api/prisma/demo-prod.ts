/**
 * Popula o banco com dados de DEMONSTRAÇÃO (sandbox), idempotente.
 *
 *   npm run demo:prod
 *
 * Segurança: só executa com APP_MODE=sandbox. Não chama Meta/ISPBOX reais,
 * não gera PIX/OS reais — apenas escrita Prisma com mocks. Pode rodar várias
 * vezes sem duplicar (limpa os registros demo anteriores antes de recriar).
 *
 * Para apontar ao Neon: defina DATABASE_URL do Neon no ambiente antes de rodar.
 */
import { PrismaClient } from '@prisma/client';
import { seedDemo } from '../src/common/demo/demo-data';

async function main() {
  const mode = (process.env.APP_MODE ?? '').toLowerCase();
  if (mode !== 'sandbox') {
    console.error(`[demo:prod] ABORTADO: APP_MODE=${mode || '(vazio)'} — exigido 'sandbox'.`);
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    console.log('[demo:prod] semeando dados de demonstração (sandbox)…');
    const result = await seedDemo(prisma);
    console.log('[demo:prod] OK:', JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('[demo:prod] erro:', e);
  process.exit(1);
});
