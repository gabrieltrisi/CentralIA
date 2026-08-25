import { Module } from '@nestjs/common';
import { CustomersModule } from '../modules/customers/customers.module';
import { ConversationsModule } from '../modules/conversations/conversations.module';
import { TicketsModule } from '../modules/tickets/tickets.module';
import { IspboxModule } from '../modules/ispbox/ispbox.module';
import { AiModule } from '../modules/ai/ai.module';
import { MetaWhatsappModule } from '../modules/meta-whatsapp/meta-whatsapp.module';
import { IspboxSyncProcessor } from './ispbox-sync.processor';
import { WhatsappInboundProcessor } from './whatsapp-inbound.processor';
import { WhatsappOutboundProcessor } from './whatsapp-outbound.processor';
import { AiProcessingProcessor } from './ai-processing.processor';
import { TicketProcessingProcessor } from './ticket-processing.processor';

/**
 * Reúne os processors (workers) BullMQ. As filas e a conexão Redis vêm do
 * QueueModule (global); este módulo apenas registra os consumidores.
 */
@Module({
  imports: [
    CustomersModule,
    ConversationsModule,
    TicketsModule,
    IspboxModule,
    AiModule,
    MetaWhatsappModule,
  ],
  providers: [
    IspboxSyncProcessor,
    WhatsappInboundProcessor,
    WhatsappOutboundProcessor,
    AiProcessingProcessor,
    TicketProcessingProcessor,
  ],
})
export class JobsModule {}
