import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';

@ApiTags('audit-logs')
@ApiBearerAuth()
@Roles(UserRole.MANAGER) // ADMIN passa automaticamente pelo RolesGuard
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly audit: AuditLogService) {}

  @Get()
  @ApiOperation({ summary: 'Consultar trilha de auditoria (ADMIN/MANAGER)' })
  query(
    @CurrentUser() user: AuthUser,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('actorType') actorType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    // ADMIN vê tudo; demais ficam restritos à própria empresa.
    const companyId = user.role === UserRole.ADMIN ? undefined : user.companyId;
    return this.audit.query({
      companyId,
      action,
      entityType,
      entityId,
      actorType,
      startDate,
      endDate,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
