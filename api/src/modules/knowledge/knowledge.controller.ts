import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { KnowledgeService } from './knowledge.service';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';

class CreateArticleDto {
  @IsString()
  @MinLength(2)
  category: string;

  @IsString()
  @MinLength(2)
  title: string;

  @IsString()
  @MinLength(2)
  content: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

class UpdateArticleDto {
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

@ApiTags('knowledge')
@ApiBearerAuth()
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  private actor(user: AuthUser) {
    return { userId: user.userId, companyId: user.companyId };
  }

  @Get()
  @Roles(UserRole.MANAGER, UserRole.COMMERCIAL, UserRole.SUPPORT, UserRole.FINANCIAL, UserRole.AGENT)
  @ApiOperation({ summary: 'Listar artigos (filtros: category, active, search)' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('category') category?: string,
    @Query('active') active?: string,
    @Query('search') search?: string,
  ) {
    return this.knowledge.list(
      { category, search, active: active === undefined ? undefined : active === 'true' },
      user.companyId,
    );
  }

  @Get('categories')
  @Roles(UserRole.MANAGER, UserRole.COMMERCIAL, UserRole.SUPPORT, UserRole.FINANCIAL, UserRole.AGENT)
  @ApiOperation({ summary: 'Listar categorias distintas' })
  categories(@CurrentUser() user: AuthUser) {
    return this.knowledge.categories(user.companyId);
  }

  @Get(':id')
  @Roles(UserRole.MANAGER, UserRole.COMMERCIAL, UserRole.SUPPORT, UserRole.FINANCIAL, UserRole.AGENT)
  @ApiOperation({ summary: 'Detalhar artigo' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.knowledge.get(id, user.companyId);
  }

  @Post()
  @Roles(UserRole.MANAGER) // ADMIN passa pelo RolesGuard
  @ApiOperation({ summary: 'Criar artigo (ADMIN/MANAGER)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateArticleDto) {
    return this.knowledge.create(dto, this.actor(user));
  }

  @Patch(':id')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Editar artigo / ativar-desativar (ADMIN/MANAGER)' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateArticleDto) {
    return this.knowledge.update(id, dto, this.actor(user));
  }

  @Delete(':id')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Remover artigo (ADMIN/MANAGER)' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.knowledge.remove(id, this.actor(user));
  }
}
