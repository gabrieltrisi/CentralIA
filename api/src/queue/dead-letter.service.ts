import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { QUEUES } from './queues.constants';

/**
 * Encaminha jobs que esgotaram as tentativas para a dead-letter queue,
 * preservando dados e o erro final para inspeção/reprocessamento manual.
 */
@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger('DeadLetter');

  constructor(
    @InjectQueue(QUEUES.DEAD_LETTER) private readonly dlq: Queue,
  ) {}

  /** Move um job para a DLQ se ele esgotou as tentativas. */
  async handleFailure(sourceQueue: string, job: Job, error: Error) {
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < attempts) return; // ainda há retry

    this.logger.error(
      `Job ${sourceQueue}#${job.id} (${job.name}) esgotou ${attempts} tentativas: ${error.message}`,
    );
    await this.dlq.add('dead', {
      sourceQueue,
      name: job.name,
      data: job.data,
      failedReason: error.message,
      attemptsMade: job.attemptsMade,
    });
  }
}
