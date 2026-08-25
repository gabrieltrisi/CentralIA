import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DeadLetterService } from './dead-letter.service';
import { SchedulerService } from './scheduler.service';
import { QUEUES } from './queues.constants';
import { redisConnectionOptions } from '../redis/redis-connection';

// Reexporta para compatibilidade com imports existentes (`from queue.module`).
export { QUEUES } from './queues.constants';

const registeredQueues = BullModule.registerQueue(
  { name: QUEUES.ISPBOX_SYNC },
  { name: QUEUES.WHATSAPP_INBOUND },
  { name: QUEUES.WHATSAPP_OUTBOUND },
  { name: QUEUES.AI_PROCESSING },
  { name: QUEUES.TICKET_PROCESSING },
  { name: QUEUES.DEAD_LETTER },
);

/**
 * Conexão raiz do BullMQ (Redis) + registro global das filas.
 * Marcado @Global e reexportando os providers das filas para que qualquer
 * módulo possa injetar com @InjectQueue.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          ...redisConnectionOptions(config),
          // Necessário p/ workers BullMQ (comandos bloqueantes) e Upstash.
          maxRetriesPerRequest: null,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      }),
    }),
    registeredQueues,
    ScheduleModule.forRoot(),
  ],
  providers: [SchedulerService, DeadLetterService],
  exports: [registeredQueues, DeadLetterService],
})
export class QueueModule {}
