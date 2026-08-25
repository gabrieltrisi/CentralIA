import { Module } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { ConversationIspboxService } from './conversation-ispbox.service';
import { ConversationsController } from './conversations.controller';
import { ConversationSummaryService } from './copilot/conversation-summary.service';
import { CopilotReplyService } from './copilot/copilot-reply.service';
import { MetaWhatsappModule } from '../meta-whatsapp/meta-whatsapp.module';
import { IspboxModule } from '../ispbox/ispbox.module';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
  imports: [MetaWhatsappModule, IspboxModule, TicketsModule],
  controllers: [ConversationsController],
  providers: [
    ConversationsService,
    ConversationIspboxService,
    ConversationSummaryService,
    CopilotReplyService,
  ],
  exports: [ConversationsService, ConversationSummaryService],
})
export class ConversationsModule {}
