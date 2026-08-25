import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsString, MinLength } from 'class-validator';
import { CustomersService } from './customers.service';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';

class IspboxLookupDto {
  @IsString()
  @MinLength(2)
  query: string;
}

@ApiTags('customers')
@ApiBearerAuth()
@Roles(UserRole.MANAGER, UserRole.AGENT, UserRole.COMMERCIAL, UserRole.SUPPORT, UserRole.FINANCIAL)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Post('ispbox-lookup')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Buscar cliente (tel/CPF/nome) + snapshot ISPBOX (ADMIN/MANAGER, leitura)' })
  ispboxLookup(@CurrentUser() user: AuthUser, @Body() dto: IspboxLookupDto) {
    return this.customers.lookupWithSnapshot(dto.query, user.companyId, user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'Listar clientes paginados da empresa' })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.customers.findAll(user.companyId, {
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhar cliente' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customers.findOne(id, user.companyId);
  }

  @Post('sync/:ispboxId')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Sincronizar cliente + serviços a partir da ISPBOX' })
  sync(@Param('ispboxId') ispboxId: string) {
    return this.customers.syncFromIspbox(ispboxId);
  }
}
