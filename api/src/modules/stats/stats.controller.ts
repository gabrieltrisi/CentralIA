import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HumanQueueReason, UserRole } from '@prisma/client';
import { StatsService } from './stats.service';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';

@ApiTags('stats')
@ApiBearerAuth()
@Roles(UserRole.MANAGER, UserRole.AGENT, UserRole.SUPPORT, UserRole.FINANCIAL, UserRole.COMMERCIAL)
@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Visão geral da operação (cards do Dashboard)' })
  overview(@CurrentUser() user: AuthUser) {
    return this.stats.overview(user.companyId);
  }

  @Get('sla')
  @ApiOperation({ summary: 'Métricas de SLA por período (startDate, endDate, type)' })
  sla(
    @CurrentUser() user: AuthUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('type') type?: HumanQueueReason,
  ) {
    return this.stats.sla(user.companyId, { startDate, endDate, type });
  }
}
