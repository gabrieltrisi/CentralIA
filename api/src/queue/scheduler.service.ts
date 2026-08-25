import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { QUEUES } from './queues.constants';

/**
 * Agenda os jobs de sincronização ISPBOX enfileirando-os na ispbox-sync.
 * As intervalos seguem a Sprint 1:
 *   - sync-customers   : 30 min
 *   - sync-services    : 15 min
 *   - sync-billing     : 15 min
 *   - sync-workorders  :  5 min
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger('Scheduler');

  constructor(
    @InjectQueue(QUEUES.ISPBOX_SYNC) private readonly ispboxSync: Queue,
  ) {}

  @Cron('0 */30 * * * *')
  async syncCustomers() {
    await this.enqueue('sync-customers');
  }

  @Cron('0 */15 * * * *')
  async syncServices() {
    await this.enqueue('sync-services');
  }

  @Cron('0 */15 * * * *')
  async syncBilling() {
    await this.enqueue('sync-billing');
  }

  @Cron('0 */5 * * * *')
  async syncWorkorders() {
    await this.enqueue('sync-workorders');
  }

  private async enqueue(name: string) {
    this.logger.log(`Enfileirando job ${name}`);
    await this.ispboxSync.add(name, { scheduledAt: new Date().toISOString() });
  }
}
