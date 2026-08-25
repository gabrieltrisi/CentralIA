import { Global, Module } from '@nestjs/common';
import { KnowledgeProviderService } from './knowledge-provider.service';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeController } from './knowledge.controller';
import { PlanProviderService } from './plan-provider.service';

@Global()
@Module({
  controllers: [KnowledgeController],
  providers: [KnowledgeProviderService, KnowledgeService, PlanProviderService],
  exports: [KnowledgeProviderService, KnowledgeService, PlanProviderService],
})
export class KnowledgeModule {}
