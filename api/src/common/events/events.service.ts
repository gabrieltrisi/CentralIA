import { Injectable, Logger } from '@nestjs/common';
import { EventsGateway } from './events.gateway';

// Re-exporta para manter compatível quem importa `EVENTS` deste módulo.
export { EVENTS } from './events.constants';

/**
 * Emite eventos de tempo real para a sala da empresa. Degrada graciosamente
 * quando o servidor Socket.IO não está disponível (testes/contexto sem HTTP).
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger('Events');

  constructor(private readonly gateway: EventsGateway) {}

  emit(companyId: string | null | undefined, event: string, payload: unknown): void {
    if (!companyId) return;
    try {
      this.gateway.server?.to(`company:${companyId}`).emit(event, payload);
    } catch (err) {
      this.logger.warn(`Falha ao emitir ${event}: ${(err as Error).message}`);
    }
  }
}
