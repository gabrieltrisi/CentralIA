import { Module } from '@nestjs/common';
import { HumanQueueService } from './human-queue.service';
import { HumanQueueController } from './human-queue.controller';
import { SummaryGeneratorService } from './summary-generator.service';
import { ConversationsModule } from '../conversations/conversations.module';

@Module({
  imports: [ConversationsModule],
  controllers: [HumanQueueController],
  providers: [HumanQueueService, SummaryGeneratorService],
  exports: [HumanQueueService, SummaryGeneratorService],
})
export class HumanQueueModule {}
