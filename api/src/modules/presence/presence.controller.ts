import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PresenceStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PresenceService } from './presence.service';
import { EVENTS, EventsService } from '../../common/events/events.service';
import { CurrentUser } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';

class HeartbeatDto {
  @IsOptional()
  @IsEnum(PresenceStatus)
  status?: PresenceStatus;
}

@ApiTags('presence')
@ApiBearerAuth()
@Controller('presence')
export class PresenceController {
  constructor(
    private readonly presence: PresenceService,
    private readonly events: EventsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar presença dos atendentes da empresa' })
  list(@CurrentUser() user: AuthUser) {
    return this.presence.list(user.companyId);
  }

  @Post('heartbeat')
  @ApiOperation({ summary: 'Sinal de presença do atendente (mantém ONLINE/AWAY)' })
  async heartbeat(@CurrentUser() user: AuthUser, @Body() dto: HeartbeatDto) {
    const view = await this.presence.heartbeat(
      user.userId,
      user.companyId,
      dto.status ?? PresenceStatus.ONLINE,
    );
    this.events.emit(user.companyId, EVENTS.USER_PRESENCE_UPDATED, {
      userId: view.userId,
      status: view.status,
    });
    return view;
  }
}
