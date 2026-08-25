import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { CurrentUser } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Listar atendentes da empresa (filtros: role, active)' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('role') role?: UserRole,
    @Query('active') active?: string,
  ) {
    return this.users.list(user.companyId, {
      role,
      active: active === undefined ? undefined : active === 'true',
    });
  }
}
