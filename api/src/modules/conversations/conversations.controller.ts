import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ConversationStatus, UserRole } from '@prisma/client';
import { Request } from 'express';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { ConversationsService } from './conversations.service';
import { ConversationIspboxService } from './conversation-ispbox.service';
import { ConversationSummaryService } from './copilot/conversation-summary.service';
import { CopilotReplyService } from './copilot/copilot-reply.service';
import { CopilotGoal, CopilotTone } from './copilot/copilot.types';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';

class AssignDto {
  @IsOptional()
  @IsString()
  assignedUserId?: string;
}

class SendMessageDto {
  @IsString()
  @MinLength(1)
  content: string;
}

class ChargeDto {
  @IsString()
  @MinLength(1)
  chargeId: string;
}

class SuggestReplyDto {
  @IsOptional()
  @IsIn(['professional', 'friendly', 'short'])
  tone?: CopilotTone;

  @IsOptional()
  @IsIn(['continue', 'close', 'ask_document', 'ask_payment', 'support_followup'])
  goal?: CopilotGoal;
}

@ApiTags('conversations')
@ApiBearerAuth()
@Roles(
  UserRole.MANAGER,
  UserRole.AGENT,
  UserRole.FINANCIAL,
  UserRole.SUPPORT,
  UserRole.COMMERCIAL,
)
@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly ispbox: ConversationIspboxService,
    private readonly summary: ConversationSummaryService,
    private readonly copilot: CopilotReplyService,
    private readonly audit: AuditLogService,
  ) {}

  private actor(user: AuthUser) {
    return { userId: user.userId, role: user.role, companyId: user.companyId };
  }

  private ispboxActor(user: AuthUser) {
    return { userId: user.userId, companyId: user.companyId };
  }

  @Get()
  @ApiOperation({ summary: 'Listar conversas paginadas (RBAC fino + não lidas)' })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: ConversationStatus,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.conversations.findAll(this.actor(user), {
      status,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe da conversa (cliente, mensagens, anexos, ticket, FSM)' })
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.conversations.getDetail(id, user.companyId);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Marcar conversa como lida' })
  read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.conversations.markRead(id, this.actor(user));
  }

  // ----- Copilot do atendente (resumo + sugestão de resposta) -----
  @Get(':id/summary')
  @ApiOperation({ summary: 'Resumo inteligente (determinístico) da conversa' })
  async copilotSummary(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('refresh') refresh: string | undefined,
    @Req() req: Request,
  ) {
    const result = await this.summary.build(id, user.companyId); // valida companyId (getDetail)
    await this.audit.record({
      companyId: user.companyId, actorType: 'user', actorId: user.userId,
      action: refresh ? 'copilot.summary.refresh' : 'copilot.summary.view',
      entityType: 'conversation', entityId: id,
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    return result;
  }

  @Post(':id/copilot/suggest-reply')
  @ApiOperation({ summary: 'Sugerir resposta (template determinístico; NUNCA envia automaticamente)' })
  async copilotSuggest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SuggestReplyDto,
    @Req() req: Request,
  ) {
    const result = await this.copilot.suggest(id, user.companyId, dto);
    await this.audit.record({
      companyId: user.companyId, actorType: 'user', actorId: user.userId,
      action: 'copilot.suggest_reply', entityType: 'conversation', entityId: id,
      metadata: { tone: dto.tone, goal: dto.goal, reasoningLabel: result.reasoningLabel },
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    return result;
  }

  @Post(':id/copilot/copy')
  @ApiOperation({ summary: 'Registra (auditoria) que o resumo foi copiado' })
  async copilotCopy(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    await this.conversations.findOne(id, user.companyId); // valida companyId
    await this.audit.record({
      companyId: user.companyId, actorType: 'user', actorId: user.userId,
      action: 'copilot.copy_summary', entityType: 'conversation', entityId: id,
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    return { ok: true };
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Enviar mensagem manual do atendente (auto-assign)' })
  sendMessage(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SendMessageDto) {
    return this.conversations.sendManualMessage(id, dto.content, this.actor(user));
  }

  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Enviar anexo (imagem/PDF) do atendente' })
  sendAttachment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('caption') caption?: string,
  ) {
    return this.conversations.sendAttachment(
      id,
      { buffer: file.buffer, mimetype: file.mimetype, originalname: file.originalname },
      caption,
      this.actor(user),
    );
  }

  @Patch(':id/assign')
  @ApiOperation({ summary: 'Atribuir conversa (a outro atendente ou a si mesmo)' })
  async assign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AssignDto,
    @Req() req: Request,
  ) {
    const target = dto.assignedUserId ?? user.userId;
    const result = await this.conversations.assign(id, target, user.companyId);
    await this.audit.record({
      companyId: user.companyId,
      actorType: 'user',
      actorId: user.userId,
      action: 'conversation.assign',
      entityType: 'conversation',
      entityId: id,
      metadata: { assignedUserId: target },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }

  @Patch(':id/close')
  @ApiOperation({ summary: 'Encerrar conversa' })
  async close(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    const result = await this.conversations.close(id, user.companyId);
    await this.audit.record({
      companyId: user.companyId, actorType: 'user', actorId: user.userId,
      action: 'conversation.close', entityType: 'conversation', entityId: id,
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    return result;
  }

  @Patch(':id/reopen')
  @ApiOperation({ summary: 'Reabrir conversa' })
  async reopen(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    const result = await this.conversations.reopen(id, user.companyId);
    await this.audit.record({
      companyId: user.companyId, actorType: 'user', actorId: user.userId,
      action: 'conversation.reopen', entityType: 'conversation', entityId: id,
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    return result;
  }

  // ----- ISPBOX no contexto da conversa (leitura + ações guardadas) -----
  @Get(':id/ispbox')
  @ApiOperation({ summary: 'Snapshot ISPBOX do cliente da conversa (serviços, status, cobranças)' })
  ispboxSnapshot(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ispbox.snapshot(id, this.ispboxActor(user));
  }

  @Post(':id/ispbox/refresh')
  @ApiOperation({ summary: 'Atualizar (recarregar) o snapshot ISPBOX' })
  ispboxRefresh(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ispbox.snapshot(id, this.ispboxActor(user));
  }

  @Post(':id/ispbox/pix')
  @Roles(UserRole.MANAGER, UserRole.FINANCIAL)
  @ApiOperation({ summary: 'Gerar PIX da cobrança (guardado por flag/piloto)' })
  ispboxPix(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ChargeDto) {
    return this.ispbox.generatePix(id, dto.chargeId, this.ispboxActor(user));
  }

  @Post(':id/ispbox/pdf')
  @Roles(UserRole.MANAGER, UserRole.FINANCIAL)
  @ApiOperation({ summary: 'Gerar PDF do boleto (guardado por flag/piloto)' })
  ispboxPdf(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ChargeDto) {
    return this.ispbox.generatePdf(id, dto.chargeId, this.ispboxActor(user));
  }

  @Post(':id/ispbox/os')
  @Roles(UserRole.MANAGER, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Abrir OS (guardado por SUPPORT_ALLOW_OS_CREATION/piloto)' })
  ispboxOs(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ispbox.openOs(id, this.ispboxActor(user));
  }
}
