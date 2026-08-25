import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUES } from '../queue/queue.module';
import { DeadLetterService } from '../queue/dead-letter.service';
import { CustomersService } from '../modules/customers/customers.service';
import { IspboxService } from '../modules/ispbox/ispbox.service';

/**
 * Processa os jobs de sincronização ISPBOX (sync-customers/services/billing/workorders).
 */
@Processor(QUEUES.ISPBOX_SYNC)
export class IspboxSyncProcessor extends WorkerHost {
  private readonly logger = new Logger('IspboxSyncProcessor');

  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly ispbox: IspboxService,
    private readonly deadLetter: DeadLetterService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    this.logger.log(`Executando ${job.name}`);
    switch (job.name) {
      case 'sync-customers':
        return this.syncCustomers();
      case 'sync-services':
        return this.syncServices();
      case 'sync-billing':
        return this.syncBilling();
      case 'sync-workorders':
        return this.syncWorkorders();
      default:
        this.logger.warn(`Job desconhecido: ${job.name}`);
        return null;
    }
  }

  private async eachCustomerWithIspbox(
    fn: (ispboxId: string, customerId: string) => Promise<void>,
  ) {
    const customers = await this.prisma.customer.findMany({
      where: { ispboxId: { not: null } },
    });
    for (const c of customers) {
      if (c.ispboxId) await fn(c.ispboxId, c.id);
    }
    return { processed: customers.length };
  }

  private syncCustomers() {
    return this.eachCustomerWithIspbox(async (ispboxId) => {
      await this.customers.syncFromIspbox(ispboxId);
    });
  }

  private syncServices() {
    return this.eachCustomerWithIspbox(async (ispboxId, customerId) => {
      await this.customers.syncServices(customerId, ispboxId);
    });
  }

  private async syncBilling() {
    // Toca as cobranças do primeiro serviço de cada cliente (aquecimento/log).
    const services = await this.prisma.customerService.findMany({
      include: { customer: true },
    });
    let count = 0;
    for (const svc of services) {
      if (!svc.customer.ispboxId) continue;
      try {
        await this.ispbox.listCharges(svc.customer.ispboxId, svc.ispboxServiceId, {});
        count++;
      } catch {
        // erros já registrados em IntegrationLog
      }
    }
    return { processed: count };
  }

  private async syncWorkorders() {
    const result = await this.ispbox.listWorkOrders({});
    return { count: Array.isArray(result) ? result.length : 0 };
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    return this.deadLetter.handleFailure(QUEUES.ISPBOX_SYNC, job, err);
  }
}
