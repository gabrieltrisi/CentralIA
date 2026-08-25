import { Global, Module } from '@nestjs/common';
import { IspboxModule } from '../ispbox/ispbox.module';
import { MetaWhatsappModule } from '../meta-whatsapp/meta-whatsapp.module';
import { PilotService } from './pilot.service';
import { PilotOpsService } from './pilot-ops.service';

/**
 * Piloto controlado. Global para que PilotService (allowlist/flags, sem deps
 * pesadas) esteja disponível ao processor de webhook e ao diagnóstico da Meta,
 * sem criar aresta de import entre módulos. PilotOpsService (operações reais de
 * piloto) é usado pelos scripts.
 */
@Global()
@Module({
  imports: [IspboxModule, MetaWhatsappModule],
  providers: [PilotService, PilotOpsService],
  exports: [PilotService, PilotOpsService],
})
export class PilotModule {}
