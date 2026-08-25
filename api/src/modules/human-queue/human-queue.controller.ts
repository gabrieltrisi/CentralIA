import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HumanQueueReason, HumanQueueStatus, Priority, UserRole } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';
import { HumanQueueService } from './human-queue.service';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';

class AssignDto {
  @IsOptional()
  @IsString()
  assignedUserId?: string;
}

@ApiTags('human-queue')
@ApiBearerAuth()
@Roles(UserRole.MANAGER, UserRole.AGENT, UserRole.SUPPORT, UserRole.FINANCIAL, UserRole.COMMERCIAL)
@Controller('human-queue')
export class HumanQueueController {
  constructor(private readonly humanQueue: HumanQueueService) {}

  @Get()
  @ApiOperation({ summary: 'Listar fila humana paginada com SLA (status, reason, priority, search)' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: HumanQueueStatus,
    @Query('reason') reason?: HumanQueueReason,
    @Query('priority') priority?: Priority,
    @Query('assignedUserId') assignedUserId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.humanQueue.list(user.companyId, {
      status,
      reason,
      priority,
      assignedUserId,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Patch(':id/assign')
  @ApiOperation({ summary: 'Atribuir item da fila (a outro atendente ou a si mesmo)' })
  assign(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssignDto) {
    return this.humanQueue.assign(id, dto.assignedUserId ?? user.userId, user.companyId, user.userId);
  }

  @Patch(':id/resolve')
  @ApiOperation({ summary: 'Resolver item da fila' })
  resolve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.humanQueue.resolve(id, user.companyId, user.userId);
  }

  @Patch(':id/reopen')
  @ApiOperation({ summary: 'Reabrir item da fila' })
  reopen(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.humanQueue.reopen(id, user.companyId, user.userId);
  }
}
