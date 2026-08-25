/**
 * pilot:meta-send-test — Envio controlado de WhatsApp de teste (Sprint 11).
 *
 * Só envia se PILOT_ALLOW_META_SEND=true e PILOT_TEST_PHONE definido.
 * Em APP_MODE=sandbox é bloqueado, salvo PILOT_FORCE_SANDBOX_SEND=true (simula).
 * Registra IntegrationLog (sender) + AuditLog `pilot.meta_send_test`.
 *
 * Uso:
 *   PILOT_ALLOW_META_SEND=true PILOT_TEST_PHONE="5511999998888" npm run pilot:meta-send-test
 */
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../src/app.module';
import { PilotOpsService } from '../src/modules/pilot/pilot-ops.service';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const config = app.get(ConfigService, { strict: false });
  const ops = app.get(PilotOpsService, { strict: false });

  console.log(`\n📨 Teste controlado Meta — modo=${config.get<string>('appMode')}\n`);
  try {
    const res = await ops.metaSendTest();
    console.log(`✅ Enviado para ${res.to} (simulado=${res.simulated}).`);
    if (res.simulated) console.log('   (sandbox: nenhuma mensagem real foi enviada à Meta.)');
    console.log();
    await app.close();
    process.exit(0);
  } catch (err) {
    console.error(`\n⛔ Bloqueado: ${(err as Error).message}\n`);
    await app.close();
    process.exit(1);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
