/**
 * pilot:ispbox-readonly — Leitura controlada da ISPBOX (Sprint 11).
 *
 * Autentica e LÊ dados (cliente, serviços, status de internet, cobranças).
 * Gera PDF/QRCode somente se PILOT_ALLOW_PAYMENT_TEST=true.
 * NUNCA abre OS. Registra AuditLog `pilot.ispbox_readonly`.
 *
 * Uso:
 *   PILOT_CUSTOMER_QUERY="5511999998888" npm run pilot:ispbox-readonly
 *
 * Em APP_MODE=sandbox usa o MockIspboxService (dry-run seguro).
 */
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../src/app.module';
import { PilotOpsService } from '../src/modules/pilot/pilot-ops.service';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const config = app.get(ConfigService, { strict: false });
  const ops = app.get(PilotOpsService, { strict: false });

  console.log(`\n🔎 ISPBOX readonly — modo=${config.get<string>('appMode')}\n`);
  try {
    const report = await ops.ispboxReadonly();
    report.steps.forEach((s: string) => console.log(`  • ${s}`));
    console.log('\nResumo:', JSON.stringify({
      query: report.query,
      customerId: report.customer?.id ?? null,
      servicesCount: report.servicesCount,
      chargesCount: report.chargesCount,
      paymentTested: report.paymentTested,
    }, null, 2));
    console.log('\n✅ Leitura concluída — nenhuma OS foi aberta.\n');
    await app.close();
    process.exit(0);
  } catch (err) {
    console.error(`\n❌ ${(err as Error).message}\n`);
    await app.close();
    process.exit(1);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
