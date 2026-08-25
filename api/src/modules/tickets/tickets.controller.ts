import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TicketStatus, TicketType, UserRole } from '@prisma/client';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';

@ApiTags('tickets')
@ApiBearerAuth()
@Roles(UserRole.MANAGER, UserRole.AGENT, UserRole.SUPPORT)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar tickets paginados da empresa' })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: TicketStatus,
    @Query('type') type?: TicketType,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.tickets.findAll(user.companyId, {
      status,
      type,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhar ticket' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tickets.findOne(id, user.companyId);
  }

  @Post()
  @ApiOperation({ summary: 'Criar ticket' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTicketDto) {
    return this.tickets.create({ ...dto, companyId: user.companyId });
  }

  @Patch(':id/status/:status')
  @ApiOperation({ summary: 'Atualizar status do ticket' })
  async setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('status') status: TicketStatus,
  ) {
    await this.tickets.findOne(id, user.companyId);
    return this.tickets.setStatus(id, status);
  }
}
