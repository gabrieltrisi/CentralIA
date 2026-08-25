import { Global, Module } from '@nestjs/common';
import { IntegrationLogService } from './integration-log.service';

@Global()
@Module({
  providers: [IntegrationLogService],
  exports: [IntegrationLogService],
})
export class IntegrationLogModule {}
