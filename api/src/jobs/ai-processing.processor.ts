import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES } from '../queue/queue.module';
import { DeadLetterService } from '../queue/dead-letter.service';
import { AiService } from '../modules/ai/ai.service';

/**
 * Processamento de IA fora do caminho síncrono (ex.: pré-cálculo de sugestões).
 * Job suportado: 'suggest' { history, context }.
 */
@Processor(QUEUES.AI_PROCESSING)
export class AiProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger('AiProcessingProcessor');

  constructor(
    private readonly ai: AiService,
    private readonly deadLetter: DeadLetterService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    if (job.name === 'suggest') {
      const suggestion = await this.ai.suggestReply(job.data);
      return { suggestion };
    }
    this.logger.warn(`Job de IA desconhecido: ${job.name}`);
    return null;
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    return this.deadLetter.handleFailure(QUEUES.AI_PROCESSING, job, err);
  }
}
