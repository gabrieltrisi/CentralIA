import { Controller, ForbiddenException, Headers, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/auth/decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { seedDemo } from '../../common/demo/demo-data';

/**
 * Operações internas/operacionais. Não exige JWT (@Public), mas é protegida por:
 *  - APP_MODE precisa ser 'sandbox' (jamais roda em ambiente live);
 *  - x-internal-key precisa bater com INTERNAL_API_KEY quando esta estiver definida
 *    (mesmo padrão de assertInternal usado em share-links). Se a chave não estiver
 *    definida, é liberado apenas em sandbox (conveniência de demo).
 */
@ApiTags('internal')
@Controller('internal')
export class InternalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditLogService,
  ) {}

  @Public()
  @Post('seed-demo')
  @ApiOperation({ summary: 'Popula dados de demonstração (sandbox, idempotente)' })
  async seedDemo(@Headers('x-internal-key') key: string | undefined, @Req() req: any) {
    this.assertAllowed(key);
    const result = await seedDemo(this.prisma);
    await this.audit.record({
      companyId: result.companyId,
      actorType: 'system',
      actorId: 'demo-seed',
      action: 'internal.seed_demo',
      entityType: 'company',
      entityId: result.companyId,
      metadata: result.counts,
      ip: req?.ip,
      userAgent: req?.headers?.['user-agent'],
    });
    return { ok: true, ...result };
  }

  private assertAllowed(key?: string): void {
    if ((this.config.get<string>('appMode') ?? '').toLowerCase() !== 'sandbox') {
      throw new ForbiddenException('Operação disponível apenas em sandbox.');
    }
    const expected = this.config.get<string>('internal.apiKey');
    if (!expected) return; // sandbox sem INTERNAL_API_KEY: liberado (conveniência de demo)
    if (key !== expected) throw new ForbiddenException('Chave interna inválida.');
  }
}
