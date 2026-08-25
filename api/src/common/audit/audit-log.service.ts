import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  companyId?: string | null;
  actorType: 'system' | 'user' | 'agent' | 'meta' | 'public_link';
  actorId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: unknown;
  ip?: string;
  userAgent?: string;
}

/**
 * Trilha de auditoria. Persiste eventos sensíveis (acesso a anexo, share-link,
 * download, handoff, envio outbound real, webhook duplicado, mídia rejeitada).
 * Nunca propaga erro de persistência.
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    this.logger.log(JSON.stringify({ audit: entry.action, entityId: entry.entityId }));
    try {
      await this.prisma.auditLog.create({
        data: {
          companyId: entry.companyId ?? undefined,
          actorType: entry.actorType,
          actorId: entry.actorId ?? undefined,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          metadata: this.toJson(entry.metadata),
          ip: entry.ip,
          userAgent: entry.userAgent,
        },
      });
    } catch (err) {
      this.logger.warn(`Falha ao registrar AuditLog: ${(err as Error).message}`);
    }
  }

  /** Consulta paginada com filtros (uso administrativo). */
  async query(params: {
    companyId?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
    actorType?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(200, Math.max(1, params.limit ?? 50));
    const createdAt =
      params.startDate || params.endDate
        ? {
            ...(params.startDate ? { gte: new Date(params.startDate) } : {}),
            ...(params.endDate ? { lte: new Date(params.endDate) } : {}),
          }
        : undefined;

    const where = {
      ...(params.companyId ? { companyId: params.companyId } : {}),
      ...(params.action ? { action: params.action } : {}),
      ...(params.entityType ? { entityType: params.entityType } : {}),
      ...(params.entityId ? { entityId: params.entityId } : {}),
      ...(params.actorType ? { actorType: params.actorType } : {}),
      ...(createdAt ? { createdAt } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  private toJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined || value === null) return undefined;
    try {
      return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
    } catch {
      return { value: String(value) } as Prisma.InputJsonValue;
    }
  }
}
