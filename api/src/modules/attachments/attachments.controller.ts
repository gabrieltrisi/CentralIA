import {
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { Public } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';
import { AttachmentAccessService } from './attachment-access.service';
import { AttachmentGuard } from './attachment.guard';

type AttachReq = Request & { attachmentActor?: 'PUBLIC_LINK' | 'USER'; user?: AuthUser };

@ApiTags('attachments')
@Controller('attachments')
export class AttachmentsController {
  constructor(
    private readonly access: AttachmentAccessService,
    private readonly audit: AuditLogService,
  ) {}

  private actorType(req: AttachReq) {
    return req.attachmentActor === 'PUBLIC_LINK' ? ('public_link' as const) : ('user' as const);
  }

  @Get(':id')
  @Public()
  @UseGuards(AttachmentGuard)
  @ApiOperation({ summary: 'Metadados do anexo (JWT mesma empresa OU share-link)' })
  async metadata(@Param('id') id: string, @Req() req: AttachReq) {
    const meta = await this.access.getMetadata(id);
    await this.audit.record({
      companyId: req.user?.companyId,
      actorType: this.actorType(req),
      actorId: req.user?.userId,
      action: 'attachment.access',
      entityType: 'attachment',
      entityId: id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return meta;
  }

  @Get(':id/download')
  @Public()
  @UseGuards(AttachmentGuard)
  @ApiOperation({ summary: 'Download do anexo (JWT mesma empresa OU share-link)' })
  async download(@Param('id') id: string, @Req() req: AttachReq, @Res() res: Response) {
    const file = await this.access.download(id);
    await this.audit.record({
      companyId: req.user?.companyId,
      actorType: this.actorType(req),
      actorId: req.user?.userId,
      action: 'attachment.download',
      entityType: 'attachment',
      entityId: id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Content-Length': file.buffer.length,
    });
    res.end(file.buffer);
  }

  @Post(':id/share-link')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Gerar share-link temporário (15 min) — usuário autenticado' })
  async shareLink(@Param('id') id: string, @Req() req: Request) {
    const user = (req as any).user as AuthUser;
    await this.access.assertUserAccess(id, user.companyId);
    const link = await this.access.createShareLink(id, Date.now());
    await this.audit.record({
      companyId: user.companyId,
      actorType: 'user',
      actorId: user.userId,
      action: 'attachment.share_link.create',
      entityType: 'attachment',
      entityId: id,
      metadata: { expiresAt: link.expiresAt },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return { url: link.url, expiresAt: link.expiresAt };
  }
}
