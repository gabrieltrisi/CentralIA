import { Global, Module } from '@nestjs/common';
import { PresenceService } from './presence.service';
import { PresenceController } from './presence.controller';

/**
 * Presença de atendentes. Global para que o EventsGateway (EventsModule, também
 * global) injete PresenceService sem aresta de import entre os dois módulos —
 * evitando qualquer ciclo. PresenceService depende apenas de Prisma/Config; a
 * emissão do evento (EventsService global) fica no controller.
 */
@Global()
@Module({
  controllers: [PresenceController],
  providers: [PresenceService],
  exports: [PresenceService],
})
export class PresenceModule {}
