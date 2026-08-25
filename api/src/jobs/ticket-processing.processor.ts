import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES } from '../queue/queue.module';
import { DeadLetterService } from '../queue/dead-letter.service';
import { TicketsService } from '../modules/tickets/tickets.service';
import { RequestContext } from '../common/context/request-context';

/**
 * Processa ações de ticket fora do caminho síncrono.
 * Job suportado: 'open-os' — abre uma OS na ISPBOX e vincula ao ticket.
 */
@Processor(QUEUES.TICKET_PROCESSING)
export class TicketProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger('TicketProcessingProcessor');

  constructor(
    private readonly tickets: TicketsService,
    private readonly deadLetter: DeadLetterService,
  ) {
    super();
  }

  process(job: Job): Promise<unknown> {
    return RequestContext.run(
      { ticketId: (job.data as { ticketId?: string })?.ticketId },
      async () => {
        if (job.name === 'open-os') {
          const data = job.data as {
            ticketId: string;
            ispboxClientId: string;
            ispboxServiceId?: string;
            tipoId: string;
            assunto: string;
            descricao?: string;
          };
          return this.tickets.openWorkOrder(data);
        }
        this.logger.warn(`Job de ticket desconhecido: ${job.name}`);
        return null;
      },
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    return this.deadLetter.handleFailure(QUEUES.TICKET_PROCESSING, job, err);
  }
}
