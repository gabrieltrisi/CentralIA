import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { HealthModule } from './modules/health/health.module';
import { AuditLogModule } from './common/audit/audit-log.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { UsersModule } from './modules/users/users.module';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { RolesGuard } from './common/auth/roles.guard';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { QueueModule } from './queue/queue.module';
import { CompanyModule } from './common/company/company.module';
import { IntegrationLogModule } from './common/integration-log/integration-log.module';
import { EventsModule } from './common/events/events.module';
import { StorageModule } from './common/storage/storage.module';
import { IspboxModule } from './modules/ispbox/ispbox.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { CustomersModule } from './modules/customers/customers.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { AiModule } from './modules/ai/ai.module';
import { MetaWhatsappModule } from './modules/meta-whatsapp/meta-whatsapp.module';
import { HumanQueueModule } from './modules/human-queue/human-queue.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { PresenceModule } from './modules/presence/presence.module';
import { StatsModule } from './modules/stats/stats.module';
import { PilotModule } from './modules/pilot/pilot.module';
import { InternalModule } from './modules/internal/internal.module';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: (config.get<number>('throttle.ttl') ?? 60) * 1000,
            limit: config.get<number>('throttle.limit') ?? 120,
          },
        ],
      }),
    }),
    // Infraestrutura
    PrismaModule,
    RedisModule,
    QueueModule,
    CompanyModule,
    IntegrationLogModule,
    AuditLogModule,
    EventsModule,
    StorageModule,
    KnowledgeModule,
    // Domínios
    IspboxModule,
    ConversationsModule,
    CustomersModule,
    TicketsModule,
    AiModule,
    MetaWhatsappModule,
    HumanQueueModule,
    HealthModule,
    AttachmentsModule,
    AuthModule,
    AuditLogsModule,
    UsersModule,
    PresenceModule,
    StatsModule,
    PilotModule,
    InternalModule,
    // Workers
    JobsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
