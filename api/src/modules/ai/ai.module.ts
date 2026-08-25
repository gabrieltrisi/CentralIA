import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { AiSupervisorService } from './ai-supervisor.service';
import { AiOrchestratorService } from './ai-orchestrator.service';
import { CommercialAgent } from './agents/commercial.agent';
import { SupportAgent } from './agents/support.agent';
import { FinancialAgent } from './agents/financial.agent';
import { ConversationStateService } from './fsm/conversation-state.service';
import { FsmService } from './fsm/fsm.service';
import { DataExtractorService } from './fsm/data-extractor.service';
import { ValidationService } from './fsm/validation.service';
import { CommercialFlow } from './fsm/flows/commercial.flow';
import { SupportFlow } from './fsm/flows/support.flow';
import { FinancialFlow } from './fsm/flows/financial.flow';
import { COVERAGE_PROVIDER } from './coverage/coverage.provider';
import { MockCoverageProvider } from './coverage/mock-coverage.provider';
import { ConversationsModule } from '../conversations/conversations.module';
import { CustomersModule } from '../customers/customers.module';
import { TicketsModule } from '../tickets/tickets.module';
import { IspboxModule } from '../ispbox/ispbox.module';
import { HumanQueueModule } from '../human-queue/human-queue.module';

@Module({
  imports: [
    ConversationsModule,
    CustomersModule,
    TicketsModule,
    IspboxModule,
    HumanQueueModule,
  ],
  controllers: [AiController],
  providers: [
    AiService,
    AiSupervisorService,
    AiOrchestratorService,
    CommercialAgent,
    SupportAgent,
    FinancialAgent,
    ConversationStateService,
    FsmService,
    DataExtractorService,
    ValidationService,
    CommercialFlow,
    SupportFlow,
    FinancialFlow,
    { provide: COVERAGE_PROVIDER, useClass: MockCoverageProvider },
  ],
  exports: [AiService, AiOrchestratorService, ConversationStateService, FsmService],
})
export class AiModule {}
