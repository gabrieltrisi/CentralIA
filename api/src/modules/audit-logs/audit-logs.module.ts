import { Module } from '@nestjs/common';
import { AuditLogsController } from './audit-logs.controller';

// AuditLogService é global (AuditLogModule); aqui só expomos o endpoint.
@Module({
  controllers: [AuditLogsController],
})
export class AuditLogsModule {}
